/**
 * Sessão do app: a conta Xtream salva no aparelho + um cache em memória do
 * catálogo (as listas do provedor são pesadas — busca uma vez por sessão,
 * pull-to-refresh força de novo).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { XtreamClient, type UserInfo, type XtreamAccount } from './xtream'

const ACCOUNT_KEY = 'neostream_account'
const USER_INFO_KEY = 'neostream_user_info'

let client: XtreamClient | null = null

export async function loadAccount(): Promise<XtreamAccount | null> {
    try {
        const raw = await AsyncStorage.getItem(ACCOUNT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as XtreamAccount
        if (!parsed?.url || !parsed?.username) return null
        return parsed
    } catch {
        return null
    }
}

export async function saveAccount(account: XtreamAccount, userInfo: UserInfo): Promise<void> {
    await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo))
    client = new XtreamClient(account)
    invalidateCatalog()
}

export async function loadUserInfo(): Promise<UserInfo | null> {
    try {
        const raw = await AsyncStorage.getItem(USER_INFO_KEY)
        return raw ? (JSON.parse(raw) as UserInfo) : null
    } catch {
        return null
    }
}

export async function clearSession(): Promise<void> {
    await AsyncStorage.multiRemove([ACCOUNT_KEY, USER_INFO_KEY])
    client = null
    invalidateCatalog()
}

/** Client da conta salva (null quando deslogado). */
export async function getClient(): Promise<XtreamClient | null> {
    if (client) return client
    const account = await loadAccount()
    if (!account) return null
    client = new XtreamClient(account)
    return client
}

// ---------------------------------------------------------- catálogo (memo) --

const catalog = new Map<string, unknown>()

export function invalidateCatalog(): void {
    catalog.clear()
}

/** Uma busca por chave por sessão; `force` refaz (pull-to-refresh). */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
    if (!force && catalog.has(key)) return catalog.get(key) as T
    const data = await fetcher()
    catalog.set(key, data)
    return data
}
