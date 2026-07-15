/**
 * Capítulos embutidos no ARQUIVO de vídeo (MP4 `chpl` / MKV Chapters), lidos
 * por HTTP Range — só cabeçalhos e índice, nunca o vídeo inteiro. É a base do
 * "Pular abertura": se o encoder marcou um capítulo curto no começo, o botão
 * pula pro fim EXATO dele (dado real do arquivo, não chute de segundos).
 * Sem capítulos no arquivo (live/TS/HLS sempre), nada aparece.
 */

export interface Chapter {
    title: string
    startSec: number
}

export interface IntroChapter {
    startSec: number
    endSec: number
}

const INTRO_NAME = /\b(intro|opening|abertura|op)\b|cr[eé]ditos iniciais/i

/**
 * Capítulo com cara de abertura (PURO): nome sugestivo em qualquer ponto dos
 * primeiros 10 min, OU capítulo curto (15s–3min) começando nos primeiros 2 min.
 * O fim vem do início do capítulo seguinte — sem próximo, não dá pra pular.
 */
export function findIntroChapter(chapters: Chapter[], durationSec = Infinity): IntroChapter | null {
    const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec)
    for (let i = 0; i < sorted.length; i++) {
        const start = sorted[i].startSec
        const end = i + 1 < sorted.length ? sorted[i + 1].startSec : durationSec
        if (!Number.isFinite(end)) continue
        const length = end - start
        if (length < 15 || length > 240) continue
        if (INTRO_NAME.test(sorted[i].title)) {
            if (start <= 600) return { startSec: start, endSec: end }
            continue
        }
        if (start <= 120 && length <= 180) return { startSec: start, endSec: end }
    }
    return null
}

const be32 = (bytes: Uint8Array, offset: number) =>
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
const be64 = (bytes: Uint8Array, offset: number) => be32(bytes, offset) * 4294967296 + be32(bytes, offset + 4)

// Hermes não garante TextDecoder — decodificação UTF-8 própria (títulos curtos).
function utf8(bytes: Uint8Array): string {
    let out = ''
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i]
        if (byte < 0x80) { out += String.fromCharCode(byte); continue }
        if (byte >= 0xc0 && byte < 0xe0 && i + 1 < bytes.length) {
            out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++i] & 0x3f))
            continue
        }
        if (byte >= 0xe0 && byte < 0xf0 && i + 2 < bytes.length) {
            out += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
            i += 2
            continue
        }
        if (byte >= 0xf0) i += 3 // fora do BMP — raro em título de capítulo
    }
    return out
}

/** Caminha boxes MP4 irmãos dentro de [start,end) e acha o payload do tipo pedido. */
function findBox(bytes: Uint8Array, start: number, end: number, type: string): { start: number; end: number } | null {
    let offset = start
    while (offset + 8 <= end) {
        let size = be32(bytes, offset)
        const name = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
        let header = 8
        if (size === 1) {
            if (offset + 16 > end) return null
            size = be64(bytes, offset + 8)
            header = 16
        } else if (size === 0) {
            size = end - offset
        }
        if (size < header) return null
        if (name === type) return { start: offset + header, end: Math.min(offset + size, end) }
        offset += size
    }
    return null
}

/** Capítulos Nero (moov→udta→chpl) de um buffer que contenha o moov (PURO). */
export function parseMp4Chapters(bytes: Uint8Array): Chapter[] {
    const moov = findBox(bytes, 0, bytes.length, 'moov') ?? { start: 0, end: bytes.length }
    const udta = findBox(bytes, moov.start, moov.end, 'udta')
    if (!udta) return []
    const chpl = findBox(bytes, udta.start, udta.end, 'chpl')
    if (!chpl || chpl.start + 5 > chpl.end) return []
    const version = bytes[chpl.start]
    let offset = chpl.start + 4 // version + flags
    if (version === 1) offset += 4 // reserved (é o que o ffmpeg escreve)
    if (offset >= chpl.end) return []
    const count = bytes[offset]
    offset += 1
    const chapters: Chapter[] = []
    for (let i = 0; i < count && offset + 9 <= chpl.end; i++) {
        const startSec = be64(bytes, offset) / 10_000_000 // unidades de 100 ns
        const titleLen = bytes[offset + 8]
        offset += 9
        chapters.push({ title: utf8(bytes.subarray(offset, Math.min(offset + titleLen, chpl.end))), startSec })
        offset += titleLen
    }
    return chapters
}

/** vint EBML → [valor, tamanho]; pro ID os bits de marcação ficam no valor. */
function readVint(bytes: Uint8Array, offset: number, keepMarker: boolean): [number, number] | null {
    const first = bytes[offset]
    if (first === undefined || first === 0) return null
    let length = 1
    for (let mask = 0x80; !(first & mask); mask >>= 1) length++
    if (length > 8 || offset + length > bytes.length) return null
    let value = keepMarker ? first : first & (0xff >> length)
    for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i]
    return [value, length]
}

function walkEbml(
    bytes: Uint8Array,
    start: number,
    end: number,
    visit: (id: number, dataStart: number, dataEnd: number) => void,
): void {
    let offset = start
    while (offset < end) {
        const id = readVint(bytes, offset, true)
        if (!id) return
        const size = readVint(bytes, offset + id[1], false)
        if (!size) return
        const dataStart = offset + id[1] + size[1]
        const dataEnd = Math.min(dataStart + size[0], end)
        visit(id[0], dataStart, dataEnd)
        // Elemento vazio ainda avança (o cabeçalho foi consumido) — sem loop.
        offset = Math.max(dataStart, dataEnd)
    }
}

/** Capítulos Matroska (Chapters→EditionEntry→ChapterAtom) num buffer da cabeça (PURO). */
export function parseMkvChapters(bytes: Uint8Array): Chapter[] {
    // O elemento Chapters (0x1043A770) costuma vir antes dos clusters.
    let index = -1
    for (let i = 0; i + 4 <= bytes.length; i++) {
        if (bytes[i] === 0x10 && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xa7 && bytes[i + 3] === 0x70) {
            index = i
            break
        }
    }
    if (index < 0) return []
    const size = readVint(bytes, index + 4, false)
    if (!size) return []
    const dataStart = index + 4 + size[1]
    const dataEnd = Math.min(dataStart + size[0], bytes.length)
    const chapters: Chapter[] = []
    walkEbml(bytes, dataStart, dataEnd, (editionId, editionStart, editionEnd) => {
        if (editionId !== 0x45b9) return // EditionEntry
        walkEbml(bytes, editionStart, editionEnd, (atomId, atomStart, atomEnd) => {
            if (atomId !== 0xb6) return // ChapterAtom
            let startSec = -1
            let title = ''
            walkEbml(bytes, atomStart, atomEnd, (id, start, end) => {
                if (id === 0x91) { // ChapterTimeStart (nanossegundos)
                    let value = 0
                    for (let i = start; i < end; i++) value = value * 256 + bytes[i]
                    startSec = value / 1e9
                }
                if (id === 0x80) { // ChapterDisplay
                    walkEbml(bytes, start, end, (childId, childStart, childEnd) => {
                        if (childId === 0x85) title = utf8(bytes.subarray(childStart, childEnd)) // ChapString
                    })
                }
            })
            if (startSec >= 0) chapters.push({ title, startSec })
        })
    })
    return chapters
}

const HEAD_BYTES = 2 * 1024 * 1024
const MAX_MOOV = 8 * 1024 * 1024

// Só 206 vale: um 200 aqui significaria baixar o FILME inteiro pra ler o índice.
async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array | null> {
    try {
        const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
        if (response.status !== 206) return null
        return new Uint8Array(await response.arrayBuffer())
    } catch {
        return null
    }
}

/** Melhor esforço: capítulos de uma URL http(s) de VOD. [] em qualquer falha. */
export async function fetchChapters(url: string): Promise<Chapter[]> {
    if (!/^https?:\/\//i.test(url) || /\.m3u8(\?|$)/i.test(url)) return []
    const head = await fetchRange(url, 0, HEAD_BYTES - 1)
    if (!head || head.length < 12) return []
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
        return parseMkvChapters(head)
    }
    // MP4: pula de box em box top-level até achar o moov (que pode estar no fim).
    let offset = 0
    for (let hop = 0; hop < 12; hop++) {
        const header = offset + 16 <= head.length
            ? head.subarray(offset, offset + 16)
            : await fetchRange(url, offset, offset + 15)
        if (!header || header.length < 8) return []
        let size = be32(header, 0)
        const name = String.fromCharCode(header[4], header[5], header[6], header[7])
        if (size === 1 && header.length >= 16) size = be64(header, 8)
        if (size < 8) return []
        if (name === 'moov') {
            if (size > MAX_MOOV) return []
            const moov = offset + size <= head.length
                ? head.subarray(offset, offset + size)
                : await fetchRange(url, offset, offset + size - 1)
            return moov ? parseMp4Chapters(moov) : []
        }
        if (!/^[\x20-\x7e]{4}$/.test(name)) return [] // não é MP4
        offset += size
    }
    return []
}
