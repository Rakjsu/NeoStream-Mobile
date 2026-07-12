/**
 * Sessão do app: contas Xtream salvas no aparelho (multi-playlist, uma ativa)
 * + um cache em memória do catálogo por sessão. Os helpers de lista de contas
 * são PUROS (testáveis); só load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { M3uClient } from './m3u'
import { XtreamClient, normalizeBaseUrl, type CatalogClient, type UserInfo, type XtreamAccount } from './xtream'

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
    const user = account.type === 'm3u' ? 'm3u' : account.username
    return `${user}@${normalizeBaseUrl(account.url)}`
}

/** Nome de exibição: usuário@host (M3U mostra o host da lista). */
export function accountLabel(account: XtreamAccount): string {
    try {
        const host = new URL(normalizeBaseUrl(account.url)).host
        return account.type === 'm3u' ? `M3U · ${host}` : `${account.username}@${host}`
    } catch {
        return accountId(account)
    }
}

/** Client certo pro tipo da conta (Xtream ou lista M3U). */
export function buildClient(account: XtreamAccount): CatalogClient {
    return account.type === 'm3u' ? new M3uClient(normalizeBaseUrl(account.url)) : new XtreamClient(account)
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
let client: CatalogClient | null = null

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
    client = buildClient(result.entry)
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
    client = buildClient(entry)
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
    void dropPersistedCatalog(id)
    if (activeId === id) {
        activeIdCache = accountsCache[0]?.id ?? null
        client = null
        invalidateCatalog()
    }
    await persist()
    const active = accountsCache.find(a => a.id === activeIdCache) ?? null
    if (active && !client) client = buildClient(active)
    return active
}

/** Client da conta ativa (null quando deslogado). */
export async function getClient(): Promise<CatalogClient | null> {
    if (client) return client
    const account = await loadAccount()
    if (!account) return null
    client = buildClient(account)
    return client
}

/** Restauração de backup: substitui as contas e reativa o client. */
export async function restoreAccounts(accounts: StoredAccount[], activeId: string | null): Promise<void> {
    accountsCache = accounts.filter(a => !!a?.id && !!a.url)
    activeIdCache = activeId && accountsCache.some(a => a.id === activeId) ? activeId : accountsCache[0]?.id ?? null
    await persist()
    const active = accountsCache.find(a => a.id === activeIdCache)
    client = active ? buildClient(active) : null
    invalidateCatalog()
}

/** Só pra testes. */
export function resetSessionCache(): void {
    accountsCache = null
    activeIdCache = null
    client = null
    invalidateCatalog()
}

// ----------------------------------------------------------- catálogo (SWR) --

const catalog = new Map<string, unknown>()

/** Só as listas grandes valem disco — EPG e afins ficam na sessão. */
const PERSISTABLE_KEYS = new Set(['live', 'vod', 'series', 'live-cats', 'vod-cats', 'series-cats'])
/** Cache mais novo que isso vai pra tela na hora (a rede atualiza por trás). */
const FRESH_MS = 24 * 3600_000
/** Entrada gigante estoura o AsyncStorage do Android — melhor não persistir. */
const MAX_PERSIST_CHARS = 1_500_000

interface PersistedCatalog {
    t: number
    data: unknown
}

function catalogStorageKey(id: string, key: string): string {
    return `neostream_catalog_${id}_${key}`
}

async function readPersisted(storageKey: string): Promise<PersistedCatalog | null> {
    try {
        const raw = await AsyncStorage.getItem(storageKey)
        const parsed = raw ? (JSON.parse(raw) as PersistedCatalog) : null
        return parsed && typeof parsed.t === 'number' && 'data' in parsed ? parsed : null
    } catch {
        return null
    }
}

async function writePersisted(storageKey: string, data: unknown): Promise<void> {
    try {
        const json = JSON.stringify({ t: Date.now(), data })
        if (json.length > MAX_PERSIST_CHARS) return
        await AsyncStorage.setItem(storageKey, json)
    } catch { /* best-effort */ }
}

/** Remove o catálogo persistido de uma conta (chamado ao removê-la). */
async function dropPersistedCatalog(id: string): Promise<void> {
    try {
        await AsyncStorage.multiRemove([...PERSISTABLE_KEYS].map(key => catalogStorageKey(id, key)))
    } catch { /* best-effort */ }
}

export function invalidateCatalog(): void {
    catalog.clear()
}

/**
 * Cache em três camadas: memória (sessão) → disco (SWR, por conta) → rede.
 * Cache fresco em disco abre o app na hora e atualiza em background; se a
 * rede falhar, catálogo velho vale mais que tela de erro (modo offline).
 * `force` (pull-to-refresh) fura as duas camadas.
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
    if (!force && catalog.has(key)) return catalog.get(key) as T

    const { activeId } = await loadState()
    const storageKey = activeId && PERSISTABLE_KEYS.has(key) ? catalogStorageKey(activeId, key) : null
    const persisted = storageKey && !force ? await readPersisted(storageKey) : null

    if (persisted && Date.now() - persisted.t < FRESH_MS) {
        catalog.set(key, persisted.data)
        void fetcher()
            .then(fresh => {
                catalog.set(key, fresh)
                if (storageKey) void writePersisted(storageKey, fresh)
            })
            .catch(() => undefined)
        return persisted.data as T
    }

    try {
        const data = await fetcher()
        catalog.set(key, data)
        if (storageKey) void writePersisted(storageKey, data)
        return data
    } catch (error) {
        if (persisted) {
            catalog.set(key, persisted.data)
            return persisted.data as T
        }
        throw error
    }
}
