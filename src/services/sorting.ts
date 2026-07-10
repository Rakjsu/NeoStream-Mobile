/** Ordenação das grades de catálogo (PURO, testável). */

export type SortMode = 'default' | 'recent' | 'az' | 'rating'

export const SORT_LABELS: Record<SortMode, string> = {
    default: 'Padrão',
    recent: 'Recentes',
    az: 'A–Z',
    rating: 'Nota',
}

const ORDER: SortMode[] = ['default', 'recent', 'az', 'rating']

/** O botão de ordenar cicla os modos. */
export function nextSortMode(mode: SortMode): SortMode {
    return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
}

const toNumber = (value: string | number | undefined) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

/**
 * Ordena sem mutar. `addedOf` extrai o epoch de "adicionado em" (added no
 * VOD, last_modified nas séries). 'default' preserva a ordem do provedor.
 */
export function sortCatalog<T extends { name: string; rating?: string | number }>(
    list: T[],
    mode: SortMode,
    addedOf: (item: T) => string | undefined,
): T[] {
    if (mode === 'default') return list
    const copy = [...list]
    if (mode === 'recent') return copy.sort((a, b) => toNumber(addedOf(b)) - toNumber(addedOf(a)))
    if (mode === 'az') return copy.sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    return copy.sort((a, b) => toNumber(b.rating) - toNumber(a.rating))
}
