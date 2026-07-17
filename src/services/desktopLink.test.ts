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
