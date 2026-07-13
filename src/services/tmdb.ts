/**
 * Enriquecimento opcional das fichas via TMDB, com a CHAVE DO USUÁRIO
 * (Configurações → APIs) — nunca embutida no app, igual ao NeoStream desktop.
 * Sem chave = ficha do provedor, como sempre. Parsers e merge são PUROS;
 * o provedor sempre vence quando tem o campo — o TMDB só preenche buraco.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { VodDetails } from './xtream'

const KEY_STORAGE = 'neostream_tmdb_key'

let keyCache: string | null = null

export async function getTmdbKey(): Promise<string> {
    if (keyCache !== null) return keyCache
    try {
        keyCache = (await AsyncStorage.getItem(KEY_STORAGE)) ?? ''
    } catch {
        keyCache = ''
    }
    return keyCache
}

export async function setTmdbKey(key: string): Promise<void> {
    keyCache = key.trim()
    try {
        if (keyCache) await AsyncStorage.setItem(KEY_STORAGE, keyCache)
        else await AsyncStorage.removeItem(KEY_STORAGE)
    } catch { /* best-effort */ }
}

/** Só pra testes. */
export function resetTmdbCache(): void {
    keyCache = null
}

/** Nome do provedor → título buscável: fora tags, qualidade e idioma (PURO). */
export function cleanTitle(name: string): string {
    return name
        .replace(/[[(][^\])]*[\])]/g, ' ')
        .replace(/\b(fhd|uhd|hd|sd|4k|h265|hevc|dual|dublado|legendado|leg|dub)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export function searchUrl(kind: 'movie' | 'tv', title: string, key: string, language: string): string {
    const url = new URL(`https://api.themoviedb.org/3/search/${kind}`)
    url.searchParams.append('api_key', key)
    url.searchParams.append('query', title)
    url.searchParams.append('language', language)
    return url.toString()
}

export function detailsUrl(kind: 'movie' | 'tv', id: number, key: string, language: string): string {
    const url = new URL(`https://api.themoviedb.org/3/${kind}/${id}`)
    url.searchParams.append('api_key', key)
    url.searchParams.append('language', language)
    url.searchParams.append('append_to_response', 'videos,credits')
    return url.toString()
}

/** Primeiro id da busca (PURO; null = nada encontrado). */
export function parseSearchId(data: unknown): number | null {
    const results = (data as { results?: unknown[] })?.results
    const first = Array.isArray(results) ? (results[0] as { id?: unknown } | undefined) : undefined
    return typeof first?.id === 'number' ? first.id : null
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Ficha do TMDB achatada pro shape das fichas do app (PURO). */
export function parseTmdbDetails(data: unknown): VodDetails {
    const obj = (data ?? {}) as Record<string, unknown>
    const genres = Array.isArray(obj.genres)
        ? obj.genres.map(genre => text((genre as { name?: unknown }).name)).filter(Boolean).join(', ')
        : ''
    const videos = ((obj.videos as { results?: unknown[] } | undefined)?.results ?? []) as
        { site?: unknown; type?: unknown; key?: unknown }[]
    const trailer = videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')
        ?? videos.find(video => video.site === 'YouTube')
    const cast = (((obj.credits as { cast?: unknown[] } | undefined)?.cast ?? []) as { name?: unknown }[])
        .slice(0, 5).map(person => text(person.name)).filter(Boolean).join(', ')
    const poster = text(obj.poster_path)
    return {
        plot: text(obj.overview),
        genre: genres,
        releaseDate: text(obj.release_date) || text(obj.first_air_date),
        rating: typeof obj.vote_average === 'number' && obj.vote_average > 0 ? obj.vote_average.toFixed(1) : '',
        duration: typeof obj.runtime === 'number' && obj.runtime > 0 ? `${obj.runtime} min` : '',
        cover: poster ? `https://image.tmdb.org/t/p/w500${poster}` : '',
        trailer: typeof trailer?.key === 'string' ? `https://www.youtube.com/watch?v=${trailer.key}` : '',
        cast,
        director: '',
    }
}

/** Provedor vence quando tem o campo; TMDB preenche os buracos (PURO). */
export function mergeDetails(provider: VodDetails, tmdb: VodDetails): VodDetails {
    return {
        plot: provider.plot || tmdb.plot,
        genre: provider.genre || tmdb.genre,
        releaseDate: provider.releaseDate || tmdb.releaseDate,
        rating: provider.rating || tmdb.rating,
        duration: provider.duration || tmdb.duration,
        cover: provider.cover || tmdb.cover,
        trailer: provider.trailer || tmdb.trailer,
        cast: provider.cast || tmdb.cast,
        director: provider.director || tmdb.director,
    }
}

export function emptyVodDetails(): VodDetails {
    return { plot: '', genre: '', releaseDate: '', rating: '', duration: '', cover: '', trailer: '', cast: '', director: '' }
}

const TMDB_LANG: Record<string, string> = { pt: 'pt-BR', es: 'es-ES', en: 'en-US' }

/** Busca + ficha no TMDB. null = sem chave/sem resultado; nunca lança. */
export async function fetchTmdbDetails(kind: 'movie' | 'tv', rawTitle: string, lang: string): Promise<VodDetails | null> {
    const key = await getTmdbKey()
    const title = cleanTitle(rawTitle)
    if (!key || !title) return null
    try {
        const language = TMDB_LANG[lang] ?? 'en-US'
        const searchResp = await fetch(searchUrl(kind, title, key, language))
        if (!searchResp.ok) return null
        const id = parseSearchId(await searchResp.json())
        if (!id) return null
        const detailsResp = await fetch(detailsUrl(kind, id, key, language))
        if (!detailsResp.ok) return null
        return parseTmdbDetails(await detailsResp.json())
    } catch {
        return null
    }
}
