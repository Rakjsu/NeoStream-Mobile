import { describe, it, expect } from 'vitest'
import { buildM3uCatalog, classifyM3uEntry, containerOf, parseM3u, parseSeriesTag, parseTvgUrl, type M3uChannel } from './m3u'

describe('parseM3u (fase 1: canais)', () => {
    it('extrai nome, logo, grupo e URL; ignora diretivas e linhas soltas', () => {
        const playlist = [
            '#EXTM3U',
            '#EXTINF:-1 tvg-id="globo" tvg-logo="http://logo/globo.png" group-title="Abertos",Globo HD',
            'http://prov.tv/globo.m3u8',
            '#EXTINF:-1 group-title="Filmes, Ação",Canal, o melhor', // vírgula no atributo E no título
            '#EXTVLCOPT:http-user-agent=X',
            'http://prov.tv/canal.ts',
            '#EXTINF:-1,Sem Atributos',
            'http://prov.tv/simples.ts',
            '',
            'linha-orfã-sem-extinf.ts',
        ].join('\n')

        const channels = parseM3u(playlist)
        expect(channels).toHaveLength(3)
        expect(channels[0]).toEqual({
            id: 'm3u_0', name: 'Globo HD', logo: 'http://logo/globo.png',
            group: 'Abertos', url: 'http://prov.tv/globo.m3u8', tvgId: 'globo',
        })
        expect(channels[1].name).toBe('Canal, o melhor')
        expect(channels[1].group).toBe('Filmes, Ação')
        expect(channels[1].url).toBe('http://prov.tv/canal.ts')
        expect(channels[2]).toMatchObject({ id: 'm3u_2', name: 'Sem Atributos', logo: '', group: '' })
    })

    it('CRLF, lista vazia e EXTINF sem nome não quebram', () => {
        expect(parseM3u('#EXTM3U\r\n#EXTINF:-1 tvg-logo="x",TV\r\nhttp://u.ts\r\n')[0].name).toBe('TV')
        expect(parseM3u('')).toEqual([])
        expect(parseM3u('#EXTINF:-1 group-title="G",\nhttp://sem-nome.ts')).toEqual([])
    })
})

describe('parseSeriesTag / classify (fase 2)', () => {
    const ch = (name: string, url: string): M3uChannel => ({ id: 'x', name, logo: '', group: '', url })

    it('reconhece as variações de SxxEyy e limpa o nome da série', () => {
        expect(parseSeriesTag('Breaking Bad S01E02')).toEqual({ seriesName: 'Breaking Bad', season: 1, episode: 2 })
        expect(parseSeriesTag('The Office - S2 E10')).toEqual({ seriesName: 'The Office', season: 2, episode: 10 })
        expect(parseSeriesTag('Dark s03e08')).toEqual({ seriesName: 'Dark', season: 3, episode: 8 })
        expect(parseSeriesTag('Filme de 2018')).toBeNull()
        expect(parseSeriesTag('S01E01 sem nome antes')).toBeNull()
    })

    it('episódio > filme (extensão) > TV ao vivo', () => {
        expect(classifyM3uEntry(ch('Show S01E01', 'http://p/ep.mkv'))).toBe('episode')
        expect(classifyM3uEntry(ch('Matrix', 'http://p/matrix.mp4?token=1'))).toBe('movie')
        expect(classifyM3uEntry(ch('Globo HD', 'http://p/globo.m3u8'))).toBe('live')
        expect(classifyM3uEntry(ch('Canal 24h', 'http://p/canal.ts'))).toBe('live')
        expect(containerOf('http://p/filme.MKV?x=1')).toBe('mkv')
        expect(containerOf('http://p/live.m3u8')).toBe('mp4')
    })
})

describe('buildM3uCatalog', () => {
    it('separa TV/filmes e agrupa episódios por série/temporada ordenados', () => {
        const catalog = buildM3uCatalog(parseM3u([
            '#EXTINF:-1 group-title="Abertos",Globo HD',
            'http://p/globo.m3u8',
            '#EXTINF:-1 tvg-logo="http://l/bb.png" group-title="Séries",Breaking Bad S01E02',
            'http://p/bb-s01e02.mkv',
            '#EXTINF:-1 group-title="Séries",Breaking Bad S01E01',
            'http://p/bb-s01e01.mkv',
            '#EXTINF:-1 group-title="Séries",breaking bad S02E01', // casing diferente = mesma série
            'http://p/bb-s02e01.mp4',
            '#EXTINF:-1 group-title="Filmes",Matrix',
            'http://p/matrix.mp4',
        ].join('\n')))

        expect(catalog.live.map(c => c.name)).toEqual(['Globo HD'])
        expect(catalog.movies.map(c => c.name)).toEqual(['Matrix'])
        expect(catalog.series).toHaveLength(1)

        const bb = catalog.series[0]
        expect(bb.name).toBe('Breaking Bad')
        expect(bb.cover).toBe('http://l/bb.png')
        expect(bb.seasons['1'].map(e => e.episode)).toEqual([1, 2]) // ordenado
        expect(bb.seasons['2']).toHaveLength(1)
        expect(bb.seasons['2'][0].container).toBe('mp4')
    })
})

describe('parseTvgUrl', () => {
    it('extrai o url-tvg do cabeçalho (primeira URL quando há várias)', () => {
        expect(parseTvgUrl('#EXTM3U url-tvg="http://epg/a.xml,http://epg/b.xml"\n#EXTINF…')).toBe('http://epg/a.xml')
        expect(parseTvgUrl('#EXTM3U x-tvg-url="http://epg/guia.xml"\n')).toBe('http://epg/guia.xml')
    })

    it('sem cabeçalho ou sem atributo devolve vazio', () => {
        expect(parseTvgUrl('#EXTINF:-1,TV\nhttp://u.ts')).toBe('')
        expect(parseTvgUrl('#EXTM3U\n')).toBe('')
    })
})
