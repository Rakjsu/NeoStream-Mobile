/**
 * Modo infantil: com o controle parental ativo, trava as Configurações atrás
 * do PIN — dá pra entregar o aparelho pra criança sem medo de mexerem no app.
 * O filtro de categorias em si é do parental; aqui vive só o interruptor.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'neostream_kids_mode'

let cache: boolean | null = null

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
}
