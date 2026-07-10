/**
 * Cliente Xtream Codes — PURO (fetch + URL), sem imports de React Native,
 * pra lógica de protocolo ficar testável com vitest. Mesmo protocolo do
 * NeoStream desktop (player_api.php + URLs /live /movie /series).
 */

export interface XtreamAccount {
    url: string
    username: string
    password: string
}

export interface UserInfo {
    username?: string
    status?: string
    exp_date?: string | null
    is_trial?: string
    active_cons?: string | number
    max_connections?: string | number
    auth?: number
}

export interface LiveChannel {
    stream_id: number | string
    name: string
    stream_icon?: string
    category_id?: string
}

export interface VodMovie {
    stream_id: number | string
    name: string
    stream_icon?: string
    container_extension?: string
    category_id?: string
    rating?: string | number
}

export interface SeriesItem {
    series_id: number | string
    name: string
    cover?: string
    category_id?: string
    rating?: string | number
}

export interface Episode {
    id: number | string
    episode_num: number | string
    title?: string
    container_extension?: string
    info?: { duration?: string; plot?: string }
}

export interface SeriesInfo {
    info?: { name?: string; plot?: string; cover?: string }
    /** temporada ("1", "2", …) → episódios */
    episodes?: Record<string, Episode[]>
}

export interface Category {
    category_id: string
    category_name: string
}

/** Normaliza a URL do provedor: garante esquema e remove a barra final. */
export function normalizeBaseUrl(raw: string): string {
    let url = raw.trim()
    if (!url) return ''
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`
    while (url.endsWith('/')) url = url.slice(0, -1)
    return url
}

/** Resposta do player_api sem action: autenticação + dados da conta. */
export function parseAuthResponse(data: unknown): UserInfo {
    const obj = (data ?? {}) as { user_info?: UserInfo }
    const info = obj.user_info
    if (!info) throw new Error('Resposta inválida do servidor (sem user_info).')
    if (info.auth === 0) throw new Error('Usuário ou senha incorretos.')
    return info
}

/** exp_date do Xtream é epoch em segundos (string); null/ausente = sem expiração. */
export function parseExpiry(expDate: string | null | undefined): Date | null {
    if (!expDate) return null
    const seconds = Number(expDate)
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return new Date(seconds * 1000)
}

/** Filtro defensivo: só itens com id e nome viram linhas da UI. */
export function sanitizeList<T extends { name?: unknown }>(
    data: unknown,
    idKey: 'stream_id' | 'series_id',
): T[] {
    if (!Array.isArray(data)) return []
    return data.filter((item): item is T => {
        const it = item as Record<string, unknown> | null
        return !!it && (typeof it[idKey] === 'number' || (typeof it[idKey] === 'string' && it[idKey] !== ''))
            && typeof it.name === 'string' && it.name !== ''
    })
}

export class XtreamClient {
    private baseUrl: string
    private username: string
    private password: string

    constructor(account: XtreamAccount) {
        this.baseUrl = normalizeBaseUrl(account.url)
        this.username = account.username
        this.password = account.password
    }

    apiUrl(action?: string, params: Record<string, string> = {}): string {
        const url = new URL(`${this.baseUrl}/player_api.php`)
        url.searchParams.append('username', this.username)
        url.searchParams.append('password', this.password)
        if (action) url.searchParams.append('action', action)
        for (const [key, value] of Object.entries(params)) url.searchParams.append(key, value)
        return url.toString()
    }

    private async request(action?: string, params: Record<string, string> = {}): Promise<unknown> {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 20000)
        try {
            const response = await fetch(this.apiUrl(action, params), { signal: controller.signal })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return await response.json()
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Tempo esgotado — o servidor demorou demais pra responder.')
            }
            throw error
        } finally {
            clearTimeout(timer)
        }
    }

    async authenticate(): Promise<UserInfo> {
        return parseAuthResponse(await this.request())
    }

    async getLiveChannels(): Promise<LiveChannel[]> {
        return sanitizeList<LiveChannel>(await this.request('get_live_streams'), 'stream_id')
    }

    async getVodMovies(): Promise<VodMovie[]> {
        return sanitizeList<VodMovie>(await this.request('get_vod_streams'), 'stream_id')
    }

    async getSeries(): Promise<SeriesItem[]> {
        return sanitizeList<SeriesItem>(await this.request('get_series'), 'series_id')
    }

    async getSeriesInfo(seriesId: string | number): Promise<SeriesInfo> {
        return (await this.request('get_series_info', { series_id: String(seriesId) })) as SeriesInfo
    }

    async getLiveCategories(): Promise<Category[]> {
        const data = await this.request('get_live_categories')
        return Array.isArray(data) ? (data as Category[]) : []
    }

    /** TV ao vivo em HLS — o ExoPlayer toca .m3u8 nativamente. */
    liveStreamUrl(streamId: number | string): string {
        return `${this.baseUrl}/live/${this.username}/${this.password}/${streamId}.m3u8`
    }

    vodStreamUrl(streamId: number | string, container = 'mp4'): string {
        return `${this.baseUrl}/movie/${this.username}/${this.password}/${streamId}.${container}`
    }

    seriesStreamUrl(episodeId: number | string, container = 'mp4'): string {
        return `${this.baseUrl}/series/${this.username}/${this.password}/${episodeId}.${container}`
    }
}
