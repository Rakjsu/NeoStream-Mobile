import { describe, it, expect } from 'vitest'
import {
    cmdToUrl, normalizeMac, normalizePortalUrl, parseHandshakeToken,
    parseStalkerChannels, parseStalkerEpg, parseStalkerGenres, parseStalkerVodPage,
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
