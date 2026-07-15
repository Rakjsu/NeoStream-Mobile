/**
 * Agrupador de variantes de canal: listas IPTV triplicam tudo em
 * "Globo FHD / Globo HD / Globo SD". Aqui elas viram UM card por canal, com a
 * melhor qualidade como padrão e as demais acessíveis pelo seletor. Tudo PURO
 * — reusa a normalização de nome do XMLTV (que já apaga os sufixos).
 */
import type { LiveChannel } from './xtream'
import { normalizeChannelName } from './xmltv'

const QUALITY_RANK: [RegExp, number][] = [
    [/\b(uhd|4k)\b/i, 4],
    [/\bfull\s?hd\b|\bfhd\b/i, 3],
    [/\bhd\b|\bh265\b|\bhevc\b/i, 2],
    [/\bsd\b/i, 1],
]

/** Peso da qualidade pelo nome (0 = sem marcação — perde só pro SD marcado não). */
export function qualityRank(name: string): number {
    for (const [pattern, rank] of QUALITY_RANK) {
        if (pattern.test(name)) return rank
    }
    return 0
}

export interface GroupedChannels {
    /** Um representante (melhor qualidade) por canal, na ordem original. */
    groups: LiveChannel[]
    /** id do representante → TODAS as variantes (só quando há mais de uma). */
    variantsOf: Map<string, LiveChannel[]>
}

/** Agrupa por nome-base preservando a ordem da primeira aparição (PURO). */
export function groupChannelVariants(channels: LiveChannel[]): GroupedChannels {
    const byBase = new Map<string, LiveChannel[]>()
    const order: string[] = []
    for (const channel of channels) {
        const base = normalizeChannelName(channel.name)
        const bucket = byBase.get(base)
        if (bucket) {
            bucket.push(channel)
        } else {
            byBase.set(base, [channel])
            order.push(base)
        }
    }
    const groups: LiveChannel[] = []
    const variantsOf = new Map<string, LiveChannel[]>()
    for (const base of order) {
        const bucket = byBase.get(base) ?? []
        const best = [...bucket].sort((a, b) => qualityRank(b.name) - qualityRank(a.name))[0]
        groups.push(best)
        if (bucket.length > 1) variantsOf.set(String(best.stream_id), bucket)
    }
    return { groups, variantsOf }
}
