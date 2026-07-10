/**
 * Sessão do app: contas Xtream salvas no aparelho (multi-playlist, uma ativa)
 * + um cache em memória do catálogo por sessão. Os helpers de lista de contas
 * são PUROS (testáveis); só load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { XtreamClient, normalizeBaseUrl, type UserInfo, type XtreamAccount } from './xtream'

export interface StoredAccount extends XtreamAccount {
    id: string
    userInfo?: UserInfo
}

const ACCOUNTS_KEY = 'neostream_accounts'
const ACTIVE_KEY = 'neostream_active_account'
// Modelo antigo (v0, conta única) — migrado na primeira leitura.
const LEGACY_ACCOUNT_KEY = 'neostream_account'
const LEGACY_USER_INFO_KEY = 'neostream_user_info'

/** Id determinístico: mesma conta (url+usuário) nunca duplica. */
export function accountId(account: XtreamAccount): string {
    return `${account.username}@${normalizeBaseUrl(account.url)}`
}

/** Nome de exibição: usuário@host (sem esquema/credencial). */
export function accountLabel(account: XtreamAccount): string {
    try {
        return `${account.username}@${new URL(normalizeBaseUrl(account.url)).host}`
    } catch {
        return accountId(account)
    }
}

/** Insere/atualiza uma conta (PURO) — dedup pelo id determinístico. */
export function upsertAccount(
    accounts: StoredAccount[],
    account: XtreamAccount,
    userInfo?: UserInfo,
): { accounts: StoredAccount[]; entry: StoredAccount } {
    const entry: StoredAccount = { ...account, id: accountId(account), userInfo }
    const rest = accounts.filter(a => a.id !== entry.id)
    return { accounts: [...rest, entry], entry }
}

// ------------------------------------------------------------- persistência --

let accountsCache: StoredAccount[] | null = null
let activeIdCache: string | null = null
let client: XtreamClient | null = null

async function loadState(): Promise<{ accounts: StoredAccount[]; activeId: string | null }> {
    if (accountsCache) return { accounts: accountsCache, activeId: activeIdCache }
    let accounts: StoredAccount[] = []
    let activeId: string | null = null
    try {
        const raw = await AsyncStorage.getItem(ACCOUNTS_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        accounts = Array.isArray(parsed)
            ? parsed.filter((a): a is StoredAccount => !!a && typeof (a as StoredAccount).id === 'string')
            : []
        activeId = await AsyncStorage.getItem(ACTIVE_KEY)
    } catch { /* estado zerado abaixo */ }

    // Migração do modelo v0 (uma conta): vira a primeira conta ativa.
    if (accounts.length === 0) {
        try {
            const legacyRaw = await AsyncStorage.getItem(LEGACY_ACCOUNT_KEY)
            const legacy = legacyRaw ? (JSON.parse(legacyRaw) as XtreamAccount) : null
            if (legacy?.url && legacy?.username) {
                const infoRaw = await AsyncStorage.getItem(LEGACY_USER_INFO_KEY)
                const userInfo = infoRaw ? (JSON.parse(infoRaw) as UserInfo) : undefined
                const result = upsertAccount([], legacy, userInfo)
                accounts = result.accounts
                activeId = result.entry.id
                await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
                await AsyncStorage.setItem(ACTIVE_KEY, activeId)
                await AsyncStorage.multiRemove([LEGACY_ACCOUNT_KEY, LEGACY_USER_INFO_KEY])
            }
        } catch { /* segue deslogado */ }
    }

    if (activeId && !accounts.some(a => a.id === activeId)) activeId = accounts[0]?.id ?? null
    accountsCache = accounts
    activeIdCache = activeId
    return { accounts, activeId }
}

async function persist(): Promise<void> {
    try {
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountsCache ?? []))
        if (activeIdCache) await AsyncStorage.setItem(ACTIVE_KEY, activeIdCache)
        else await AsyncStorage.removeItem(ACTIVE_KEY)
    } catch { /* best-effort */ }
}

export async function listAccounts(): Promise<StoredAccount[]> {
    return (await loadState()).accounts
}

export async function getActiveAccountId(): Promise<string | null> {
    return (await loadState()).activeId
}

/** Conta ativa (compat com o fluxo v0: index/ajustes leem daqui). */
export async function loadAccount(): Promise<StoredAccount | null> {
    const { accounts, activeId } = await loadState()
    return accounts.find(a => a.id === activeId) ?? null
}

export async function loadUserInfo(): Promise<UserInfo | null> {
    return (await loadAccount())?.userInfo ?? null
}

/** Login: salva/atualiza a conta e a torna ativa. */
export async function addAccount(account: XtreamAccount, userInfo: UserInfo): Promise<StoredAccount> {
    const { accounts } = await loadState()
    const result = upsertAccount(accounts, account, userInfo)
    accountsCache = result.accounts
    activeIdCache = result.entry.id
    await persist()
    client = new XtreamClient(result.entry)
    invalidateCatalog()
    return result.entry
}

/** Troca a conta ativa (catálogo é por conta → zera o cache). */
export async function switchAccount(id: string): Promise<StoredAccount | null> {
    const { accounts } = await loadState()
    const entry = accounts.find(a => a.id === id)
    if (!entry) return null
    activeIdCache = id
    await persist()
    client = new XtreamClient(entry)
    invalidateCatalog()
    return entry
}

/**
 * Remove uma conta. Se era a ativa, promove a próxima; devolve a nova ativa
 * (null = ficou sem contas → tela de login).
 */
export async function removeAccount(id: string): Promise<StoredAccount | null> {
    const { accounts, activeId } = await loadState()
    accountsCache = accounts.filter(a => a.id !== id)
    if (activeId === id) {
        activeIdCache = accountsCache[0]?.id ?? null
        client = null
        invalidateCatalog()
    }
    await persist()
    const active = accountsCache.find(a => a.id === activeIdCache) ?? null
    if (active && !client) client = new XtreamClient(active)
    return active
}

/** Client da conta ativa (null quando deslogado). */
export async function getClient(): Promise<XtreamClient | null> {
    if (client) return client
    const account = await loadAccount()
    if (!account) return null
    client = new XtreamClient(account)
    return client
}

/** Só pra testes. */
export function resetSessionCache(): void {
    accountsCache = null
    activeIdCache = null
    client = null
    invalidateCatalog()
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
