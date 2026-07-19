/**
 * 💻 Item 12 — enviar um download pronto do celular pro NeoStream desktop
 * (inverso do "baixar gravação do PC"). Faz upload binário pro endpoint
 * POST /transfer do controle web, autenticado pelo PIN do pareamento.
 */
import * as FileSystem from 'expo-file-system/legacy'
import { getDesktopLinkConfig } from './desktopLink'
import type { DownloadItem } from './downloads'

/** PURO: monta a URL do upload pro receptor do desktop. */
export function buildTransferUrl(
    scheme: 'http' | 'https',
    addr: string,
    pin: string,
    item: Pick<DownloadItem, 'id' | 'title' | 'container'>,
): string {
    const kind = item.id.startsWith('episode:') ? 'episode' : 'movie'
    const name = `${item.title}.${item.container || 'mp4'}`
    return `${scheme}://${addr}/transfer?pin=${encodeURIComponent(pin)}`
        + `&kind=${kind}&name=${encodeURIComponent(name)}&title=${encodeURIComponent(item.title)}`
}

export type TransferResult = { ok: true } | { ok: false; error: 'unpaired' | 'pin' | 'network' }

/** Sobe o arquivo pro PC. O controle web roda em http OU https — tenta os dois. */
export async function sendDownloadToDesktop(item: DownloadItem): Promise<TransferResult> {
    const config = await getDesktopLinkConfig()
    if (!config.addr || !config.pin) return { ok: false, error: 'unpaired' }
    for (const scheme of ['http', 'https'] as const) {
        try {
            const res = await FileSystem.uploadAsync(
                buildTransferUrl(scheme, config.addr, config.pin, item),
                item.fileUri,
                { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT },
            )
            if (res.status === 403) return { ok: false, error: 'pin' }
            if (res.status >= 200 && res.status < 300) return { ok: true }
        } catch {
            // esquema indisponível — tenta o próximo
        }
    }
    return { ok: false, error: 'network' }
}
