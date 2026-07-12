/**
 * Downloads offline: filmes/episódios baixados pro aparelho com progresso.
 * Registro no AsyncStorage; tarefas ativas vivem em memória (morrem com o
 * app — download interrompido volta pro estado ⬇). O player troca a URL
 * remota pelo arquivo local quando o item está baixado.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { notifyDownloadDone } from './notify'
import { loadWatched } from './progress'

export interface DownloadItem {
    /** Mesmo id do progresso: "movie:<id>" | "episode:<id>". */
    id: string
    title: string
    cover: string
    container: string
    fileUri: string
    sizeBytes: number
    downloadedAt: number
}

export interface DownloadRequest {
    id: string
    url: string
    title: string
    cover: string
    container: string
}

const STORAGE_KEY = 'neostream_downloads'
const LIMIT_KEY = 'neostream_dl_limit_gb'
const PENDING_KEY = 'neostream_dl_pending'
const DIR = `${FileSystem.documentDirectory}downloads/`

/**
 * Quais pedidos ainda valem entrar na fila (PURO): fora os já baixados,
 * os baixando e os que já estão na fila.
 */
export function pickPending(requests: DownloadRequest[], taken: Set<string>): DownloadRequest[] {
    const seen = new Set(taken)
    const pending: DownloadRequest[] = []
    for (const request of requests) {
        if (seen.has(request.id)) continue
        seen.add(request.id)
        pending.push(request)
    }
    return pending
}

/**
 * Quem sai quando o teto estoura (PURO): assistidos primeiro, depois os mais
 * antigos, até caber. Devolve [] quando não há teto ou já cabe.
 */
export function pickEvictions(items: DownloadItem[], watched: Set<string>, limitBytes: number): DownloadItem[] {
    let total = items.reduce((sum, item) => sum + item.sizeBytes, 0)
    if (limitBytes <= 0 || total <= limitBytes) return []
    const order = [...items].sort((a, b) => {
        const aWatched = watched.has(a.id) ? 0 : 1
        const bWatched = watched.has(b.id) ? 0 : 1
        if (aWatched !== bWatched) return aWatched - bWatched
        return a.downloadedAt - b.downloadedAt
    })
    const evictions: DownloadItem[] = []
    for (const item of order) {
        if (total <= limitBytes) break
        evictions.push(item)
        total -= item.sizeBytes
    }
    return evictions
}

/** Teto em GB (0 = sem teto). */
export async function getDownloadLimitGb(): Promise<number> {
    try {
        const raw = await AsyncStorage.getItem(LIMIT_KEY)
        const value = raw ? Number(raw) : 0
        return Number.isFinite(value) && value > 0 ? value : 0
    } catch {
        return 0
    }
}

export async function setDownloadLimitGb(gb: number): Promise<void> {
    try {
        await AsyncStorage.setItem(LIMIT_KEY, String(gb))
    } catch { /* best-effort */ }
    await enforceDownloadLimit()
}

/** Aplica o teto: remove o que o pickEvictions mandar. */
export async function enforceDownloadLimit(): Promise<void> {
    const limitGb = await getDownloadLimitGb()
    if (!limitGb) return
    const watched = await loadWatched().catch(() => new Set<string>())
    const evictions = pickEvictions(await listDownloads(), watched, limitGb * 1024 ** 3)
    for (const item of evictions) await removeDownload(item.id)
}

/** "movie:123" + "mkv" → "movie_123.mkv" (PURO, testável). */
export function safeFileName(id: string, container: string): string {
    const base = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const ext = /^[a-z0-9]{2,5}$/i.test(container) ? container.toLowerCase() : 'mp4'
    return `${base}.${ext}`
}

// ------------------------------------------------------------- estado --

let registry: Record<string, DownloadItem> | null = null
const active = new Map<string, { task: FileSystem.DownloadResumable; progress: number }>()
const listeners = new Set<() => void>()

function notify(): void {
    for (const listener of listeners) listener()
}

/** UI assina pra re-renderizar a cada tick de progresso. */
export function subscribeDownloads(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

async function loadRegistry(): Promise<Record<string, DownloadItem>> {
    if (registry) return registry
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Record<string, DownloadItem>) : {}
        registry = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        registry = {}
    }
    return registry
}

async function persistRegistry(): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(registry ?? {}))
    } catch { /* best-effort */ }
}

export async function listDownloads(): Promise<DownloadItem[]> {
    return Object.values(await loadRegistry()).sort((a, b) => b.downloadedAt - a.downloadedAt)
}

export async function getDownload(id: string): Promise<DownloadItem | undefined> {
    return (await loadRegistry())[id]
}

/** 0..1 enquanto baixa; null quando não há download ativo desse id. */
export function activeProgress(id: string): number | null {
    return active.get(id)?.progress ?? null
}

export function listActiveDownloads(): { id: string; progress: number }[] {
    return [...active.entries()].map(([id, task]) => ({ id, progress: task.progress }))
}

// Pendentes: pedidos que começaram mas não terminaram (app fechado no meio).
// Ao reabrir, a tela de Downloads oferece tentar de novo ou descartar.
async function readPending(): Promise<Record<string, DownloadRequest>> {
    try {
        const raw = await AsyncStorage.getItem(PENDING_KEY)
        const parsed = raw ? (JSON.parse(raw) as Record<string, DownloadRequest>) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

async function writePending(map: Record<string, DownloadRequest>): Promise<void> {
    try {
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(map))
    } catch { /* best-effort */ }
}

/** Interrompidos: pendentes que não estão baixando nem concluídos. */
export async function listInterrupted(): Promise<DownloadRequest[]> {
    const pending = await readPending()
    const registry = await loadRegistry()
    return Object.values(pending).filter(request =>
        !registry[request.id] && !active.has(request.id) && !listQueuedIds().includes(request.id))
}

export async function discardInterrupted(id: string): Promise<void> {
    const pending = await readPending()
    const request = pending[id]
    if (!request) return
    delete pending[id]
    await writePending(pending)
    // Limpa o arquivo parcial que ficou pra trás.
    await FileSystem.deleteAsync(DIR + safeFileName(id, request.container), { idempotent: true }).catch(() => undefined)
    notify()
}

export async function startDownload(request: DownloadRequest): Promise<void> {
    if (active.has(request.id)) return
    if ((await loadRegistry())[request.id]) return
    if (!request.url) throw new Error('Sem URL pra baixar.')

    const pending = await readPending()
    pending[request.id] = request
    await writePending(pending)

    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined)
    const fileUri = DIR + safeFileName(request.id, request.container)

    const task = FileSystem.createDownloadResumable(request.url, fileUri, {}, progress => {
        const entry = active.get(request.id)
        if (entry && progress.totalBytesExpectedToWrite > 0) {
            entry.progress = progress.totalBytesWritten / progress.totalBytesExpectedToWrite
            notify()
        }
    })
    active.set(request.id, { task, progress: 0 })
    notify()

    try {
        const result = await task.downloadAsync()
        if (!result?.uri) throw new Error('Download interrompido.')
        const info = await FileSystem.getInfoAsync(result.uri)
        const map = await loadRegistry()
        map[request.id] = {
            id: request.id,
            title: request.title,
            cover: request.cover,
            container: request.container,
            fileUri: result.uri,
            sizeBytes: info.exists && 'size' in info ? info.size : 0,
            downloadedAt: Date.now(),
        }
        registry = map
        await persistRegistry()
        void notifyDownloadDone(request.title)
        void enforceDownloadLimit()
    } catch (error) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined)
        throw error
    } finally {
        active.delete(request.id)
        // Terminou (com sucesso OU cancelado de vez) → sai dos pendentes.
        const map = await readPending()
        if (map[request.id]) {
            delete map[request.id]
            await writePending(map)
        }
        notify()
    }
}

// Fila sequencial (baixar temporada): um download por vez pra não afogar
// a rede nem o provedor. A fila vive em memória — fechar o app a esvazia.
const pendingQueue: DownloadRequest[] = []
let queueRunning = false

export function listQueuedIds(): string[] {
    return pendingQueue.map(request => request.id)
}

export async function enqueueDownloads(requests: DownloadRequest[]): Promise<void> {
    const map = await loadRegistry()
    const taken = new Set([...Object.keys(map), ...active.keys(), ...listQueuedIds()])
    pendingQueue.push(...pickPending(requests, taken))
    notify()
    if (queueRunning) return
    queueRunning = true
    try {
        while (pendingQueue.length > 0) {
            const next = pendingQueue.shift()!
            notify()
            await startDownload(next).catch(() => undefined)
        }
    } finally {
        queueRunning = false
        notify()
    }
}

/** Tira um item ainda não iniciado da fila. */
export function dequeueDownload(id: string): void {
    const index = pendingQueue.findIndex(request => request.id === id)
    if (index >= 0) {
        pendingQueue.splice(index, 1)
        notify()
    }
}

export async function cancelDownload(id: string): Promise<void> {
    const entry = active.get(id)
    if (!entry) return
    // cancelAsync derruba o downloadAsync em andamento, que limpa o resto.
    await entry.task.cancelAsync().catch(() => undefined)
    active.delete(id)
    notify()
}

export async function removeDownload(id: string): Promise<void> {
    const map = await loadRegistry()
    const item = map[id]
    if (!item) return
    await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => undefined)
    delete map[id]
    registry = map
    await persistRegistry()
    notify()
}

/** Só pra testes. */
export function resetDownloadsCache(): void {
    registry = null
    active.clear()
}
