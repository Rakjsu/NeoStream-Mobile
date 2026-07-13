/**
 * Rail "Porque você assistiu…": cruza os títulos mais assistidos (Seu uso)
 * com o catálogo e recomenda vizinhos da mesma categoria. Tudo PURO — a Home
 * só injeta os dados e renderiza.
 */
import type { TopTitle } from './usage'

export interface RecCandidate {
    id: string
    name: string
    kind: 'movie' | 'series'
    /** category_id do provedor ('' quando o item não tem). */
    category: string
    cover: string
    container?: string
}

export interface Recommendation {
    /** Nome exato do item âncora ("Porque você assistiu {anchor}"). */
    anchor: string
    items: RecCandidate[]
}

/** Nome comparável: minúsculo e espaços colapsados (títulos vêm do player). */
export function normalizeTitle(name: string): string {
    return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Percorre os mais assistidos em ordem e devolve a primeira recomendação que
 * rende pelo menos `minItems` vizinhos — âncora sem categoria não recomenda.
 */
export function becauseYouWatched(
    tops: TopTitle[],
    candidates: RecCandidate[],
    max = 15,
    minItems = 3,
): Recommendation | null {
    for (const top of tops) {
        const wanted = normalizeTitle(top.title)
        if (!wanted) continue
        const anchor = candidates.find(candidate => normalizeTitle(candidate.name) === wanted)
        if (!anchor?.category) continue
        const items = candidates
            .filter(candidate => candidate.kind === anchor.kind
                && candidate.category === anchor.category
                && candidate.id !== anchor.id)
            .slice(0, max)
        if (items.length >= minItems) return { anchor: anchor.name, items }
    }
    return null
}
