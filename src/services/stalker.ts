/**
 * Portais Stalker/MAC (Ministra) — fase 1: TV AO VIVO.
 *
 * O portal autentica por MAC address (handshake → token Bearer) e fala um
 * JSON próprio ({ js: ... }). Os parsers são PUROS (testáveis); o
 * StalkerClient implementa o mesmo CatalogClient dos outros tipos, então as
 * telas não mudam. VOD/séries do portal ficam pra fase 2 (mesma trilha do
 * desktop: R26 live → R27/28 VOD+séries).
 */
import { withRetry } from './net'
import type {
    CatalogClient, Category, LiveChannel, NowNext, SeriesInfo,
    SeriesItem, UserInfo, VodDetails, VodMovie,
} from './xtream'

export interface StalkerChannel {
    id: string
    name: string
    logo: string
    genreId: string
    cmd: string
}

/** `http://portal.tv/c/` → `http://portal.tv` (o /c é a página do STB). */
export function normalizePortalUrl(raw: string): string {
    let url = raw.trim()
    if (!url) return ''
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`
    while (url.endsWith('/')) url = url.slice(0, -1)
    if (url.endsWith('/c')) url = url.slice(0, -2)
    while (url.endsWith('/')) url = url.slice(0, -1)
    return url
}

/** "00:1a:79:ab:cd:ef" → maiúsculo padronizado; '' se não parece MAC. */
export function normalizeMac(raw: string): string {
    const mac = raw.trim().toUpperCase()
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : ''
}

/** Resposta do portal: { js: ... } (às vezes string JSON dupla). */
export function parseJs<T>(data: unknown): T | null {
    const obj = data as { js?: T } | null
    return obj && 'js' in (obj as object) ? (obj as { js: T }).js : null
}

export function parseHandshakeToken(data: unknown): string {
    const js = parseJs<{ token?: string }>(data)
    return typeof js?.token === 'string' ? js.token : ''
}

/** `ffmpeg http://...` / `auto http://...` → só a URL tocável. */
export function cmdToUrl(cmd: string): string {
    const clean = cmd.trim()
    const match = /(https?:\/\/\S+)/.exec(clean)
    return match?.[1] ?? ''
}

export function parseStalkerChannels(data: unknown): StalkerChannel[] {
    const js = parseJs<{ data?: unknown[] }>(data)
    const rows = Array.isArray(js?.data) ? js.data : []
    return rows.flatMap(row => {
        const item = row as { id?: unknown; name?: unknown; logo?: unknown; tv_genre_id?: unknown; cmd?: unknown }
        if (item?.id === undefined || typeof item.name !== 'string' || !item.name) return []
        return [{
            id: String(item.id),
            name: item.name,
            logo: typeof item.logo === 'string' ? item.logo : '',
            genreId: item.tv_genre_id === undefined ? '' : String(item.tv_genre_id),
            cmd: typeof item.cmd === 'string' ? item.cmd : '',
        }]
    })
}

export function parseStalkerGenres(data: unknown): Category[] {
    const js = parseJs<unknown[]>(data)
    const rows = Array.isArray(js) ? js : []
    return rows.flatMap(row => {
        const item = row as { id?: unknown; title?: unknown }
        if (item?.id === undefined || typeof item.title !== 'string') return []
        // O portal manda um gênero "All" — a UI já tem o chip Todos.
        if (item.title.toLowerCase() === 'all') return []
        return [{ category_id: String(item.id), category_name: item.title }]
    })
}

// ---------------------------------------------------------------- client --

export class StalkerClient implements CatalogClient {
    private baseUrl: string
    private mac: string
    private token = ''
    private channels: StalkerChannel[] | null = null
    private urlById = new Map<string, string>()

    constructor(portalUrl: string, mac: string) {
        this.baseUrl = normalizePortalUrl(portalUrl)
        this.mac = normalizeMac(mac)
    }

    private endpoint(params: Record<string, string>): string {
        const url = new URL(`${this.baseUrl}/server/load.php`)
        for (const [key, value] of Object.entries(params)) url.searchParams.append(key, value)
        url.searchParams.append('JsHttpRequest', '1-xml')
        return url.toString()
    }

    private async request(params: Record<string, string>): Promise<unknown> {
        return withRetry(async () => {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 20000)
            try {
                const headers: Record<string, string> = {
                    // O portal identifica o "aparelho" pelos cookies de STB.
                    Cookie: `mac=${encodeURIComponent(this.mac)}; stb_lang=en; timezone=GMT`,
                    'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
                    'X-User-Agent': 'Model: MAG250; Link: WiFi',
                }
                if (this.token) headers.Authorization = `Bearer ${this.token}`
                const response = await fetch(this.endpoint(params), { signal: controller.signal, headers })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return await response.json() as unknown
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new Error('Tempo esgotado — o portal demorou demais pra responder.')
                }
                throw error
            } finally {
                clearTimeout(timer)
            }
        })
    }

    private async ensureToken(): Promise<void> {
        if (this.token) return
        const token = parseHandshakeToken(await this.request({ type: 'stb', action: 'handshake', token: '' }))
        if (!token) throw new Error('O portal recusou o handshake (MAC bloqueado?).')
        this.token = token
        // get_profile "registra" a sessão — vários portais exigem antes das listas.
        await this.request({ type: 'stb', action: 'get_profile' }).catch(() => undefined)
    }

    private async loadChannels(): Promise<StalkerChannel[]> {
        if (this.channels) return this.channels
        await this.ensureToken()
        const channels = parseStalkerChannels(await this.request({ type: 'itv', action: 'get_all_channels' }))
        for (const channel of channels) {
            const url = cmdToUrl(channel.cmd)
            if (url) this.urlById.set(channel.id, url)
        }
        this.channels = channels
        return channels
    }

    async authenticate(): Promise<UserInfo> {
        if (!this.mac) throw new Error('MAC inválido — use o formato 00:1A:79:XX:XX:XX.')
        const channels = await this.loadChannels()
        if (channels.length === 0) throw new Error('O portal não devolveu canais pra esse MAC.')
        return { status: 'Portal Stalker', auth: 1 }
    }

    async getLiveChannels(): Promise<LiveChannel[]> {
        return (await this.loadChannels()).map(channel => ({
            stream_id: channel.id,
            name: channel.name,
            stream_icon: channel.logo,
            category_id: channel.genreId,
        }))
    }

    async getLiveCategories(): Promise<Category[]> {
        await this.ensureToken()
        return parseStalkerGenres(await this.request({ type: 'itv', action: 'get_genres' }))
    }

    /** Fase 2: VOD/séries do portal. */
    async getVodMovies(): Promise<VodMovie[]> { return [] }
    async getVodCategories(): Promise<Category[]> { return [] }
    async getSeries(): Promise<SeriesItem[]> { return [] }
    async getSeriesCategories(): Promise<Category[]> { return [] }
    async getSeriesInfo(): Promise<SeriesInfo> { return {} }
    async getVodDetails(): Promise<VodDetails> {
        return { plot: '', genre: '', releaseDate: '', rating: '', duration: '', cover: '', trailer: '', cast: '', director: '' }
    }
    async getShortEpg(): Promise<NowNext> { return { now: null, next: null } }

    liveStreamUrl(streamId: number | string): string {
        return this.urlById.get(String(streamId)) ?? ''
    }
    vodStreamUrl(): string { return '' }
    seriesStreamUrl(): string { return '' }
}
