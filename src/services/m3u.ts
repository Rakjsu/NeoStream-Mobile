/**
 * Listas M3U. O parser e o classificador são PUROS (testáveis); o M3uClient
 * implementa a mesma interface do XtreamClient, então as telas não mudam.
 *
 * Fase 2: além da TV ao vivo, a lista vira catálogo — entradas com extensão
 * de vídeo são FILMES e nomes com SxxEyy viram SÉRIES agrupadas por
 * temporada (mesma heurística do NeoStream desktop).
 */
import type {
    CatalogClient, Category, Episode, LiveChannel, NowNext, SeriesInfo,
    SeriesItem, UserInfo, VodDetails, VodMovie,
} from './xtream'
import { lookupNowNext, parseXmltv, type XmltvGuide } from './xmltv'

export interface M3uChannel {
    id: string
    name: string
    logo: string
    group: string
    url: string
    /** id do canal no XMLTV (atributo tvg-id) — opcional, usado pelo EPG. */
    tvgId?: string
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

/** URL do XMLTV no cabeçalho da playlist (`#EXTM3U url-tvg="…"`); '' se não há. */
export function parseTvgUrl(text: string): string {
    const header = text.split(/\r?\n/, 1)[0] ?? ''
    if (!header.startsWith('#EXTM3U')) return ''
    const value = attribute(header, 'url-tvg') || attribute(header, 'x-tvg-url')
    // Alguns provedores listam várias URLs separadas por vírgula — a primeira basta.
    return value.split(',')[0]?.trim() ?? ''
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
                tvgId: attribute(line, 'tvg-id'),
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

// ------------------------------------------------- classificação (fase 2) --

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|wmv|webm)(\?.*)?$/i
const SXXEYY_RE = /\bS(\d{1,2})\s*[.\-_ ]?\s*E(\d{1,3})\b/i

export interface M3uEpisodeRef {
    seriesName: string
    season: number
    episode: number
}

/** "Nome da Série S01E02 …" → série/temporada/episódio (null se não casa). */
export function parseSeriesTag(name: string): M3uEpisodeRef | null {
    const match = SXXEYY_RE.exec(name)
    if (!match) return null
    const seriesName = name.slice(0, match.index).replace(/[\s\-–—|:]+$/g, '').trim()
    if (!seriesName) return null
    return { seriesName, season: Number(match[1]), episode: Number(match[2]) }
}

export type M3uKind = 'live' | 'movie' | 'episode'

/** SxxEyy no nome → episódio; extensão de vídeo na URL → filme; senão TV. */
export function classifyM3uEntry(channel: M3uChannel): M3uKind {
    if (parseSeriesTag(channel.name)) return 'episode'
    if (VIDEO_EXT_RE.test(channel.url)) return 'movie'
    return 'live'
}

/** Extensão do arquivo da URL ('mp4' como fallback pro player). */
export function containerOf(url: string): string {
    return VIDEO_EXT_RE.exec(url)?.[1]?.toLowerCase() ?? 'mp4'
}

export interface M3uSeries {
    id: string
    name: string
    cover: string
    group: string
    /** temporada ("1", "2"…) → episódios ordenados. */
    seasons: Record<string, { channelId: string; episode: number; title: string; container: string }[]>
}

export interface M3uCatalog {
    live: M3uChannel[]
    movies: M3uChannel[]
    series: M3uSeries[]
}

/** Separa a lista crua em TV / filmes / séries agrupadas (PURO). */
export function buildM3uCatalog(channels: M3uChannel[]): M3uCatalog {
    const live: M3uChannel[] = []
    const movies: M3uChannel[] = []
    const seriesByKey = new Map<string, M3uSeries>()

    for (const channel of channels) {
        const kind = classifyM3uEntry(channel)
        if (kind === 'live') { live.push(channel); continue }
        if (kind === 'movie') { movies.push(channel); continue }

        const ref = parseSeriesTag(channel.name)!
        const key = ref.seriesName.toLowerCase()
        let series = seriesByKey.get(key)
        if (!series) {
            series = {
                id: `m3u_series_${seriesByKey.size}`,
                name: ref.seriesName,
                cover: channel.logo,
                group: channel.group,
                seasons: {},
            }
            seriesByKey.set(key, series)
        }
        if (!series.cover && channel.logo) series.cover = channel.logo
        const season = String(ref.season)
        series.seasons[season] = series.seasons[season] ?? []
        series.seasons[season].push({
            channelId: channel.id,
            episode: ref.episode,
            title: channel.name,
            container: containerOf(channel.url),
        })
    }

    const series = [...seriesByKey.values()]
    for (const show of series) {
        for (const season of Object.keys(show.seasons)) {
            show.seasons[season].sort((a, b) => a.episode - b.episode)
        }
    }
    return { live, movies, series }
}

/** Grupos distintos, na ordem em que aparecem. */
function groupsOf(items: { group: string }[]): Category[] {
    const seen = new Set<string>()
    const categories: Category[] = []
    for (const item of items) {
        if (!item.group || seen.has(item.group)) continue
        seen.add(item.group)
        categories.push({ category_id: item.group, category_name: item.group })
    }
    return categories
}

export class M3uClient implements CatalogClient {
    private playlistUrl: string
    private catalog: M3uCatalog | null = null
    private urlById = new Map<string, string>()
    private liveById = new Map<string, M3uChannel>()
    private tvgUrl = ''
    private guidePromise: Promise<XmltvGuide | null> | null = null

    constructor(playlistUrl: string) {
        this.playlistUrl = playlistUrl
    }

    private async load(): Promise<M3uCatalog> {
        if (this.catalog) return this.catalog
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30000)
        try {
            const response = await fetch(this.playlistUrl, { signal: controller.signal })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const text = await response.text()
            this.tvgUrl = parseTvgUrl(text)
            const channels = parseM3u(text)
            for (const channel of channels) this.urlById.set(channel.id, channel.url)
            this.catalog = buildM3uCatalog(channels)
            for (const channel of this.catalog.live) this.liveById.set(channel.id, channel)
            return this.catalog
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
        const catalog = await this.load()
        if (catalog.live.length + catalog.movies.length + catalog.series.length === 0) {
            throw new Error('Nenhum item encontrado na lista M3U.')
        }
        return { status: 'Lista M3U', auth: 1 }
    }

    async getLiveChannels(): Promise<LiveChannel[]> {
        return (await this.load()).live.map(channel => ({
            stream_id: channel.id,
            name: channel.name,
            stream_icon: channel.logo,
            category_id: channel.group,
        }))
    }

    async getLiveCategories(): Promise<Category[]> {
        return groupsOf((await this.load()).live)
    }

    async getVodMovies(): Promise<VodMovie[]> {
        return (await this.load()).movies.map(channel => ({
            stream_id: channel.id,
            name: channel.name,
            stream_icon: channel.logo,
            category_id: channel.group,
            container_extension: containerOf(channel.url),
        }))
    }

    async getVodCategories(): Promise<Category[]> {
        return groupsOf((await this.load()).movies)
    }

    async getSeries(): Promise<SeriesItem[]> {
        return (await this.load()).series.map(show => ({
            series_id: show.id,
            name: show.name,
            cover: show.cover,
            category_id: show.group,
        }))
    }

    async getSeriesCategories(): Promise<Category[]> {
        return groupsOf((await this.load()).series)
    }

    async getSeriesInfo(seriesId: string | number): Promise<SeriesInfo> {
        const show = (await this.load()).series.find(s => s.id === String(seriesId))
        if (!show) return {}
        const episodes: Record<string, Episode[]> = {}
        for (const [season, list] of Object.entries(show.seasons)) {
            episodes[season] = list.map(ep => ({
                id: ep.channelId,
                episode_num: ep.episode,
                title: ep.title,
                container_extension: ep.container,
            }))
        }
        return { info: { name: show.name, cover: show.cover }, episodes }
    }

    async getVodDetails(): Promise<VodDetails> {
        return { plot: '', genre: '', releaseDate: '', rating: '', duration: '', cover: '', trailer: '', cast: '', director: '' }
    }

    /**
     * XMLTV do `url-tvg` baixado UMA vez por sessão (lazy, na primeira consulta)
     * e reduzido a agora/a seguir por canal. Qualquer falha vira EPG vazio —
     * a lista continua funcionando sem guia.
     */
    private loadGuide(): Promise<XmltvGuide | null> {
        if (this.guidePromise) return this.guidePromise
        this.guidePromise = (async () => {
            if (!this.tvgUrl) return null
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 30000)
            try {
                const response = await fetch(this.tvgUrl, { signal: controller.signal })
                if (!response.ok) return null
                const xml = await response.text()
                // Guarda de tamanho: XMLTV maior que isso não cabe num celular.
                if (xml.length > 40_000_000) return null
                return parseXmltv(xml, Date.now())
            } catch {
                return null
            } finally {
                clearTimeout(timer)
            }
        })()
        return this.guidePromise
    }

    async getShortEpg(streamId: number | string): Promise<NowNext> {
        await this.load()
        const channel = this.liveById.get(String(streamId))
        if (!channel) return { now: null, next: null }
        const guide = await this.loadGuide()
        if (!guide) return { now: null, next: null }
        return lookupNowNext(guide, channel.tvgId ?? '', channel.name)
    }

    liveStreamUrl(streamId: number | string): string {
        return this.urlById.get(String(streamId)) ?? ''
    }
    vodStreamUrl(streamId: number | string): string {
        return this.urlById.get(String(streamId)) ?? ''
    }
    seriesStreamUrl(episodeId: number | string): string {
        return this.urlById.get(String(episodeId)) ?? ''
    }
}
