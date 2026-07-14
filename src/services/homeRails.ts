/**
 * Rails da Home configuráveis: quais aparecem e em que ordem. O "Continuar
 * assistindo" é fixo no topo (não entra aqui). Helpers PUROS (testáveis);
 * só load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export const RAIL_KEYS = [
    'watchlist', 'downloads', 'freshEpisodes', 'favPosters', 'because', 'praAgora',
    'recentChannels', 'favChannels', 'newMovies', 'newSeries',
] as const
export type RailKey = typeof RAIL_KEYS[number]

export interface RailPrefs {
    /** Ordem de exibição (chaves desconhecidas são descartadas na leitura). */
    order: RailKey[]
    hidden: RailKey[]
}

const STORAGE_KEY = 'neostream_home_rails'

export function defaultRailPrefs(): RailPrefs {
    return { order: [...RAIL_KEYS], hidden: [] }
}

/** Ordem completa (PURO): a salva primeiro, chaves novas de updates no fim. */
export function railOrderAll(prefs: RailPrefs): RailKey[] {
    const known = prefs.order.filter(key => (RAIL_KEYS as readonly string[]).includes(key))
    return [...known, ...RAIL_KEYS.filter(key => !known.includes(key))]
}

/** Ordem final da Home (PURO): a completa menos as escondidas. */
export function orderedRails(prefs: RailPrefs): RailKey[] {
    return railOrderAll(prefs).filter(key => !prefs.hidden.includes(key))
}

/** Move uma rail uma posição pra cima/baixo (PURO). */
export function moveRail(prefs: RailPrefs, key: RailKey, dir: -1 | 1): RailPrefs {
    const order = railOrderAll(prefs)
    const from = order.indexOf(key)
    const to = from + dir
    if (from < 0 || to < 0 || to >= order.length) return prefs
    order[from] = order[to]
    order[to] = key
    return { ...prefs, order }
}

/** Esconde/mostra uma rail (PURO). */
export function toggleRail(prefs: RailPrefs, key: RailKey): RailPrefs {
    const hidden = prefs.hidden.includes(key)
        ? prefs.hidden.filter(k => k !== key)
        : [...prefs.hidden, key]
    return { ...prefs, hidden }
}

export async function loadRailPrefs(): Promise<RailPrefs> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<RailPrefs>) : null
        const valid = (list: unknown): RailKey[] =>
            Array.isArray(list) ? list.filter((k): k is RailKey => (RAIL_KEYS as readonly string[]).includes(k as string)) : []
        return {
            order: parsed?.order ? valid(parsed.order) : [...RAIL_KEYS],
            hidden: valid(parsed?.hidden),
        }
    } catch {
        return defaultRailPrefs()
    }
}

export async function saveRailPrefs(prefs: RailPrefs): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch { /* best-effort */ }
}
