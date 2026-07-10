import { describe, it, expect } from 'vitest'
import {
    decodeBase64Utf8,
    normalizeBaseUrl,
    parseAuthResponse,
    parseExpiry,
    parseShortEpg,
    parseVodDetails,
    sanitizeCategories,
    sanitizeList,
    XtreamClient,
    type LiveChannel,
} from './xtream'

const b64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64')

describe('decodeBase64Utf8 (sem atob/TextDecoder)', () => {
    it('decodifica ASCII, acentos e emoji', () => {
        expect(decodeBase64Utf8(b64('Jornal Nacional'))).toBe('Jornal Nacional')
        expect(decodeBase64Utf8(b64('Sessão da Tarde — ação'))).toBe('Sessão da Tarde — ação')
        expect(decodeBase64Utf8(b64('Futebol ⚽ 🎬'))).toBe('Futebol ⚽ 🎬')
        expect(decodeBase64Utf8('')).toBe('')
    })
})

describe('parseShortEpg (agora / a seguir pelo relógio)', () => {
    const nowMs = 1_800_000_000_000 // epoch em s: 1_800_000_000
    const listing = (title: string, startS: number, stopS: number) => ({
        title: b64(title), start_timestamp: String(startS), stop_timestamp: String(stopS),
    })

    it('acha o programa em exibição e o próximo', () => {
        const data = {
            epg_listings: [
                listing('Anterior', 1_799_990_000, 1_799_995_000),
                listing('Agora', 1_799_999_000, 1_800_001_000),
                listing('Depois', 1_800_001_000, 1_800_004_000),
            ],
        }
        const result = parseShortEpg(data, nowMs)
        expect(result.now?.title).toBe('Agora')
        expect(result.next?.title).toBe('Depois')
    })

    it('sem programa atual ainda entrega o próximo; lixo vira nulls', () => {
        const gap = parseShortEpg({ epg_listings: [listing('Madrugada', 1_800_002_000, 1_800_003_000)] }, nowMs)
        expect(gap.now).toBeNull()
        expect(gap.next?.title).toBe('Madrugada')

        expect(parseShortEpg({}, nowMs)).toEqual({ now: null, next: null })
        expect(parseShortEpg({ epg_listings: [{ title: b64('Sem horário') }] }, nowMs)).toEqual({ now: null, next: null })
    })
})

describe('normalizeBaseUrl', () => {
    it('adiciona http:// quando falta e remove barras finais', () => {
        expect(normalizeBaseUrl('prov.tv:8080')).toBe('http://prov.tv:8080')
        expect(normalizeBaseUrl('http://prov.tv/')).toBe('http://prov.tv')
        expect(normalizeBaseUrl('https://prov.tv//')).toBe('https://prov.tv')
        expect(normalizeBaseUrl('  http://prov.tv  ')).toBe('http://prov.tv')
        expect(normalizeBaseUrl('')).toBe('')
    })
})

describe('parseAuthResponse', () => {
    it('aceita conta válida e devolve o user_info', () => {
        const info = parseAuthResponse({ user_info: { username: 'u', auth: 1, exp_date: '1799999999' } })
        expect(info.username).toBe('u')
    })
    it('auth 0 → credenciais erradas; sem user_info → resposta inválida', () => {
        expect(() => parseAuthResponse({ user_info: { auth: 0 } })).toThrow(/incorretos/)
        expect(() => parseAuthResponse({ ok: true })).toThrow(/inválida/)
        expect(() => parseAuthResponse(null)).toThrow(/inválida/)
    })
})

describe('parseExpiry', () => {
    it('epoch em segundos vira Date; null/lixo vira null', () => {
        expect(parseExpiry('1800000000')?.getTime()).toBe(1800000000000)
        expect(parseExpiry(null)).toBeNull()
        expect(parseExpiry(undefined)).toBeNull()
        expect(parseExpiry('abc')).toBeNull()
        expect(parseExpiry('0')).toBeNull()
    })
})

describe('sanitizeList', () => {
    it('mantém só itens com id e nome (provedores mandam lixo junto)', () => {
        const raw = [
            { stream_id: 1, name: 'Globo' },
            { stream_id: '2', name: 'SBT' },
            { stream_id: 3 },                 // sem nome
            { name: 'sem id' },
            null,
            'string solta',
        ]
        const list = sanitizeList<LiveChannel>(raw, 'stream_id')
        expect(list.map(c => c.name)).toEqual(['Globo', 'SBT'])
    })
    it('resposta não-array (erro do provedor em JSON) vira lista vazia', () => {
        expect(sanitizeList({ error: 'x' }, 'stream_id')).toEqual([])
        expect(sanitizeList(undefined, 'series_id')).toEqual([])
    })
})

describe('parseVodDetails (ficha do get_vod_info)', () => {
    it('achata os campos e tolera variações de nome', () => {
        const details = parseVodDetails({
            info: {
                plot: ' Um filme. ', genre: 'Ação', releasedate: '2024-03-01',
                rating: 7.8, duration: '01:58:00', movie_image: 'http://img/x.jpg',
            },
        })
        expect(details).toEqual({
            plot: 'Um filme.', genre: 'Ação', releaseDate: '2024-03-01',
            rating: '7.8', duration: '01:58:00', cover: 'http://img/x.jpg',
        })
        // Variante: description/release_date/cover_big.
        const alt = parseVodDetails({ info: { description: 'Alt', release_date: '2020', cover_big: 'http://img/b.jpg' } })
        expect(alt.plot).toBe('Alt')
        expect(alt.releaseDate).toBe('2020')
        expect(alt.cover).toBe('http://img/b.jpg')
        // Lixo → tudo vazio, nada explode.
        expect(parseVodDetails(null).plot).toBe('')
        expect(parseVodDetails({ info: { rating: '' } }).rating).toBe('')
    })
})

describe('sanitizeCategories', () => {
    it('mantém só categorias com id e nome, na ordem do provedor', () => {
        const raw = [
            { category_id: '10', category_name: 'Filmes' },
            { category_id: '', category_name: 'vazia' },
            { category_name: 'sem id' },
            null,
            { category_id: '11', category_name: 'Séries' },
        ]
        expect(sanitizeCategories(raw).map(c => c.category_name)).toEqual(['Filmes', 'Séries'])
        expect(sanitizeCategories({ error: 'x' })).toEqual([])
    })
})

describe('XtreamClient (montagem de URLs)', () => {
    const client = new XtreamClient({ url: 'prov.tv:8080/', username: 'user', password: 'p@ss' })

    it('player_api com credenciais e action', () => {
        const url = new URL(client.apiUrl('get_live_streams'))
        expect(url.origin + url.pathname).toBe('http://prov.tv:8080/player_api.php')
        expect(url.searchParams.get('username')).toBe('user')
        expect(url.searchParams.get('password')).toBe('p@ss')
        expect(url.searchParams.get('action')).toBe('get_live_streams')
    })

    it('URLs de stream: live m3u8, vod e série com container', () => {
        expect(client.liveStreamUrl(42)).toBe('http://prov.tv:8080/live/user/p@ss/42.m3u8')
        expect(client.vodStreamUrl(7, 'mkv')).toBe('http://prov.tv:8080/movie/user/p@ss/7.mkv')
        expect(client.vodStreamUrl(7)).toBe('http://prov.tv:8080/movie/user/p@ss/7.mp4')
        expect(client.seriesStreamUrl('900', 'avi')).toBe('http://prov.tv:8080/series/user/p@ss/900.avi')
    })
})
