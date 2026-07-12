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
    loadMedia(request: { mediaInfo: CastMediaInfo; startTime?: number }): Promise<unknown>
    play(): Promise<unknown>
    pause(): Promise<unknown>
    onMediaProgressUpdated(handler: (progress: number) => void, interval?: number): { remove(): void }
}

interface CastSession {
    client: CastClient
}

interface SessionManager {
    getCurrentCastSession(): Promise<CastSession | null>
    onSessionStarted(handler: (session: CastSession) => void): { remove(): void }
    endCurrentSession(stopCasting?: boolean): Promise<unknown>
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

/** Controles da transmissão em andamento (o player usa sem tocar no nativo). */
export interface CastControls {
    play(): void
    pause(): void
    /** Encerra a sessão (a TV para de tocar). */
    stop(): void
    /** Progresso do receiver em segundos, a cada ~5s — alimenta o histórico. */
    onProgress(handler: (positionSec: number) => void): () => void
}

function controlsFor(session: CastSession): CastControls {
    return {
        play: () => { void session.client.play().catch(() => undefined) },
        pause: () => { void session.client.pause().catch(() => undefined) },
        stop: () => { void api?.getSessionManager().endCurrentSession(true).catch(() => undefined) },
        onProgress: handler => {
            try {
                const sub = session.client.onMediaProgressUpdated(progress => handler(progress), 5)
                return () => sub.remove()
            } catch {
                return () => undefined
            }
        },
    }
}

/**
 * Manda a mídia pra sessão de cast ativa, retomando do ponto dado (segundos),
 * e devolve os controles — null se não há sessão.
 */
export async function castToCurrentSession(
    url: string,
    title: string,
    cover: string,
    live: boolean,
    startTimeSec = 0,
): Promise<CastControls | null> {
    try {
        const session = await api?.getSessionManager().getCurrentCastSession()
        if (!session) return null
        await session.client.loadMedia({
            ...mediaFor(url, title, cover, live),
            startTime: !live && startTimeSec > 0 ? Math.floor(startTimeSec) : undefined,
        })
        return controlsFor(session)
    } catch {
        return null
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
