import { describe, expect, it } from 'vitest'
import { findIntroChapter, parseMkvChapters, parseMp4Chapters } from './chapters'

// ---------- construtores de bytes sintéticos ----------

function be32(value: number): number[] {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function be64(value: number): number[] {
    return [...be32(Math.floor(value / 4294967296)), ...be32(value % 4294967296)]
}

function box(type: string, payload: number[]): number[] {
    return [...be32(8 + payload.length), ...[...type].map(ch => ch.charCodeAt(0)), ...payload]
}

/** chpl no formato do ffmpeg: versão 1 + flags, reserved, count, entradas. */
function chplPayload(entries: { title: string; startSec: number }[]): number[] {
    const bytes: number[] = [1, 0, 0, 0, 0, 0, 0, 0, entries.length]
    for (const entry of entries) {
        const title = [...entry.title].map(ch => ch.charCodeAt(0))
        bytes.push(...be64(entry.startSec * 10_000_000), title.length, ...title)
    }
    return bytes
}

/** Elemento EBML com ID literal (bytes) + tamanho de 1 byte + payload. */
function ebml(idBytes: number[], payload: number[]): number[] {
    return [...idBytes, 0x80 | payload.length, ...payload]
}

// ---------- MP4 ----------

describe('parseMp4Chapters (Nero chpl)', () => {
    it('lê títulos e tempos do moov→udta→chpl', () => {
        const chpl = box('chpl', chplPayload([
            { title: 'Opening', startSec: 5 },
            { title: 'Parte 1', startSec: 95 },
        ]))
        const moov = box('moov', [...box('mvhd', [0, 0, 0, 0]), ...box('udta', chpl)])
        const file = new Uint8Array([...box('ftyp', [...'isom'].map(c => c.charCodeAt(0))), ...moov])
        expect(parseMp4Chapters(file)).toEqual([
            { title: 'Opening', startSec: 5 },
            { title: 'Parte 1', startSec: 95 },
        ])
    })

    it('sem chpl devolve vazio (e não explode com lixo)', () => {
        const moov = box('moov', box('udta', box('meta', [0, 0, 0, 0])))
        expect(parseMp4Chapters(new Uint8Array(moov))).toEqual([])
        expect(parseMp4Chapters(new Uint8Array([1, 2, 3]))).toEqual([])
    })
})

// ---------- MKV ----------

describe('parseMkvChapters (EBML)', () => {
    it('lê ChapterAtoms com tempo em ns e ChapString', () => {
        const atom = (title: string, ns: number) => ebml([0xb6], [
            ...ebml([0x91], be64(ns).slice(2)), // uint de 6 bytes basta
            ...ebml([0x80], ebml([0x85], [...title].map(ch => ch.charCodeAt(0)))),
        ])
        const edition = ebml([0x45, 0xb9], [...atom('Intro', 0), ...atom('Cena 1', 88_000_000_000)])
        const chapters = [0x10, 0x43, 0xa7, 0x70, 0x80 | edition.length, ...edition]
        const head = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0, 0, 0, 0, ...chapters])
        expect(parseMkvChapters(head)).toEqual([
            { title: 'Intro', startSec: 0 },
            { title: 'Cena 1', startSec: 88 },
        ])
    })

    it('sem elemento Chapters devolve vazio', () => {
        expect(parseMkvChapters(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x82, 0, 0]))).toEqual([])
    })
})

// ---------- heurística da abertura ----------

describe('findIntroChapter', () => {
    it('capítulo chamado Opening vence mesmo fora do comecinho', () => {
        expect(findIntroChapter([
            { title: 'Recap', startSec: 0 },
            { title: 'Opening', startSec: 210 },
            { title: 'Parte 1', startSec: 300 },
        ])).toEqual({ startSec: 210, endSec: 300 })
    })

    it('capítulo curto anônimo no início também vale', () => {
        expect(findIntroChapter([
            { title: '', startSec: 0 },
            { title: '', startSec: 90 },
        ], 2600)).toEqual({ startSec: 0, endSec: 90 })
    })

    it('capítulo 1 longo de filme NÃO vira abertura', () => {
        expect(findIntroChapter([
            { title: 'Chapter 1', startSec: 0 },
            { title: 'Chapter 2', startSec: 420 },
        ], 7200)).toBeNull()
    })

    it('último capítulo sem fim conhecido não dá pra pular', () => {
        expect(findIntroChapter([{ title: 'Opening', startSec: 10 }])).toBeNull()
    })
})
