/**
 * Buscas recentes: chips na aba Busca quando ela está vazia. Gravamos quando
 * o usuário TOCA num resultado (sinal de que a busca prestou), não a cada
 * tecla. A dedup é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isGuestProfile } from './profiles'

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
    if (isGuestProfile()) return // convidado não deixa rastro
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

/** Tamanho do prefixo comum (pra ranquear sugestões) (PURO). */
function commonPrefixLen(a: string, b: string): number {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    return i
}

/**
 * "Você quis dizer": busca seca sugere títulos do catálogo que começam
 * parecido (no texto inteiro ou em alguma palavra) (PURO).
 */
export function suggestTitles(query: string, names: string[], max = 5): string[] {
    const q = query.trim().toLowerCase()
    if (q.length < 3) return []
    const prefix = q.slice(0, 3)
    const seen = new Set<string>()
    const scored: { name: string; score: number }[] = []
    for (const name of names) {
        const lower = name.toLowerCase()
        if (seen.has(lower)) continue
        let score = 0
        if (lower.startsWith(prefix)) score = commonPrefixLen(lower, q)
        else {
            for (const word of lower.split(/\s+/)) {
                if (word.startsWith(prefix)) score = Math.max(score, commonPrefixLen(word, q))
            }
        }
        if (score >= 3) {
            seen.add(lower)
            scored.push({ name, score })
        }
    }
    return scored
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
        .slice(0, max)
        .map(entry => entry.name)
}
