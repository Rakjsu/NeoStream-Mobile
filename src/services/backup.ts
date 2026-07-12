/**
 * Backup completo do aparelho: contas, favoritos, progresso, vistos,
 * parental e (v2) canais ocultos + preferências. O parse é PURO (testável)
 * e lê v1 e v2; coletar/aplicar delegam pros serviços.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadFavorites, restoreFavorites, type Favorites } from './favorites'
import { listHiddenFor, restoreHiddenFor, type HiddenChannel } from './hidden'
import { loadParental, restoreParental, type ParentalState } from './parental'
import { loadProgress, loadWatched, restoreProgress, type ProgressEntry } from './progress'
import { getDownloadLimitGb, setDownloadLimitGb } from './downloads'
import { isDataSaverEnabled, setDataSaver } from './dataSaver'
import { getActiveAccountId, listAccounts, restoreAccounts, type StoredAccount } from './session'

export interface BackupPrefs {
    downloadLimitGb: number
    dataSaver: boolean
}

export interface MobileBackup {
    app: 'neostream-mobile'
    /** v1 (até 0.4.0) não tem hidden/prefs — o parse aceita as duas. */
    version: 1 | 2
    accounts: StoredAccount[]
    activeId: string | null
    favorites: Favorites
    progress: Record<string, ProgressEntry>
    watched: string[]
    parental: ParentalState
    hiddenByAccount?: Record<string, HiddenChannel[]>
    prefs?: BackupPrefs
}

export async function collectBackup(): Promise<MobileBackup> {
    const [accounts, activeId, favorites, progress, watched, parental, downloadLimitGb, dataSaver] = await Promise.all([
        listAccounts(), getActiveAccountId(), loadFavorites(), loadProgress(), loadWatched(), loadParental(),
        getDownloadLimitGb(), isDataSaverEnabled(),
    ])
    const hiddenByAccount: Record<string, HiddenChannel[]> = {}
    for (const account of accounts) {
        const hidden = await listHiddenFor(account.id)
        if (hidden.length > 0) hiddenByAccount[account.id] = hidden
    }
    return {
        app: 'neostream-mobile',
        version: 2,
        accounts,
        activeId,
        favorites,
        progress,
        watched: [...watched],
        parental,
        hiddenByAccount,
        prefs: { downloadLimitGb, dataSaver },
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
    if (backup.version !== 1 && backup.version !== 2) {
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
    await restoreAccounts(backup.accounts, backup.activeId ?? null)
}
