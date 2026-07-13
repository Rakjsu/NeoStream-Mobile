/**
 * Favoritos por tipo (canal/filme/série), salvos no aparelho. O toggle é
 * PURO (testável); load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { onProfileSwitch, profileKey } from './profiles'

export type FavoriteKind = 'live' | 'movie' | 'series'

export type Favorites = Record<FavoriteKind, string[]>

const STORAGE_KEY = 'neostream_favorites'

export function emptyFavorites(): Favorites {
    return { live: [], movie: [], series: [] }
}

/** Liga/desliga um id na lista do tipo (PURO — devolve um novo objeto). */
export function toggleFavorite(favorites: Favorites, kind: FavoriteKind, id: string): Favorites {
    const list = favorites[kind] ?? []
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id]
    return { ...favorites, [kind]: next }
}

export function isFavorite(favorites: Favorites, kind: FavoriteKind, id: string): boolean {
    return (favorites[kind] ?? []).includes(id)
}

// ------------------------------------------------------------- persistência --

let cache: Favorites | null = null

export async function loadFavorites(): Promise<Favorites> {
    if (cache) return cache
    try {
        const raw = await AsyncStorage.getItem(profileKey(STORAGE_KEY))
        const parsed = raw ? (JSON.parse(raw) as Partial<Favorites>) : null
        cache = { ...emptyFavorites(), ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    } catch {
        cache = emptyFavorites()
    }
    return cache
}

export async function persistToggle(kind: FavoriteKind, id: string): Promise<Favorites> {
    const current = await loadFavorites()
    cache = toggleFavorite(current, kind, id)
    try {
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(cache))
    } catch { /* best-effort */ }
    return cache
}

/** Move um favorito uma posição pra cima/baixo (PURO — ordem personalizada). */
export function moveFavorite(favorites: Favorites, kind: FavoriteKind, id: string, dir: -1 | 1): Favorites {
    const list = [...(favorites[kind] ?? [])]
    const from = list.indexOf(id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= list.length) return favorites
    list[from] = list[to]
    list[to] = id
    return { ...favorites, [kind]: list }
}

export async function persistMove(kind: FavoriteKind, id: string, dir: -1 | 1): Promise<Favorites> {
    const current = await loadFavorites()
    cache = moveFavorite(current, kind, id, dir)
    try {
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(cache))
    } catch { /* best-effort */ }
    return cache
}

/** Restauração de backup: substitui tudo (valida o formato antes). */
export async function restoreFavorites(favorites: Favorites): Promise<void> {
    const clean = { ...emptyFavorites() }
    for (const kind of ['live', 'movie', 'series'] as const) {
        const list = favorites?.[kind]
        clean[kind] = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
    }
    cache = clean
    try {
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(clean))
    } catch { /* best-effort */ }
}

/** Só pra testes/logout. */
export function resetFavoritesCache(): void {
    cache = null
}

// Favoritos são por perfil — trocar de perfil zera o cache.
onProfileSwitch(resetFavoritesCache)
