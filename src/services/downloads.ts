/**
 * Downloads offline: filmes/episódios baixados pro aparelho com progresso.
 * Registro no AsyncStorage; tarefas ativas vivem em memória (morrem com o
 * app — download interrompido volta pro estado ⬇). O player troca a URL
 * remota pelo arquivo local quando o item está baixado.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'

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
const DIR = `${FileSystem.documentDirectory}downloads/`

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

export async function startDownload(request: DownloadRequest): Promise<void> {
    if (active.has(request.id)) return
    if ((await loadRegistry())[request.id]) return
    if (!request.url) throw new Error('Sem URL pra baixar.')

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
    } catch (error) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined)
        throw error
    } finally {
        active.delete(request.id)
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
