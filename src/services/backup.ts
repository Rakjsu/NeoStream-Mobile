/**
 * Backup completo do aparelho: contas, favoritos, progresso, vistos e
 * parental num JSON (exportado pelo compartilhar do Android). O parse é
 * PURO (testável); coletar/aplicar delegam pros serviços.
 */
import { loadFavorites, restoreFavorites, type Favorites } from './favorites'
import { loadParental, restoreParental, type ParentalState } from './parental'
import { loadProgress, loadWatched, restoreProgress, type ProgressEntry } from './progress'
import { getActiveAccountId, listAccounts, restoreAccounts, type StoredAccount } from './session'

export interface MobileBackup {
    app: 'neostream-mobile'
    version: 1
    accounts: StoredAccount[]
    activeId: string | null
    favorites: Favorites
    progress: Record<string, ProgressEntry>
    watched: string[]
    parental: ParentalState
}

export async function collectBackup(): Promise<MobileBackup> {
    const [accounts, activeId, favorites, progress, watched, parental] = await Promise.all([
        listAccounts(), getActiveAccountId(), loadFavorites(), loadProgress(), loadWatched(), loadParental(),
    ])
    return {
        app: 'neostream-mobile',
        version: 1,
        accounts,
        activeId,
        favorites,
        progress,
        watched: [...watched],
        parental,
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
    if (backup.version !== 1) {
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
    await restoreAccounts(backup.accounts, backup.activeId ?? null)
}
