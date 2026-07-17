/**
 * 🔖 Marcadores em VOD: posições salvas por conteúdo pra voltar direto na
 * cena ("gol aos 42min"). Mapa único no AsyncStorage com teto de conteúdos
 * e de marcas por conteúdo — os mais antigos saem primeiro.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface Bookmark {
    /** Posição no vídeo, em segundos. */
    t: number
    /** Quando a marca foi criada (epoch ms) — só informativo. */
    at: number
}

const STORAGE_KEY = 'neostream_bookmarks'
const MAX_KEYS = 100
const MAX_PER_CONTENT = 20
/** Marcas a menos de 5s uma da outra viram a mesma. */
const DEDUPE_SEC = 5

async function loadMap(): Promise<Record<string, Bookmark[]>> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, Bookmark[]>
            : {}
    } catch {
        return {}
    }
}

async function saveMap(map: Record<string, Bookmark[]>): Promise<void> {
    const keys = Object.keys(map)
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_KEYS))) delete map[stale]
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch { /* best-effort */ }
}

export async function listBookmarks(key: string): Promise<Bookmark[]> {
    const map = await loadMap()
    return (map[key] ?? []).filter(mark => Number.isFinite(mark?.t)).sort((a, b) => a.t - b.t)
}

export async function addBookmark(key: string, seconds: number, nowMs: number): Promise<Bookmark[]> {
    const map = await loadMap()
    const rounded = Math.max(0, Math.round(seconds))
    const current = (map[key] ?? []).filter(mark => Math.abs(mark.t - rounded) >= DEDUPE_SEC)
    current.push({ t: rounded, at: nowMs })
    map[key] = current.sort((a, b) => a.t - b.t).slice(0, MAX_PER_CONTENT)
    await saveMap(map)
    return map[key]
}

export async function removeBookmark(key: string, seconds: number): Promise<Bookmark[]> {
    const map = await loadMap()
    map[key] = (map[key] ?? []).filter(mark => mark.t !== seconds)
    if (map[key].length === 0) delete map[key]
    await saveMap(map)
    return map[key] ?? []
}

/** MM:SS (ou H:MM:SS acima de 1h) pra rotular a marca (PURO). */
export function fmtBookmark(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
