/**
 * Proporção do player lembrada por conteúdo (paridade com o desktop):
 * conter (barras) → preencher (corta) → esticar. Mapa único no AsyncStorage
 * com teto — canais e VODs antigos saem sozinhos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type AspectMode = 'contain' | 'cover' | 'fill'

export const ASPECT_MODES: AspectMode[] = ['contain', 'cover', 'fill']

const STORAGE_KEY = 'neostream_aspect_modes'
const MAX_KEYS = 200

export function nextAspect(current: AspectMode): AspectMode {
    return ASPECT_MODES[(ASPECT_MODES.indexOf(current) + 1) % ASPECT_MODES.length]
}

async function loadMap(): Promise<Record<string, AspectMode>> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Record<string, AspectMode>) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function getAspect(key: string): Promise<AspectMode> {
    const map = await loadMap()
    const value = map[key]
    return ASPECT_MODES.includes(value) ? value : 'contain'
}

export async function setAspect(key: string, mode: AspectMode): Promise<void> {
    const map = await loadMap()
    map[key] = mode
    const keys = Object.keys(map)
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_KEYS))) delete map[stale]
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch { /* best-effort */ }
}
