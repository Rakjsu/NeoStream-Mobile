/**
 * Novos episódios das séries favoritas: compara o last_modified de cada
 * favorita com o snapshot salvo por conta. Primeira passada só semeia o
 * snapshot (nada "novo" no primeiro uso). Diff PURO (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getActiveAccountId } from './session'
import type { SeriesItem } from './xtream'

/** seriesId → last_modified visto por último. */
export type SeriesSnapshot = Record<string, string>

function storageKey(accountId: string): string {
    return `neostream_series_snap_${accountId}`
}

export interface NewEpisodesDiff {
    updated: SeriesItem[]
    nextSnapshot: SeriesSnapshot
}

export function diffNewEpisodes(
    favoriteIds: string[],
    series: SeriesItem[],
    snapshot: SeriesSnapshot,
): NewEpisodesDiff {
    const favorites = new Set(favoriteIds)
    const updated: SeriesItem[] = []
    const nextSnapshot: SeriesSnapshot = {}
    const seeded = Object.keys(snapshot).length > 0
    for (const show of series) {
        const id = String(show.series_id)
        if (!favorites.has(id)) continue
        const stamp = show.last_modified ?? ''
        nextSnapshot[id] = stamp
        const previous = snapshot[id]
        // Novo = carimbo mudou desde a última visita (favorita recém-adicionada
        // entra no snapshot sem alarde; snapshot vazio = primeira passada).
        if (seeded && previous !== undefined && stamp && stamp !== previous) updated.push(show)
    }
    return { updated, nextSnapshot }
}

/** Roda o diff pra conta ativa e persiste o snapshot novo. */
export async function checkNewEpisodes(series: SeriesItem[], favoriteIds: string[]): Promise<SeriesItem[]> {
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    let snapshot: SeriesSnapshot = {}
    try {
        const raw = await AsyncStorage.getItem(storageKey(accountId))
        const parsed = raw ? (JSON.parse(raw) as SeriesSnapshot) : {}
        snapshot = parsed && typeof parsed === 'object' ? parsed : {}
    } catch { /* snapshot zerado */ }
    const { updated, nextSnapshot } = diffNewEpisodes(favoriteIds, series, snapshot)
    try {
        await AsyncStorage.setItem(storageKey(accountId), JSON.stringify(nextSnapshot))
    } catch { /* best-effort */ }
    return updated
}
