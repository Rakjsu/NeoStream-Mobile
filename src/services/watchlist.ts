/**
 * "Minha lista": o que o usuário quer ver depois (bookmark), separado dos
 * favoritos ("gosto"). Toggle e consulta são PUROS; load/save no AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface WatchItem {
    kind: 'movie' | 'series'
    id: string
    name: string
    cover: string
    container?: string
    addedAt: number
}

const STORAGE_KEY = 'neostream_watchlist'
const MAX_ITEMS = 100

/** Adiciona no INÍCIO (mais novo primeiro) ou remove se já está (PURO). */
export function toggleItem(list: WatchItem[], item: WatchItem): WatchItem[] {
    if (hasItem(list, item.kind, item.id)) {
        return list.filter(entry => !(entry.kind === item.kind && entry.id === item.id))
    }
    return [item, ...list].slice(0, MAX_ITEMS)
}

export function hasItem(list: WatchItem[], kind: WatchItem['kind'], id: string): boolean {
    return list.some(entry => entry.kind === kind && entry.id === id)
}

export async function loadWatchlist(): Promise<WatchItem[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((item): item is WatchItem =>
                !!item && typeof (item as WatchItem).id === 'string' && typeof (item as WatchItem).name === 'string')
            : []
    } catch {
        return []
    }
}

/** Restauração de backup. */
export async function restoreWatchlist(list: WatchItem[]): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list.slice(0, MAX_ITEMS) : []))
    } catch { /* best-effort */ }
}

/** Alterna o item e devolve a lista nova (a tela usa pro estado do botão). */
export async function toggleWatchlist(item: WatchItem): Promise<WatchItem[]> {
    const next = toggleItem(await loadWatchlist(), item)
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* best-effort */ }
    return next
}
