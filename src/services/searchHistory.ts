/**
 * Buscas recentes: chips na aba Busca quando ela está vazia. Gravamos quando
 * o usuário TOCA num resultado (sinal de que a busca prestou), não a cada
 * tecla. A dedup é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'neostream_search_history'
const MAX_TERMS = 8

/** Topo da lista, dedup sem caixa, teto fixo (PURO). */
export function pushSearchTerm(list: string[], term: string, max = MAX_TERMS): string[] {
    const clean = term.trim()
    if (!clean) return list
    return [clean, ...list.filter(item => item.toLowerCase() !== clean.toLowerCase())].slice(0, max)
}

export async function listSearchTerms(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
    } catch {
        return []
    }
}

export async function recordSearchTerm(term: string): Promise<void> {
    try {
        const list = pushSearchTerm(await listSearchTerms(), term)
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch { /* best-effort */ }
}

/** Restauração de backup. */
export async function restoreSearchTerms(terms: string[]): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(terms) ? terms.slice(0, MAX_TERMS) : []))
    } catch { /* best-effort */ }
}

export async function clearSearchTerms(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY)
    } catch { /* best-effort */ }
}
