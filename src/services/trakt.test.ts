import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseEpisodeTitle, pickSearchHit, syncTraktWatched } from './trakt'

// Storage funcional em memória — creds/token de verdade nos testes de sync.
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: async (key: string) => store.get(key) ?? null,
            setItem: async (key: string, value: string) => { store.set(key, value) },
            removeItem: async (key: string) => { store.delete(key) },
        },
    }
})

afterEach(() => vi.unstubAllGlobals())

describe('parseEpisodeTitle', () => {
    it('extrai série/temporada/episódio dos formatos comuns', () => {
        expect(parseEpisodeTitle('Dark · S01E03 — Passado e presente')).toEqual({ show: 'Dark', season: 1, episode: 3 })
        expect(parseEpisodeTitle('Breaking Bad S05 E14')).toEqual({ show: 'Breaking Bad', season: 5, episode: 14 })
        expect(parseEpisodeTitle('The Office - S02E01')).toEqual({ show: 'The Office', season: 2, episode: 1 })
    })

    it('sem SxxEyy devolve null (melhor não sincronizar que errar)', () => {
        expect(parseEpisodeTitle('Jornal Nacional')).toBeNull()
        expect(parseEpisodeTitle('')).toBeNull()
    })
})

describe('pickSearchHit', () => {
    it('título igual (e ano) vence o primeiro resultado', () => {
        const results = [
            { movie: { title: 'Duna Fake', year: 2000, ids: { trakt: 1 } } },
            { movie: { title: 'Duna', year: 2021, ids: { trakt: 2 } } },
        ]
        expect(pickSearchHit(results, 'duna', 2021)?.ids).toEqual({ trakt: 2 })
    })

    it('sem match exato cai no primeiro; lista vazia devolve null', () => {
        const results = [{ show: { title: 'Outra Coisa', ids: { trakt: 9 } } }]
        expect(pickSearchHit(results, 'dark')?.ids).toEqual({ trakt: 9 })
        expect(pickSearchHit([], 'dark')).toBeNull()
    })
})

describe('syncTraktWatched', () => {
    it('desconectado (sem token) devolve false sem tocar a rede', async () => {
        const spy = vi.fn()
        vi.stubGlobal('fetch', spy)
        expect(await syncTraktWatched('movie', 'Duna (2021)')).toBe(false)
        expect(spy).not.toHaveBeenCalled()
    })
})

describe('scrobble e watchlist desconectados', () => {
    it('devolvem false/[] sem tocar a rede', async () => {
        const spy = vi.fn()
        vi.stubGlobal('fetch', spy)
        const { traktScrobble, fetchTraktWatchlist } = await import('./trakt')
        expect(await traktScrobble('start', 'movie', 'Duna (2021)', 0)).toBe(false)
        expect(await fetchTraktWatchlist()).toEqual([])
        expect(spy).not.toHaveBeenCalled()
    })
})

describe('fetchTraktPlayback', () => {
    it('desconectado devolve [] sem rede', async () => {
        const spy = vi.fn()
        vi.stubGlobal('fetch', spy)
        const { fetchTraktPlayback } = await import('./trakt')
        expect(await fetchTraktPlayback()).toEqual([])
        expect(spy).not.toHaveBeenCalled()
    })
})

describe('fetchTraktPlayback conectado', () => {
    it('converte filmes e episódios, ignora >=95%', async () => {
        const { setTraktCreds, pollDeviceToken, fetchTraktPlayback, disconnectTrakt } = await import('./trakt')
        await setTraktCreds({ clientId: 'cid', clientSecret: 'sec' })
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ access_token: 'tok' }) })))
        expect(await pollDeviceToken('dev')).toBe('ok')
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ([
            { type: 'movie', progress: 40, paused_at: '2026-07-01T00:00:00Z', movie: { title: 'Duna' } },
            { type: 'episode', progress: 60, episode: { season: 1, number: 3 }, show: { title: 'Dark' } },
            { type: 'movie', progress: 97, movie: { title: 'Quase visto' } },
        ]) })))
        const list = await fetchTraktPlayback()
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ kind: 'movie', title: 'Duna', progress: 40 })
        expect(list[1]).toMatchObject({ kind: 'episode', title: 'Dark', season: 1, episode: 3 })
        await disconnectTrakt()
    })
})
