/**
 * Chromecast via react-native-google-cast — módulo NATIVO: só existe no APK
 * (prebuild); no Expo Go o require falha e o app segue sem cast. Por isso
 * tudo aqui é lazy e best-effort, e as telas perguntam `castAvailable()`
 * antes de mostrar qualquer botão.
 */

interface CastMediaInfo {
    contentUrl: string
    contentType?: string
    metadata?: { type: 'movie' | 'generic'; title?: string; images?: { url: string }[] }
}

interface CastClient {
    loadMedia(request: { mediaInfo: CastMediaInfo }): Promise<unknown>
}

interface CastSession {
    client: CastClient
}

interface SessionManager {
    getCurrentCastSession(): Promise<CastSession | null>
    onSessionStarted(handler: (session: CastSession) => void): { remove(): void }
}

interface GoogleCastApi {
    showCastDialog(): Promise<boolean>
    getSessionManager(): SessionManager
}

let api: GoogleCastApi | null = null
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-cast') as { default?: GoogleCastApi }
    api = mod?.default ?? null
} catch {
    api = null // Expo Go / plataforma sem cast
}

export function castAvailable(): boolean {
    return api !== null
}

/** Abre o seletor de dispositivos Chromecast da rede. */
export async function showCastPicker(): Promise<void> {
    try {
        await api?.showCastDialog()
    } catch { /* best-effort */ }
}

function mediaFor(url: string, title: string, cover: string, live: boolean): { mediaInfo: CastMediaInfo } {
    return {
        mediaInfo: {
            contentUrl: url,
            contentType: live ? 'application/x-mpegURL' : undefined,
            metadata: {
                type: live ? 'generic' : 'movie',
                title,
                images: cover ? [{ url: cover }] : undefined,
            },
        },
    }
}

/** Manda a mídia pra sessão de cast ativa (false se não há sessão). */
export async function castToCurrentSession(url: string, title: string, cover: string, live: boolean): Promise<boolean> {
    try {
        const session = await api?.getSessionManager().getCurrentCastSession()
        if (!session) return false
        await session.client.loadMedia(mediaFor(url, title, cover, live))
        return true
    } catch {
        return false
    }
}

/** Dispara quando o usuário conecta num Chromecast pelo seletor. */
export function onCastSessionStarted(handler: () => void): () => void {
    if (!api) return () => undefined
    try {
        const sub = api.getSessionManager().onSessionStarted(() => handler())
        return () => sub.remove()
    } catch {
        return () => undefined
    }
}
