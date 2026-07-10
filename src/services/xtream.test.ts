import { describe, it, expect } from 'vitest'
import {
    normalizeBaseUrl,
    parseAuthResponse,
    parseExpiry,
    sanitizeList,
    XtreamClient,
    type LiveChannel,
} from './xtream'

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
