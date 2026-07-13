/**
 * Backup completo do aparelho: contas, favoritos, progresso, vistos,
 * parental, (v2) canais ocultos + preferências e (v3) Minha lista, chave do
 * TMDB, modo infantil e buscas recentes. O parse é PURO (testável) e lê
 * v1/v2/v3; coletar/aplicar delegam pros serviços.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import CryptoJS from 'crypto-js'
import { loadFavorites, restoreFavorites, type Favorites } from './favorites'
import { listHiddenFor, restoreHiddenFor, type HiddenChannel } from './hidden'
import { loadParental, restoreParental, type ParentalState } from './parental'
import { loadProgress, loadWatched, restoreProgress, type ProgressEntry } from './progress'
import { getDownloadLimitGb, setDownloadLimitGb } from './downloads'
import { isDataSaverEnabled, setDataSaver } from './dataSaver'
import { getActiveAccountId, listAccounts, restoreAccounts, type StoredAccount } from './session'
import { exportProfiles, restoreProfilesList, type Profile } from './profiles'
import { loadWatchlist, restoreWatchlist, type WatchItem } from './watchlist'
import { getTmdbKey, setTmdbKey } from './tmdb'
import { isKidsMode, setKidsMode } from './kids'
import { listSearchTerms, restoreSearchTerms } from './searchHistory'

export interface BackupPrefs {
    downloadLimitGb: number
    dataSaver: boolean
}

export interface MobileBackup {
    app: 'neostream-mobile'
    /** v1 sem hidden/prefs; v2 sem watchlist/TMDB/kids; v3 sem perfis. */
    version: 1 | 2 | 3 | 4
    accounts: StoredAccount[]
    activeId: string | null
    favorites: Favorites
    progress: Record<string, ProgressEntry>
    watched: string[]
    parental: ParentalState
    hiddenByAccount?: Record<string, HiddenChannel[]>
    prefs?: BackupPrefs
    watchlist?: WatchItem[]
    tmdbKey?: string
    kidsMode?: boolean
    searches?: string[]
    profilesList?: Profile[]
    /** perfil extra → chave base → JSON cru (favoritos/progresso/vistos/lista). */
    profilesData?: Record<string, Record<string, string>>
}

export async function collectBackup(): Promise<MobileBackup> {
    const [accounts, activeId, favorites, progress, watched, parental, downloadLimitGb, dataSaver,
        watchlist, tmdbKey, kidsMode, searches] = await Promise.all([
        listAccounts(), getActiveAccountId(), loadFavorites(), loadProgress(), loadWatched(), loadParental(),
        getDownloadLimitGb(), isDataSaverEnabled(),
        loadWatchlist(), getTmdbKey(), isKidsMode(), listSearchTerms(),
    ])
    const profilesList = await exportProfiles()
    const profilesData: Record<string, Record<string, string>> = {}
    for (const profile of profilesList) {
        const bucket: Record<string, string> = {}
        for (const base of ['neostream_favorites', 'neostream_progress', 'neostream_watched', 'neostream_watchlist']) {
            const raw = await AsyncStorage.getItem(`${base}_p_${profile.id}`).catch(() => null)
            if (raw) bucket[base] = raw
        }
        if (Object.keys(bucket).length > 0) profilesData[profile.id] = bucket
    }
    const hiddenByAccount: Record<string, HiddenChannel[]> = {}
    for (const account of accounts) {
        const hidden = await listHiddenFor(account.id)
        if (hidden.length > 0) hiddenByAccount[account.id] = hidden
    }
    return {
        app: 'neostream-mobile',
        version: 4,
        accounts,
        activeId,
        favorites,
        progress,
        watched: [...watched],
        parental,
        hiddenByAccount,
        prefs: { downloadLimitGb, dataSaver },
        watchlist,
        tmdbKey,
        kidsMode,
        searches,
        profilesList,
        profilesData,
    }
}

export function serializeBackup(backup: MobileBackup): string {
    return JSON.stringify(backup, null, 2)
}

/** Valida o texto colado (PURO). Lança mensagens amigáveis em pt-BR. */
export function parseBackup(text: string): MobileBackup {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new Error('Isso não parece um backup válido (JSON quebrado).')
    }
    const backup = parsed as Partial<MobileBackup> | null
    if (!backup || backup.app !== 'neostream-mobile') {
        throw new Error('Este arquivo não é um backup do NeoStream Mobile.')
    }
    if (![1, 2, 3, 4].includes(backup.version as number)) {
        throw new Error(`Versão de backup não suportada (${String(backup.version)}).`)
    }
    if (!Array.isArray(backup.accounts)) {
        throw new Error('Backup sem a lista de contas.')
    }
    return backup as MobileBackup
}

/** Substitui o estado do aparelho pelo backup (contas por último ativam o client). */
export async function applyBackup(backup: MobileBackup): Promise<void> {
    await restoreFavorites(backup.favorites ?? { live: [], movie: [], series: [] })
    await restoreProgress(backup.progress ?? {}, backup.watched ?? [])
    await restoreParental(backup.parental ?? { enabled: false, pin: '' })
    for (const [accountId, hidden] of Object.entries(backup.hiddenByAccount ?? {})) {
        await restoreHiddenFor(accountId, hidden)
    }
    if (backup.prefs) {
        await setDownloadLimitGb(backup.prefs.downloadLimitGb ?? 0)
        await setDataSaver(backup.prefs.dataSaver === true)
        // O cache síncrono da economia de dados relê no próximo boot.
        await AsyncStorage.getItem('neostream_datasaver').catch(() => null)
    }
    // Campos do v3 — backup antigo simplesmente não mexe neles.
    if (backup.watchlist) await restoreWatchlist(backup.watchlist)
    if (typeof backup.tmdbKey === 'string' && backup.tmdbKey) await setTmdbKey(backup.tmdbKey)
    if (typeof backup.kidsMode === 'boolean') await setKidsMode(backup.kidsMode)
    if (backup.searches) await restoreSearchTerms(backup.searches)
    // Campos do v4: perfis extras + dados deles.
    if (backup.profilesList) {
        await restoreProfilesList(backup.profilesList)
        for (const [profileId, bucket] of Object.entries(backup.profilesData ?? {})) {
            for (const [base, raw] of Object.entries(bucket)) {
                await AsyncStorage.setItem(`${base}_p_${profileId}`, raw).catch(() => undefined)
            }
        }
    }
    await restoreAccounts(backup.accounts, backup.activeId ?? null)
}

// --------------------------------------------------- backup com senha --

const ENC_PREFIX = 'NEOENC1:'

export function isEncryptedBackup(text: string): boolean {
    return text.trim().startsWith(ENC_PREFIX)
}

/** Senha vazia = texto puro (compatível com backups antigos). */
export function protectBackup(json: string, password: string): string {
    if (!password.trim()) return json
    return ENC_PREFIX + CryptoJS.AES.encrypt(json, password).toString()
}

/** null = senha errada ou arquivo corrompido. */
export function decryptBackup(text: string, password: string): string | null {
    try {
        const body = text.trim().slice(ENC_PREFIX.length)
        const plain = CryptoJS.AES.decrypt(body, password).toString(CryptoJS.enc.Utf8)
        return plain.startsWith('{') ? plain : null
    } catch {
        return null
    }
}
