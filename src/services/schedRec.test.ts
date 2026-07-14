import { describe, it, expect, vi } from 'vitest'
import { splitDue, type ScheduledRec } from './schedRec'

// Hoisted pelo vitest — evita os imports reais (react-native/expo).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('./notify', () => ({ notifyAt: vi.fn() }))
vi.mock('./recorder', () => ({ recordingTitle: vi.fn(), startRecording: vi.fn() }))
vi.mock('./session', () => ({ getClient: vi.fn() }))

const rec = (startMs: number, endMs: number): ScheduledRec =>
    ({ channelId: '1', channelName: 'Globo', title: 'Jogo', startMs, endMs })

describe('splitDue (triagem das gravações agendadas)', () => {
    it('separa as devidas agora das futuras e descarta as vencidas', () => {
        const now = 1_000_000
        const { due, keep } = splitDue([
            rec(now - 10, now + 10), // no ar → due
            rec(now + 100, now + 200), // futura → keep
            rec(now - 200, now - 100), // vencida → some
        ], now)
        expect(due).toHaveLength(1)
        expect(due[0].startMs).toBe(now - 10)
        expect(keep).toHaveLength(1)
        expect(keep[0].startMs).toBe(now + 100)
    })

    it('lista vazia devolve tudo vazio', () => {
        expect(splitDue([], 123)).toEqual({ due: [], keep: [] })
    })
})
