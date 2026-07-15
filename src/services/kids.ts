/**
 * Modo infantil: com o controle parental ativo, trava as Configurações atrás
 * do PIN — dá pra entregar o aparelho pra criança sem medo de mexerem no app.
 * O filtro de categorias em si é do parental; aqui vive só o interruptor.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { allowedCategoryIds, listBlockedCategories, loadParental, withoutBlocked } from './parental'
import type { Category } from './xtream'

const STORAGE_KEY = 'neostream_kids_mode'
const CATS_KEY = 'neostream_kids_categories'

let cache: boolean | null = null
let catsCache: string[] | null = null

/** Ids das categorias liberadas pelo NOME (PURO; lista vazia = sem whitelist). */
export function whitelistCategoryIds(categories: Category[], names: string[]): Set<string> | null {
    if (names.length === 0) return null
    const wanted = new Set(names.map(name => name.toLowerCase()))
    return new Set(categories
        .filter(category => wanted.has(category.category_name.toLowerCase()))
        .map(category => category.category_id))
}

/** Interseção de filtros (null = sem restrição daquele lado) (PURO). */
export function intersectAllowed(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
    if (!a) return b
    if (!b) return a
    return new Set([...a].filter(id => b.has(id)))
}

/** Nomes de categoria liberados pro modo infantil (vale pras 3 listas). */
export async function listKidsCategories(): Promise<string[]> {
    if (catsCache) return catsCache
    try {
        const raw = await AsyncStorage.getItem(CATS_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        catsCache = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
    } catch {
        catsCache = []
    }
    return catsCache
}

export async function toggleKidsCategory(name: string): Promise<string[]> {
    const list = await listKidsCategories()
    catsCache = list.includes(name) ? list.filter(item => item !== name) : [...list, name]
    try {
        await AsyncStorage.setItem(CATS_KEY, JSON.stringify(catsCache))
    } catch { /* best-effort */ }
    return catsCache
}

/**
 * Filtro efetivo das telas: parental (bloqueia adulto) ∩ whitelist do modo
 * infantil (quando ligado e configurada). Fora do modo infantil = só parental.
 */
export async function guardedCategoryIds(categories: Category[], parentalEnabled: boolean): Promise<Set<string> | null> {
    let base = allowedCategoryIds(categories, parentalEnabled)
    // Bloqueios manuais valem sempre que o parental está ligado.
    if ((await loadParental()).enabled) {
        base = withoutBlocked(base, categories, await listBlockedCategories())
    }
    if (!(await isKidsMode())) return base
    return intersectAllowed(base, whitelistCategoryIds(categories, await listKidsCategories()))
}

export async function isKidsMode(): Promise<boolean> {
    if (cache !== null) return cache
    try {
        cache = (await AsyncStorage.getItem(STORAGE_KEY)) === '1'
    } catch {
        cache = false
    }
    return cache
}

export async function setKidsMode(on: boolean): Promise<void> {
    cache = on
    try {
        if (on) await AsyncStorage.setItem(STORAGE_KEY, '1')
        else await AsyncStorage.removeItem(STORAGE_KEY)
    } catch { /* best-effort */ }
}

/** Só pra testes. */
export function resetKidsCache(): void {
    cache = null
    catsCache = null
}

// ------------------------------------------------------ limite de tempo --

const LIMIT_KEY = 'neostream_kids_limit_min'

/** Limite diário do modo infantil em minutos (0 = desligado). */
export async function getKidsTimeLimit(): Promise<number> {
    try {
        const raw = await AsyncStorage.getItem(LIMIT_KEY)
        const minutes = Number(raw)
        return Number.isFinite(minutes) && minutes > 0 ? minutes : 0
    } catch {
        return 0
    }
}

export async function setKidsTimeLimit(minutes: number): Promise<void> {
    try {
        if (minutes > 0) await AsyncStorage.setItem(LIMIT_KEY, String(minutes))
        else await AsyncStorage.removeItem(LIMIT_KEY)
    } catch { /* best-effort */ }
}

// --------------------------------------------------- janela de horário --

const WINDOW_KEY = 'neostream_kids_window'

export interface KidsWindow {
    startHour: number
    endHour: number
}

/** Janela de horário do modo infantil (null = sem janela, vale o dia todo). */
export async function getKidsWindow(): Promise<KidsWindow | null> {
    try {
        const raw = await AsyncStorage.getItem(WINDOW_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<KidsWindow>) : null
        return parsed && Number.isFinite(parsed.startHour) && Number.isFinite(parsed.endHour)
            ? { startHour: Number(parsed.startHour), endHour: Number(parsed.endHour) }
            : null
    } catch {
        return null
    }
}

export async function setKidsWindow(window: KidsWindow | null): Promise<void> {
    try {
        if (window) await AsyncStorage.setItem(WINDOW_KEY, JSON.stringify(window))
        else await AsyncStorage.removeItem(WINDOW_KEY)
    } catch { /* best-effort */ }
}

/** Fora da janela? (PURO) — [start,end) e janela cruzando a meia-noite valem. */
export function isOutsideKidsWindow(hour: number, window: KidsWindow | null): boolean {
    if (!window || window.startHour === window.endHour) return false
    if (window.startHour < window.endHour) return hour < window.startHour || hour >= window.endHour
    return hour >= window.endHour && hour < window.startHour
}
