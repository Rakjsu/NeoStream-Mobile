/**
 * Cliente Xtream Codes — PURO (fetch + URL), sem imports de React Native,
 * pra lógica de protocolo ficar testável com vitest. Mesmo protocolo do
 * NeoStream desktop (player_api.php + URLs /live /movie /series).
 */

import { withRetry } from './net'

export interface XtreamAccount {
    url: string
    username: string
    password: string
    /** 'xtream' (padrão, ausente nas contas antigas) ou lista M3U por URL. */
    type?: 'xtream' | 'm3u' | 'stalker'
}

/**
 * O que as telas consomem — implementado pelo XtreamClient e pelo M3uClient
 * (m3u.ts), então trocar o tipo da conta não muda nenhuma tela.
 */
export interface CatalogClient {
    authenticate(): Promise<UserInfo>
    getLiveChannels(): Promise<LiveChannel[]>
    getLiveCategories(): Promise<Category[]>
    getVodMovies(): Promise<VodMovie[]>
    getVodCategories(): Promise<Category[]>
    getSeries(): Promise<SeriesItem[]>
    getSeriesCategories(): Promise<Category[]>
    getSeriesInfo(seriesId: string | number): Promise<SeriesInfo>
    getVodDetails(vodId: string | number): Promise<VodDetails>
    getShortEpg(streamId: number | string): Promise<NowNext>
    /** Grade do dia do canal (opcional — nem todo tipo de conta tem). */
    getDaySchedule?(streamId: number | string): Promise<EpgProgram[]>
    /** Catch-up: URL do programa que já passou ('' quando não dá). */
    catchupUrl?(streamId: number | string, startMs: number, durationMin: number, programId?: string): string
    liveStreamUrl(streamId: number | string): string
    vodStreamUrl(streamId: number | string, container?: string): string
    seriesStreamUrl(episodeId: number | string, container?: string): string
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
    /** Número do canal no provedor — aparece na lista e guia o zap numérico. */
    num?: number | string
    /** 1 = provedor grava o canal (catch-up/replay disponível). */
    tv_archive?: number | string
    tv_archive_duration?: number | string
}

/** O canal tem catch-up? (o provedor manda 1/'1'/0/'0'/ausente). */
export function hasCatchup(channel: LiveChannel): boolean {
    return Number(channel.tv_archive) === 1
}

export interface VodMovie {
    stream_id: number | string
    name: string
    stream_icon?: string
    container_extension?: string
    category_id?: string
    rating?: string | number
    /** Epoch (s) de quando o provedor adicionou — alimenta "Recentes". */
    added?: string
}

export interface SeriesItem {
    series_id: number | string
    name: string
    cover?: string
    category_id?: string
    rating?: string | number
    /** Epoch (s) da última atualização — alimenta "Recentes". */
    last_modified?: string
}

export interface Episode {
    id: number | string
    episode_num: number | string
    title?: string
    container_extension?: string
    info?: { duration?: string; plot?: string }
}

export interface SeriesInfo {
    info?: {
        name?: string
        plot?: string
        cover?: string
        genre?: string
        releaseDate?: string
        rating?: string | number
    }
    /** temporada ("1", "2", …) → episódios */
    episodes?: Record<string, Episode[]>
}

/** Ficha do filme (get_vod_info), já achatada pro que a tela usa. */
export interface VodDetails {
    plot: string
    genre: string
    releaseDate: string
    rating: string
    duration: string
    cover: string
    /** URL completa do trailer no YouTube ('' quando não tem). */
    trailer: string
    cast: string
    director: string
}

export interface Category {
    category_id: string
    category_name: string
}

export interface EpgProgram {
    title: string
    startMs: number
    endMs: number
    /** Sinopse curta (só no agora/a seguir — a grade fica leve). */
    desc?: string
    /** id do programa no portal (Stalker) — habilita o replay por create_link. */
    id?: string
}

export interface NowNext {
    now: EpgProgram | null
    next: EpgProgram | null
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Base64 → string UTF-8 sem depender de atob/TextDecoder (Hermes não garante
 * nenhum dos dois). Os títulos do get_short_epg vêm assim.
 */
export function decodeBase64Utf8(input: string): string {
    const clean = input.replace(/[^A-Za-z0-9+/]/g, '')
    // indexOf('') seria 0 — char ausente precisa virar -1 explicitamente.
    const code = (ch: string | undefined) => (ch ? B64_ALPHABET.indexOf(ch) : -1)
    const bytes: number[] = []
    for (let i = 0; i < clean.length; i += 4) {
        const c0 = code(clean[i])
        const c1 = code(clean[i + 1])
        if (c0 < 0 || c1 < 0) break
        bytes.push((c0 << 2) | (c1 >> 4))
        const c2 = code(clean[i + 2])
        if (c2 < 0) break
        bytes.push(((c1 & 15) << 4) | (c2 >> 2))
        const c3 = code(clean[i + 3])
        if (c3 < 0) break
        bytes.push(((c2 & 3) << 6) | c3)
    }
    let out = ''
    let i = 0
    while (i < bytes.length) {
        const b = bytes[i++]
        if (b < 0x80) {
            out += String.fromCharCode(b)
        } else if (b < 0xe0) {
            out += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63))
        } else if (b < 0xf0) {
            out += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63))
        } else {
            let cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
            cp -= 0x10000
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023))
        }
    }
    return out
}

/**
 * Resposta do get_short_epg → { agora, a seguir } pelo relógio (`nowMs`).
 * Timestamps do Xtream são epoch em segundos; títulos em base64.
 */
export function parseShortEpg(data: unknown, nowMs: number): NowNext {
    const listings = (data as { epg_listings?: unknown })?.epg_listings
    if (!Array.isArray(listings)) return { now: null, next: null }
    const programs: EpgProgram[] = listings
        .map(raw => {
            const it = (raw ?? {}) as Record<string, unknown>
            return {
                title: decodeBase64Utf8(String(it.title ?? '')).trim(),
                startMs: Number(it.start_timestamp) * 1000,
                endMs: Number(it.stop_timestamp) * 1000,
                desc: decodeBase64Utf8(String(it.description ?? '')).trim().slice(0, 240) || undefined,
            }
        })
        .filter(p => p.title !== '' && Number.isFinite(p.startMs) && Number.isFinite(p.endMs) && p.endMs > p.startMs)
        .sort((a, b) => a.startMs - b.startMs)
    const now = programs.find(p => p.startMs <= nowMs && nowMs < p.endMs) ?? null
    const next = programs.find(p => p.startMs > nowMs) ?? null
    return { now, next }
}

/** Normaliza a URL do provedor: garante esquema e remove a barra final. */
export function normalizeBaseUrl(raw: string): string {
    let url = raw.trim()
    if (!url) return ''
    // Lista M3U importada de arquivo local: preserva o esquema file://.
    if (!/^(https?|file):\/\//i.test(url)) url = `http://${url}`
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
/**
 * get_simple_data_table → grade do canal, ordenada (PURO). Janela: 12h pra
 * trás (candidatos a replay/catch-up) e 24h pra frente.
 */
export function parseDaySchedule(data: unknown, nowMs: number): EpgProgram[] {
    const obj = (data ?? {}) as { epg_listings?: unknown[] }
    const rows = Array.isArray(obj.epg_listings) ? obj.epg_listings : []
    const pastLimit = nowMs - 12 * 3600_000
    const horizon = nowMs + 48 * 3600_000 // guia por dia mostra ate amanha inteiro
    return rows.flatMap(row => {
        const item = row as { title?: unknown; start_timestamp?: unknown; stop_timestamp?: unknown }
        const startMs = Number(item?.start_timestamp) * 1000
        const endMs = Number(item?.stop_timestamp) * 1000
        if (typeof item?.title !== 'string' || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return []
        if (endMs <= pastLimit || startMs > horizon) return []
        const title = decodeBase64Utf8(item.title).trim() || item.title
        return [{ title, startMs, endMs }]
    }).sort((a, b) => a.startMs - b.startMs)
}

/**
 * Início do timeshift no formato do Xtream: "YYYY-MM-DD:HH-MM", no fuso do
 * aparelho (mesma convenção dos players IPTV consagrados).
 */
export function catchupStartStamp(startMs: number): string {
    const date = new Date(startMs)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `:${pad(date.getHours())}-${pad(date.getMinutes())}`
}

/** Dias inteiros até a data (0 = hoje; negativo = venceu; null = sem data). */
export function daysUntil(date: Date | null, nowMs: number): number | null {
    if (!date) return null
    return Math.floor((date.getTime() - nowMs) / 86_400_000)
}

/**
 * Formato alternativo do stream ao vivo Xtream: .m3u8 ↔ .ts. Provedor que só
 * serve um dos dois quebra o outro — o player tenta o irmão antes de desistir.
 */
export function alternateLiveUrl(url: string): string | null {
    if (!/\/live\//.test(url)) return null
    if (url.endsWith('.m3u8')) return url.slice(0, -5) + '.ts'
    if (url.endsWith('.ts')) return url.slice(0, -3) + '.m3u8'
    return null
}

export function parseExpiry(expDate: string | null | undefined): Date | null {
    if (!expDate) return null
    const seconds = Number(expDate)
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return new Date(seconds * 1000)
}

/** info do get_vod_info → ficha achatada (provedores variam os campos). */
export function parseVodDetails(data: unknown): VodDetails {
    const info = ((data as { info?: unknown })?.info ?? {}) as Record<string, unknown>
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    return {
        plot: text(info.plot) || text(info.description),
        genre: text(info.genre),
        releaseDate: text(info.releasedate) || text(info.release_date),
        rating: info.rating != null && info.rating !== '' ? String(info.rating) : '',
        duration: text(info.duration),
        cover: text(info.movie_image) || text(info.cover_big),
        trailer: youtubeUrl(text(info.youtube_trailer) || text(info.trailer)),
        cast: text(info.cast) || text(info.actors),
        director: text(info.director),
    }
}

/** youtube_trailer vem ora como id ora como URL completa. */
export function youtubeUrl(trailer: string): string {
    const t = trailer.trim()
    if (!t) return ''
    if (/^https?:\/\//i.test(t)) return t
    return `https://www.youtube.com/watch?v=${t}`
}

/** Categorias válidas (id + nome), na ordem do provedor. */
export function sanitizeCategories(data: unknown): Category[] {
    if (!Array.isArray(data)) return []
    return data.filter((item): item is Category => {
        const it = item as Record<string, unknown> | null
        return !!it && typeof it.category_id === 'string' && it.category_id !== ''
            && typeof it.category_name === 'string' && it.category_name !== ''
    })
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

export class XtreamClient implements CatalogClient {
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
        // withRetry: 5xx/timeout ganham mais 2 tentativas; 4xx falha na hora.
        return withRetry(async () => {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 20000)
            try {
                const response = await fetch(this.apiUrl(action, params), { signal: controller.signal })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return await response.json() as unknown
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new Error('Tempo esgotado — o servidor demorou demais pra responder.')
                }
                throw error
            } finally {
                clearTimeout(timer)
            }
        })
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

    async getVodDetails(vodId: string | number): Promise<VodDetails> {
        return parseVodDetails(await this.request('get_vod_info', { vod_id: String(vodId) }))
    }

    async getLiveCategories(): Promise<Category[]> {
        return sanitizeCategories(await this.request('get_live_categories'))
    }

    async getVodCategories(): Promise<Category[]> {
        return sanitizeCategories(await this.request('get_vod_categories'))
    }

    async getSeriesCategories(): Promise<Category[]> {
        return sanitizeCategories(await this.request('get_series_categories'))
    }

    /** "Agora / a seguir" de um canal (busca sob demanda no guia). */
    async getDaySchedule(streamId: number | string): Promise<EpgProgram[]> {
        const data = await this.request('get_simple_data_table', { stream_id: String(streamId) })
        return parseDaySchedule(data, Date.now())
    }

    async getShortEpg(streamId: number | string): Promise<NowNext> {
        return parseShortEpg(
            await this.request('get_short_epg', { stream_id: String(streamId), limit: '4' }),
            Date.now(),
        )
    }

    /** Replay de programa gravado pelo provedor (canal com tv_archive=1). */
    catchupUrl(streamId: number | string, startMs: number, durationMin: number): string {
        return `${this.baseUrl}/timeshift/${this.username}/${this.password}` +
            `/${durationMin}/${catchupStartStamp(startMs)}/${streamId}.ts`
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
