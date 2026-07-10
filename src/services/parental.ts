/**
 * Controle parental: oculta categorias adultas das abas e da busca, protegido
 * por PIN. A classificação é PURA (testável); load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Category } from './xtream'

export interface ParentalState {
    enabled: boolean
    pin: string
}

const STORAGE_KEY = 'neostream_parental'

// Padrões conservadores: "sexo" pega, "Sexta" não; "+18" pega, "2018" não.
const ADULT_PATTERNS = [
    /adult/i, /\bxxx\b/i, /porn/i, /er[oó]tic/i, /\bsexo\b/i, /sexy/i,
    /onlyfans/i, /playboy/i, /\+18\b/, /\b18\s*\+/,
]

export function isAdultCategory(name: string): boolean {
    return ADULT_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * Ids de categoria permitidos. `null` = sem filtro (controle desligado) —
 * assim itens sem categoria continuam aparecendo quando não há bloqueio.
 */
export function allowedCategoryIds(categories: Category[], enabled: boolean): Set<string> | null {
    if (!enabled) return null
    return new Set(categories.filter(c => !isAdultCategory(c.category_name)).map(c => c.category_id))
}

/** PIN de 4 dígitos exatos. */
export function isValidPin(pin: string): boolean {
    return /^\d{4}$/.test(pin)
}

// ------------------------------------------------------------- persistência --

let cache: ParentalState | null = null

export async function loadParental(): Promise<ParentalState> {
    if (cache) return cache
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<ParentalState>) : null
        cache = { enabled: parsed?.enabled === true, pin: typeof parsed?.pin === 'string' ? parsed.pin : '' }
    } catch {
        cache = { enabled: false, pin: '' }
    }
    return cache
}

export async function enableParental(pin: string): Promise<boolean> {
    if (!isValidPin(pin)) return false
    cache = { enabled: true, pin }
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* best-effort */ }
    return true
}

/** Desligar exige o PIN correto. */
export async function disableParental(pin: string): Promise<boolean> {
    const state = await loadParental()
    if (!state.enabled) return true
    if (pin !== state.pin) return false
    cache = { enabled: false, pin: '' }
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* best-effort */ }
    return true
}

/** Só pra testes. */
export function resetParentalCache(): void {
    cache = null
}
