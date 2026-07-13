/**
 * Bloqueio do app: PIN de 4 dígitos pedido ao abrir. Espelha o padrão do
 * parental (cache em módulo + AsyncStorage), mas protege o app INTEIRO —
 * contas, histórico e downloads — não só as categorias adultas.
 *
 * O desbloqueio vale pela sessão (flag em memória): fechar e reabrir o app
 * pede o PIN de novo; navegar dentro dele, não.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isValidPin } from './parental'

export interface AppLockState {
    enabled: boolean
    pin: string
}

const STORAGE_KEY = 'neostream_applock'

let cache: AppLockState | null = null
let unlocked = false

export async function loadAppLock(): Promise<AppLockState> {
    if (cache) return cache
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<AppLockState>) : null
        cache = { enabled: parsed?.enabled === true, pin: typeof parsed?.pin === 'string' ? parsed.pin : '' }
    } catch {
        cache = { enabled: false, pin: '' }
    }
    return cache
}

export async function enableAppLock(pin: string): Promise<boolean> {
    if (!isValidPin(pin)) return false
    cache = { enabled: true, pin }
    // Quem acabou de ativar já provou que sabe o PIN.
    unlocked = true
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* best-effort */ }
    return true
}

/** Desligar exige o PIN correto. */
export async function disableAppLock(pin: string): Promise<boolean> {
    const state = await loadAppLock()
    if (!state.enabled) return true
    if (pin !== state.pin) return false
    cache = { enabled: false, pin: '' }
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* best-effort */ }
    return true
}

/**
 * Biometria (digital/rosto) libera a sessão como se fosse o PIN. A checagem
 * de hardware fica na tela; aqui só a flag — testável sem módulo nativo.
 */
export function unlockWithBiometrics(): void {
    unlocked = true
}

/** PIN certo → libera a sessão. */
export async function unlockApp(pin: string): Promise<boolean> {
    const state = await loadAppLock()
    if (!state.enabled || pin === state.pin) {
        unlocked = true
        return true
    }
    return false
}

/** O index só redireciona pro app se não houver tranca pendente. */
export async function needsUnlock(): Promise<boolean> {
    const state = await loadAppLock()
    return state.enabled && !unlocked
}

/** Só pra testes. */
export function resetAppLockCache(): void {
    cache = null
    unlocked = false
}
