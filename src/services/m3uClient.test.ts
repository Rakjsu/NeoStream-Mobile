import { describe, it, expect, afterEach, vi } from 'vitest'
import { M3uClient } from './m3u'

const PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-logo="http://logo/globo.png" group-title="Abertos",Globo HD
http://srv/live/globo.m3u8
#EXTINF:-1 group-title="Filmes",Matrix (1999)
http://srv/vod/matrix.mp4
#EXTINF:-1 group-title="Séries",Dark S01E01
http://srv/series/dark-s01e01.mkv
`

function mockFetch(body: string, ok = true, status = 200) {
    const spy = vi.fn(async () => ({ ok, status, text: async () => body }))
    vi.stubGlobal('fetch', spy)
    return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('M3uClient (fetch mockado)', () => {
    it('autentica quando a lista tem itens e baixa a playlist UMA vez (cache)', async () => {
        const spy = mockFetch(PLAYLIST)
        const client = new M3uClient('http://srv/lista.m3u')
        const user = await client.authenticate()
        expect(user.auth).toBe(1)
        await client.getLiveChannels()
        await client.getVodMovies()
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('classifica live/filme/série e preserva logo e grupo', async () => {
        mockFetch(PLAYLIST)
        const client = new M3uClient('http://srv/lista.m3u')
        const [live, movies, series] = await Promise.all([
            client.getLiveChannels(), client.getVodMovies(), client.getSeries(),
        ])
        expect(live).toHaveLength(1)
        expect(live[0].name).toBe('Globo HD')
        expect(live[0].stream_icon).toBe('http://logo/globo.png')
        expect(movies).toHaveLength(1)
        expect(movies[0].container_extension).toBe('mp4')
        expect(series).toHaveLength(1)
        expect(series[0].name.toLowerCase()).toContain('dark')
    })

    it('as URLs de stream apontam pra URL original da playlist', async () => {
        mockFetch(PLAYLIST)
        const client = new M3uClient('http://srv/lista.m3u')
        const [channel] = await client.getLiveChannels()
        expect(client.liveStreamUrl(channel.stream_id)).toBe('http://srv/live/globo.m3u8')
        const [movie] = await client.getVodMovies()
        expect(client.vodStreamUrl(movie.stream_id)).toBe('http://srv/vod/matrix.mp4')
    })

    it('lista vazia recusa a autenticação; HTTP não-ok vira erro', async () => {
        mockFetch('#EXTM3U\n')
        await expect(new M3uClient('http://srv/vazia.m3u').authenticate()).rejects.toThrow(/Nenhum item/)
        mockFetch('', false, 404)
        await expect(new M3uClient('http://srv/404.m3u').authenticate()).rejects.toThrow('HTTP 404')
    })
})
