/**
 * 🚨 Registro de tentativas ERRADAS de PIN (parental/perfil/limite kids).
 * O responsável vê o contador na seção parental dos Ajustes — se a criança
 * ficou chutando PIN, fica visível. Toque limpa o registro.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'neostream_pin_attempts'

export interface PinAttempts {
    count: number
    lastMs: number
}

export async function getPinAttempts(): Promise<PinAttempts> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<PinAttempts>) : null
        return {
            count: Number.isFinite(parsed?.count) ? Number(parsed?.count) : 0,
            lastMs: Number.isFinite(parsed?.lastMs) ? Number(parsed?.lastMs) : 0,
        }
    } catch {
        return { count: 0, lastMs: 0 }
    }
}

export async function recordPinAttempt(nowMs = Date.now()): Promise<void> {
    try {
        const current = await getPinAttempts()
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count: current.count + 1, lastMs: nowMs }))
    } catch { /* best-effort */ }
}

export async function clearPinAttempts(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY)
    } catch { /* best-effort */ }
}
