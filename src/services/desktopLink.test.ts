import { describe, expect, it, vi } from 'vitest'
import { parseDesktopPush } from './desktopLink'

// Hoisted pelo vitest — evita os imports reais (que puxam react-native).
// O ./notify entrou no grafo (expo-notifications referencia __DEV__, que não
// existe no vitest) — mock total como os demais.
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('expo-router', () => ({ router: { push: vi.fn(), replace: vi.fn() } }))
vi.mock('./session', () => ({ getClient: vi.fn(async () => null) }))
vi.mock('./zap', () => ({ setZapContext: vi.fn() }))
vi.mock('./notify', () => ({ notifyNow: vi.fn(async () => undefined) }))

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

    it('parseFavoritesPush mapeia channel→live e ignora lixo', async () => {
        const { parseFavoritesPush } = await import('./desktopLink')
        expect(parseFavoritesPush(JSON.stringify({ type: 'favorites', items: [
            { id: '10', type: 'channel' }, { id: '20', type: 'movie' }, { id: '', type: 'series' }, { type: 'series' },
        ] }))).toEqual([{ kind: 'live', id: '10' }, { kind: 'movie', id: '20' }])
        expect(parseFavoritesPush(JSON.stringify({ type: 'favorites' }))).toBeNull()
        expect(parseFavoritesPush('lixo')).toBeNull()
    })

    it('parseRemindersPush só devolve lembretes futuros válidos', async () => {
        const { parseRemindersPush } = await import('./desktopLink')
        const nowMs = Date.parse('2026-07-18T12:00:00Z')
        expect(parseRemindersPush(JSON.stringify({ type: 'reminders', items: [
            { title: 'Jogo', channelName: 'ESPN', startIso: '2026-07-18T15:00:00Z' },
            { title: 'Passado', channelName: 'X', startIso: '2026-07-18T10:00:00Z' },
            { title: '', startIso: '2026-07-18T15:00:00Z' },
        ] }), nowMs)).toEqual([{ title: 'Jogo', channelName: 'ESPN', startMs: Date.parse('2026-07-18T15:00:00Z') }])
        expect(parseRemindersPush('nada', nowMs)).toBeNull()
    })
})
