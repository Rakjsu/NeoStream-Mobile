import { describe, it, expect } from 'vitest'
import { parseM3u } from './m3u'

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
            group: 'Abertos', url: 'http://prov.tv/globo.m3u8',
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
