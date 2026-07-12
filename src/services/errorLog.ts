/**
 * Últimos erros (locais): o ErrorBoundary grava aqui; a seção Sobre mostra.
 * "Deu erro" vira texto compartilhável. Buffer PURO (testável), cap fixo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface LoggedError {
    at: number
    message: string
}

const STORAGE_KEY = 'neostream_error_log'
const MAX_ERRORS = 5

/** Novo erro no topo, cap fixo (PURO). */
export function pushError(list: LoggedError[], entry: LoggedError, max = MAX_ERRORS): LoggedError[] {
    return [entry, ...list].slice(0, max)
}

export async function listErrors(): Promise<LoggedError[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((e): e is LoggedError => !!e && typeof (e as LoggedError).message === 'string')
            : []
    } catch {
        return []
    }
}

export async function recordError(message: string, at = Date.now()): Promise<void> {
    try {
        const list = pushError(await listErrors(), { at, message: message.slice(0, 500) })
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch { /* best-effort */ }
}

export async function clearErrors(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY)
    } catch { /* best-effort */ }
}
