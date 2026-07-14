/**
 * EPG pra listas M3U via XMLTV (o `url-tvg` do cabeçalho da playlist).
 *
 * Parser PURO e de uma passada só: varre os <programme> e guarda apenas o
 * "agora" e o "a seguir" de cada canal — nada da grade inteira fica em
 * memória, então aguenta arquivos grandes sem explodir o aparelho.
 */
import type { EpgProgram, NowNext } from './xtream'

/** `20260711123000 +0000` (ou sem fuso → UTC) → epoch ms; NaN se inválido. */
export function parseXmltvDate(value: string): number {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/.exec(value.trim())
    if (!match) return NaN
    const [, year, month, day, hour, minute, second, sign, tzHour, tzMin] = match
    let ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? '0'))
    if (sign) {
        const offset = (Number(tzHour) * 60 + Number(tzMin)) * 60000
        ms += sign === '+' ? -offset : offset
    }
    return ms
}

/** Nome de canal comparável: minúsculo, sem sufixo de qualidade, espaços colapsados. */
export function normalizeChannelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\b(fhd|uhd|hd|sd|4k|h265|hevc)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export interface XmltvGuide {
    /** id do canal no XMLTV → agora/a seguir. */
    byChannelId: Map<string, NowNext>
    /** id do canal → grade (12h atrás a 24h à frente, teto por canal). */
    scheduleByChannelId: Map<string, EpgProgram[]>
    /** nome normalizado (display-name) → id, pro fallback quando falta tvg-id. */
    idByName: Map<string, string>
}

/** Teto de programas guardados por canal — grade cabe na memória do celular. */
const MAX_SCHEDULE_PER_CHANNEL = 100

interface Candidate {
    title: string
    startMs: number
    endMs: number
    desc?: string
}

/** Desescapa as entidades básicas e numéricas que aparecem em títulos. */
function unescapeXml(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
}

const PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g
const CHANNEL_RE = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g

function attribute(attrs: string, name: string): string {
    const match = new RegExp(`${name}="([^"]*)"`).exec(attrs)
    return match?.[1] ?? ''
}

/**
 * Uma passada no XMLTV → agora/a seguir por canal (janela de 24h à frente;
 * programas já encerrados são descartados na hora).
 */
export function parseXmltv(xml: string, nowMs: number): XmltvGuide {
    const idByName = new Map<string, string>()
    for (const match of xml.matchAll(CHANNEL_RE)) {
        const id = attribute(match[1], 'id')
        if (!id) continue
        for (const nameMatch of match[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)) {
            const key = normalizeChannelName(unescapeXml(nameMatch[1]))
            if (key && !idByName.has(key)) idByName.set(key, id)
        }
    }

    const pastLimit = nowMs - 12 * 3600_000
    const horizon = nowMs + 24 * 3600_000
    const nowBy = new Map<string, Candidate>()
    const nextBy = new Map<string, Candidate>()
    const scheduleByChannelId = new Map<string, EpgProgram[]>()
    for (const match of xml.matchAll(PROGRAMME_RE)) {
        const attrs = match[1]
        const channel = attribute(attrs, 'channel')
        if (!channel) continue
        const startMs = parseXmltvDate(attribute(attrs, 'start'))
        const endMs = parseXmltvDate(attribute(attrs, 'stop'))
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
        if (endMs <= pastLimit || startMs > horizon) continue
        const title = unescapeXml(/<title[^>]*>([^<]*)<\/title>/.exec(match[2])?.[1]?.trim() ?? '')
        if (!title) continue
        const candidate: Candidate = { title, startMs, endMs }
        const schedule = scheduleByChannelId.get(channel) ?? []
        if (schedule.length < MAX_SCHEDULE_PER_CHANNEL) {
            schedule.push(candidate)
            scheduleByChannelId.set(channel, schedule)
        }
        if (endMs <= nowMs) continue // já encerrou: só vale pra grade (replay)
        // Sinopse SÓ no agora/a seguir (cópia própria — a grade continua leve).
        const desc = unescapeXml(/<desc[^>]*>([^<]*)<\/desc>/.exec(match[2])?.[1]?.trim() ?? '').slice(0, 240)
        const enriched: Candidate = desc ? { ...candidate, desc } : candidate
        if (startMs <= nowMs) {
            // Passando agora — em caso de sobreposição, ganha o que começou depois.
            const current = nowBy.get(channel)
            if (!current || startMs > current.startMs) nowBy.set(channel, enriched)
        } else {
            const upcoming = nextBy.get(channel)
            if (!upcoming || startMs < upcoming.startMs) nextBy.set(channel, enriched)
        }
    }

    const byChannelId = new Map<string, NowNext>()
    for (const id of new Set([...nowBy.keys(), ...nextBy.keys()])) {
        byChannelId.set(id, { now: nowBy.get(id) ?? null, next: nextBy.get(id) ?? null })
    }
    for (const schedule of scheduleByChannelId.values()) schedule.sort((a, b) => a.startMs - b.startMs)
    return { byChannelId, scheduleByChannelId, idByName }
}

/** Agora/a seguir de um canal — tenta o tvg-id, depois o nome. */
export function lookupNowNext(guide: XmltvGuide, tvgId: string, channelName: string): NowNext {
    const direct = tvgId ? guide.byChannelId.get(tvgId) : undefined
    if (direct) return direct
    const id = guide.idByName.get(normalizeChannelName(channelName))
    return (id && guide.byChannelId.get(id)) || { now: null, next: null }
}

/** Grade do dia de um canal — mesma resolução tvg-id → nome. */
export function lookupDaySchedule(guide: XmltvGuide, tvgId: string, channelName: string): EpgProgram[] {
    const direct = tvgId ? guide.scheduleByChannelId.get(tvgId) : undefined
    if (direct) return direct
    const id = guide.idByName.get(normalizeChannelName(channelName))
    return (id && guide.scheduleByChannelId.get(id)) || []
}
