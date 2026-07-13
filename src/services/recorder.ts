/**
 * REC sem ffmpeg: canal ao vivo em .ts é um arquivo sem fim — o gravador
 * despeja o stream em disco até o STOP, e a gravação vira um item offline
 * nos Downloads (o ExoPlayer toca TS cru). HLS (.m3u8) fica de fora por ora.
 */
import * as FileSystem from 'expo-file-system/legacy'
import { addLocalDownload } from './downloads'

const DIR = `${FileSystem.documentDirectory}downloads/`

interface ActiveRecording {
    task: FileSystem.DownloadResumable
    title: string
    fileUri: string
    startedAt: number
}

let current: ActiveRecording | null = null

export function recordingTitle(): string | null {
    return current?.title ?? null
}

/** URL gravável? (dump direto só funciona em stream cru, não em playlist) */
export function canRecordUrl(url: string): boolean {
    return !/\.m3u8($|\?)/.test(url)
}

export async function startRecording(url: string, title: string): Promise<boolean> {
    if (current || !canRecordUrl(url)) return false
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined)
    const startedAt = Date.now()
    const fileUri = `${DIR}rec_${startedAt}.ts`
    const task = FileSystem.createDownloadResumable(url, fileUri)
    current = { task, title, fileUri, startedAt }
    // O downloadAsync só "termina" quando o stop pausar — erro real limpa tudo.
    void task.downloadAsync().catch(() => undefined)
    return true
}

/** Para e registra a gravação nos Downloads (null = não estava gravando). */
export async function stopRecording(): Promise<string | null> {
    if (!current) return null
    const { task, title, fileUri, startedAt } = current
    current = null
    await task.pauseAsync().catch(() => undefined)
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
