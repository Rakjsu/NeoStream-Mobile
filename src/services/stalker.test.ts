import { describe, it, expect } from 'vitest'
import {
    cmdToUrl, normalizeMac, normalizePortalUrl, parseHandshakeToken,
    parseStalkerChannels, parseStalkerGenres,
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
