import { describe, it, expect } from 'vitest'
import {
    cmdToUrl, normalizeMac, normalizePortalUrl, parseHandshakeToken,
    decodeStalkerArchive, encodeStalkerArchive,
    decodeStalkerEpisode, encodeStalkerEpisode, parseCreateLink, parseStalkerChannels, parseStalkerPrograms,
    parseStalkerEpg, parseStalkerGenres, parseStalkerSeasons, parseStalkerVodPage, seasonNumberFromName,
} from './stalker'

describe('normalizePortalUrl / normalizeMac', () => {
    it('limpa o /c do STB e completa o esquema', () => {
        expect(normalizePortalUrl('portal.tv/c/')).toBe('http://portal.tv')
        expect(normalizePortalUrl('http://portal.tv:8080/')).toBe('http://portal.tv:8080')
        expect(normalizePortalUrl('')).toBe('')
    })

    it('MAC vira maiúsculo padronizado; lixo vira vazio', () => {
        expect(normalizeMac(' 00:1a:79:ab:cd:ef ')).toBe('00:1A:79:AB:CD:EF')
        expect(normalizeMac('00-1A-79-AB-CD-EF')).toBe('')
        expect(normalizeMac('não é mac')).toBe('')
    })
})

describe('parsers do portal', () => {
    it('token do handshake', () => {
        expect(parseHandshakeToken({ js: { token: 'ABC123' } })).toBe('ABC123')
        expect(parseHandshakeToken({ js: {} })).toBe('')
        expect(parseHandshakeToken(null)).toBe('')
    })

    it('canais: mapeia id/nome/logo/gênero/cmd e descarta linha quebrada', () => {
        const channels = parseStalkerChannels({
            js: {
                data: [
                    { id: 101, name: 'Globo HD', logo: 'http://l/g.png', tv_genre_id: 3, cmd: 'ffmpeg http://s/101.ts' },
                    { id: 102, name: '' }, // sem nome → fora
                    { name: 'Sem id' },
                ],
            },
        })
        expect(channels).toHaveLength(1)
        expect(channels[0]).toEqual({ id: '101', name: 'Globo HD', logo: 'http://l/g.png', genreId: '3', cmd: 'ffmpeg http://s/101.ts' })
    })

    it('gêneros: descarta o "All" (a UI já tem o chip Todos)', () => {
        const genres = parseStalkerGenres({ js: [{ id: '*', title: 'All' }, { id: 3, title: 'Abertos' }] })
        expect(genres).toEqual([{ category_id: '3', category_name: 'Abertos' }])
    })

    it('cmd → URL: tira o prefixo ffmpeg/auto e aguenta cmd sem URL', () => {
        expect(cmdToUrl('ffmpeg http://srv/101.ts')).toBe('http://srv/101.ts')
        expect(cmdToUrl('auto https://srv/x.m3u8')).toBe('https://srv/x.m3u8')
        expect(cmdToUrl('http://direto/1.ts')).toBe('http://direto/1.ts')
        expect(cmdToUrl('localchannel 5')).toBe('')
    })
})

describe('fase 2: VOD + EPG do portal', () => {
    it('página de VOD: itens válidos + total (pra paginação parar)', () => {
        const page = parseStalkerVodPage({
            js: {
                total_items: 40,
                data: [
                    { id: 9, name: 'Matrix', screenshot_uri: 'http://c/m.jpg', category_id: 2, cmd: 'auto http://v/9.mp4', description: 'Pílulas.' },
                    { id: 10 }, // sem nome → fora
                ],
            },
        })
        expect(page.totalItems).toBe(40)
        expect(page.items).toHaveLength(1)
        expect(page.items[0]).toMatchObject({ id: '9', name: 'Matrix', categoryId: '2', plot: 'Pílulas.' })
    })

    it('EPG: escolhe o agora pelo relógio e o próximo mais cedo', () => {
        const NOW = 1_000_000 * 1000
        const epg = parseStalkerEpg({
            js: [
                { name: 'Agora', start_timestamp: 999_000, stop_timestamp: 1_001_000 },
                { name: 'Depois2', start_timestamp: 1_003_000, stop_timestamp: 1_004_000 },
                { name: 'Depois1', start_timestamp: 1_001_000, stop_timestamp: 1_003_000 },
                { name: 'Quebrado' },
            ],
        }, NOW)
        expect(epg.now?.title).toBe('Agora')
        expect(epg.next?.title).toBe('Depois1')
    })

    it('EPG vazio devolve nulls', () => {
        expect(parseStalkerEpg({ js: [] }, 0)).toEqual({ now: null, next: null })
    })
})

describe('fase 3: séries do portal', () => {
    it('temporadas: episódios do array series[], linha sem id fora', () => {
        const seasons = parseStalkerSeasons({
            js: { data: [
                { id: 'S1', name: 'Season 1', series: [1, 2, 3], cmd: '/media/serial_1.mpg' },
                { name: 'sem id' },
            ] },
        })
        expect(seasons).toHaveLength(1)
        expect(seasons[0]).toEqual({ id: 'S1', name: 'Season 1', episodes: [1, 2, 3], cmd: '/media/serial_1.mpg' })
    })

    it('número da temporada sai do nome (fallback pro índice)', () => {
        expect(seasonNumberFromName('Season 2', 9)).toBe(2)
        expect(seasonNumberFromName('Temporada 03', 9)).toBe(3)
        expect(seasonNumberFromName('Extras', 4)).toBe(4)
    })

    it('URL adiada: encode/decode redondinho', () => {
        const url = encodeStalkerEpisode('S1:2', 7)
        expect(decodeStalkerEpisode(url)).toEqual({ seasonId: 'S1:2', episode: 7 })
        expect(decodeStalkerEpisode('http://normal')).toBeNull()
    })

    it('create_link → URL tocável', () => {
        expect(parseCreateLink({ js: { cmd: 'ffmpeg http://srv/ep7.mpg?token=x' } })).toBe('http://srv/ep7.mpg?token=x')
        expect(parseCreateLink({ js: {} })).toBe('')
    })
})

describe('catch-up do portal (tv_archive)', () => {
    it('encode/decode do replay adiado', () => {
        const url = encodeStalkerArchive('123/abc')
        expect(url).toBe('stalker://archive/123%2Fabc')
        expect(decodeStalkerArchive(url)).toBe('123/abc')
        expect(decodeStalkerArchive('stalker://ep/1/2')).toBeNull()
        expect(decodeStalkerArchive('http://x')).toBeNull()
    })

    it('parseStalkerPrograms carrega o id do programa', () => {
        const programs = parseStalkerPrograms({ js: [
            { id: 99, name: 'Jornal', start_timestamp: '100', stop_timestamp: '200' },
            { name: 'Sem id', start_timestamp: '300', stop_timestamp: '400' },
        ] })
        expect(programs[0].id).toBe('99')
        expect(programs[1].id).toBeUndefined()
    })

    it('parseStalkerChannels lê o enable_tv_archive', () => {
        const channels = parseStalkerChannels({ js: { data: [
            { id: 1, name: 'Com replay', enable_tv_archive: 1 },
            { id: 2, name: 'Sem replay', enable_tv_archive: 0 },
            { id: 3, name: 'Portal antigo' },
        ] } })
        expect(channels.map(c => c.tvArchive)).toEqual([true, false, false])
    })
})
