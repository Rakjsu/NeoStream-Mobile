/**
 * REC sem ffmpeg: canal ao vivo em .ts é um arquivo sem fim — o gravador
 * despeja o stream em disco até o STOP, e a gravação vira um item offline
 * nos Downloads (o ExoPlayer toca TS cru). HLS (.m3u8) fica de fora por ora.
 */
import * as FileSystem from 'expo-file-system/legacy'
import { addLocalDownload } from './downloads'
import { notifyRecordingStarted } from './notify'

const DIR = `${FileSystem.documentDirectory}downloads/`
// Abaixo disso o REC para sozinho — gravar até encher o disco trava o Android.
const MIN_FREE_BYTES = 500 * 1024 * 1024

interface ActiveRecording {
    autoStop?: ReturnType<typeof setTimeout>
    diskWatch?: ReturnType<typeof setInterval>
    task?: FileSystem.DownloadResumable
    /** Gravação HLS: chamar pra parar o loop de segmentos. */
    stopHls?: () => void
    title: string
    fileUri: string
    startedAt: number
}

/** Todas as URLs de mídia de um m3u8, resolvidas contra a base (PURO). */
export function parseHlsSegments(playlist: string, baseUrl: string): string[] {
    const urls: string[] = []
    for (const raw of playlist.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        try {
            urls.push(new URL(line, baseUrl).toString())
        } catch { /* linha lixo */ }
    }
    return urls
}

let current: ActiveRecording | null = null

export function recordingTitle(): string | null {
    return current?.title ?? null
}

/** Fase 2: TS cru E HLS gravam (HLS via loop de segmentos). */
export function canRecordUrl(url: string): boolean {
    return /^https?:\/\//.test(url)
}

/**
 * HLS: relê a playlist, baixa os segmentos novos e vai concatenando no
 * arquivo com o FileHandle da API NOVA do expo-file-system (a legada não
 * tem append). Se a API não existir, a gravação HLS falha limpa.
 */
async function diskFull(): Promise<boolean> {
    try {
        return (await FileSystem.getFreeDiskStorageAsync()) < MIN_FREE_BYTES
    } catch {
        return false // sem como medir → não bloqueia
    }
}

async function runHlsLoop(url: string, fileUri: string, isStopped: () => boolean): Promise<void> {
    const FSN = await import('expo-file-system')
    const file = new FSN.File(fileUri)
    try { file.create() } catch { /* já existe */ }
    const handle = file.open()
    const seen = new Set<string>()
    try {
        // Playlist mestre → primeira media playlist.
        let mediaUrl = url
        const first = await (await fetch(url)).text()
        const entries = parseHlsSegments(first, url)
        if (entries[0] && /\.m3u8($|\?)/.test(entries[0])) mediaUrl = entries[0]
        while (!isStopped()) {
            if (await diskFull()) { void stopRecording(); break }
            try {
                const playlist = await (await fetch(mediaUrl)).text()
                for (const segment of parseHlsSegments(playlist, mediaUrl)) {
                    if (isStopped()) break
                    if (seen.has(segment)) continue
                    seen.add(segment)
                    const buffer = await (await fetch(segment)).arrayBuffer()
                    handle.writeBytes(new Uint8Array(buffer))
                }
            } catch { /* ciclo ruim — tenta no próximo */ }
            await new Promise(resolve => setTimeout(resolve, 4000))
        }
    } finally {
        try { handle.close() } catch { /* já fechado */ }
    }
}

export async function startRecording(url: string, title: string, autoStopMs?: number): Promise<boolean> {
    if (current || !canRecordUrl(url)) return false
    if (await diskFull()) return false
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined)
    const startedAt = Date.now()
    const fileUri = `${DIR}rec_${startedAt}.ts`
    if (/\.m3u8($|\?)/.test(url)) {
        let stopped = false
        try {
            current = { stopHls: () => { stopped = true }, title, fileUri, startedAt }
            armAutoStop(autoStopMs)
            void runHlsLoop(url, fileUri, () => stopped).catch(() => { stopped = true })
            void notifyRecordingStarted(title)
            return true
        } catch {
            current = null
            return false
        }
    }
    const task = FileSystem.createDownloadResumable(url, fileUri)
    current = { task, title, fileUri, startedAt }
    armAutoStop(autoStopMs)
    // TS cru não tem ciclo próprio — vigia o disco a cada 30s.
    current.diskWatch = setInterval(() => {
        void diskFull().then(full => { if (full) void stopRecording() })
    }, 30_000)
    // O downloadAsync só "termina" quando o stop pausar — erro real limpa tudo.
    void task.downloadAsync().catch(() => undefined)
    void notifyRecordingStarted(title)
    return true
}

/** Auto-stop: "gravar por X" / "até o fim do programa" param sozinhos. */
function armAutoStop(ms?: number): void {
    if (!current || !ms || ms <= 0) return
    current.autoStop = setTimeout(() => { void stopRecording() }, ms)
}

/** Para e registra a gravação nos Downloads (null = não estava gravando). */
export async function stopRecording(): Promise<string | null> {
    if (!current) return null
    const { task, stopHls, title, fileUri, startedAt, autoStop, diskWatch } = current
    if (autoStop) clearTimeout(autoStop)
    if (diskWatch) clearInterval(diskWatch)
    current = null
    stopHls?.()
    await task?.pauseAsync().catch(() => undefined)
    // HLS: dá um respiro pro handle fechar antes de medir o arquivo.
    if (stopHls) await new Promise(resolve => setTimeout(resolve, 500))
    const info = await FileSystem.getInfoAsync(fileUri).catch(() => null)
    if (!info?.exists || !('size' in info) || info.size <= 0) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined)
        return null
    }
    const id = `rec:${startedAt}`
    await addLocalDownload({
        id,
        title: `⏺ ${title}`,
        cover: '',
        container: 'ts',
        fileUri,
        sizeBytes: info.size,
        downloadedAt: Date.now(),
    })
    return id
}
