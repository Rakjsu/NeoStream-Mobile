/**
 * Listas M3U (fase 1: TV ao vivo). O parser é PURO (testável); o M3uClient
 * implementa a mesma interface do XtreamClient, então as telas não mudam —
 * filmes/séries devolvem vazio até a fase 2.
 */
import type {
    CatalogClient, Category, LiveChannel, NowNext, SeriesInfo,
    SeriesItem, UserInfo, VodDetails, VodMovie,
} from './xtream'

export interface M3uChannel {
    id: string
    name: string
    logo: string
    group: string
    url: string
}

/** Valor de um atributo `chave="valor"` do #EXTINF ('' quando ausente). */
function attribute(line: string, name: string): string {
    const match = new RegExp(`${name}="([^"]*)"`).exec(line)
    return match?.[1]?.trim() ?? ''
}

/**
 * O nome vem depois da vírgula que fecha os atributos. Procurar a primeira
 * vírgula APÓS a última aspa aguenta tanto atributos com vírgula quanto
 * títulos com vírgula ("Canal, o melhor").
 */
function extinfName(line: string): string {
    const lastQuote = line.lastIndexOf('"')
    const comma = line.indexOf(',', lastQuote + 1)
    return comma >= 0 ? line.slice(comma + 1).trim() : ''
}

/** #EXTINF + URL na linha seguinte; diretivas (#EXTVLCOPT…) são ignoradas. */
export function parseM3u(text: string): M3uChannel[] {
    const channels: M3uChannel[] = []
    let pending: Omit<M3uChannel, 'id' | 'url'> | null = null
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line.startsWith('#EXTINF')) {
            pending = {
                name: extinfName(line),
                logo: attribute(line, 'tvg-logo'),
                group: attribute(line, 'group-title'),
            }
        } else if (line && !line.startsWith('#')) {
            if (pending && pending.name) {
                channels.push({ id: `m3u_${channels.length}`, ...pending, url: line })
            }
            pending = null
        }
    }
    return channels
}

export class M3uClient implements CatalogClient {
    private playlistUrl: string
    private channels: M3uChannel[] | null = null
    private urlById = new Map<string, string>()

    constructor(playlistUrl: string) {
        this.playlistUrl = playlistUrl
    }

    private async load(): Promise<M3uChannel[]> {
        if (this.channels) return this.channels
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30000)
        try {
            const response = await fetch(this.playlistUrl, { signal: controller.signal })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            this.channels = parseM3u(await response.text())
            for (const channel of this.channels) this.urlById.set(channel.id, channel.url)
            return this.channels
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Tempo esgotado ao baixar a lista M3U.')
            }
            throw error
        } finally {
            clearTimeout(timer)
        }
    }

    async authenticate(): Promise<UserInfo> {
        const channels = await this.load()
        if (channels.length === 0) throw new Error('Nenhum canal encontrado na lista M3U.')
        return { status: 'Lista M3U', auth: 1 }
    }

    async getLiveChannels(): Promise<LiveChannel[]> {
        return (await this.load()).map(channel => ({
            stream_id: channel.id,
            name: channel.name,
            stream_icon: channel.logo,
            category_id: channel.group,
        }))
    }

    /** Os group-title distintos, na ordem em que aparecem na lista. */
    async getLiveCategories(): Promise<Category[]> {
        const seen = new Set<string>()
        const categories: Category[] = []
        for (const channel of await this.load()) {
            if (!channel.group || seen.has(channel.group)) continue
            seen.add(channel.group)
            categories.push({ category_id: channel.group, category_name: channel.group })
        }
        return categories
    }

    // Fase 2: VOD/séries da M3U. Por ora as abas mostram os estados vazios.
    async getVodMovies(): Promise<VodMovie[]> { return [] }
    async getVodCategories(): Promise<Category[]> { return [] }
    async getSeries(): Promise<SeriesItem[]> { return [] }
    async getSeriesCategories(): Promise<Category[]> { return [] }
    async getSeriesInfo(): Promise<SeriesInfo> { return {} }
    async getVodDetails(): Promise<VodDetails> {
        return { plot: '', genre: '', releaseDate: '', rating: '', duration: '', cover: '', trailer: '', cast: '', director: '' }
    }
    /** M3U cru não tem EPG (url-tvg fica pra fase 2). */
    async getShortEpg(): Promise<NowNext> { return { now: null, next: null } }

    liveStreamUrl(streamId: number | string): string {
        return this.urlById.get(String(streamId)) ?? ''
    }
    vodStreamUrl(): string { return '' }
    seriesStreamUrl(): string { return '' }
}
