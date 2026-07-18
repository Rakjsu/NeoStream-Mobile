import { describe, expect, it, vi } from 'vitest'
import { parseDesktopPush } from './desktopLink'

// Hoisted pelo vitest — evita os imports reais (que puxam react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('expo-router', () => ({ router: { push: vi.fn(), replace: vi.fn() } }))
vi.mock('./session', () => ({ getClient: vi.fn(async () => null) }))
vi.mock('./zap', () => ({ setZapContext: vi.fn() }))

describe('parseDesktopPush (comando playOnMobile do desktop)', () => {
    it('aceita o formato do desktop e preserva streamId/nome', () => {
        const push = parseDesktopPush(JSON.stringify({ type: 'playOnMobile', streamId: '42', name: 'Globo FHD' }))
        expect(push).toEqual({ streamId: '42', name: 'Globo FHD' })
    })

    it('nome ausente vira string vazia', () => {
        expect(parseDesktopPush(JSON.stringify({ type: 'playOnMobile', streamId: '7' })))
            .toEqual({ streamId: '7', name: '' })
    })

    it('ignora outros tipos de mensagem do servidor (state, guide…) e lixo', () => {
        expect(parseDesktopPush(JSON.stringify({ type: 'state', playing: true }))).toBeNull()
        expect(parseDesktopPush(JSON.stringify({ type: 'playOnMobile', streamId: 42 }))).toBeNull()
        expect(parseDesktopPush(JSON.stringify({ type: 'playOnMobile', streamId: '' }))).toBeNull()
        expect(parseDesktopPush('{oops')).toBeNull()
    })
})

describe('parseVodPush / parseNotifyPush (pushes novos do desktop)', () => {
    it('aceita VOD e episódio com defaults sensatos', async () => {
        const { parseVodPush } = await import('./desktopLink')
        expect(parseVodPush(JSON.stringify({ type: 'playVodOnMobile', kind: 'movie', sid: '42', container: 'mkv', name: 'Filme' })))
            .toEqual({ kind: 'movie', sid: '42', container: 'mkv', name: 'Filme' })
        expect(parseVodPush(JSON.stringify({ type: 'playVodOnMobile', kind: 'series', sid: '7' })))
            .toEqual({ kind: 'series', sid: '7', container: 'mp4', name: '' })
        // kind desconhecido cai em movie; sem sid é inválido
        expect(parseVodPush(JSON.stringify({ type: 'playVodOnMobile', kind: 'x', sid: '1' }))?.kind).toBe('movie')
        expect(parseVodPush(JSON.stringify({ type: 'playVodOnMobile' }))).toBeNull()
        expect(parseVodPush('lixo')).toBeNull()
        expect(parseVodPush(JSON.stringify({ type: 'playOnMobile', streamId: '1' }))).toBeNull()
    })

    it('aceita notifyMobile só com título válido', async () => {
        const { parseNotifyPush } = await import('./desktopLink')
        expect(parseNotifyPush(JSON.stringify({ type: 'notifyMobile', title: 'Gravação pronta', body: 'Globo 1h' })))
            .toEqual({ title: 'Gravação pronta', body: 'Globo 1h' })
        expect(parseNotifyPush(JSON.stringify({ type: 'notifyMobile', body: 'sem título' }))).toBeNull()
        expect(parseNotifyPush('{}')).toBeNull()
    })
})
