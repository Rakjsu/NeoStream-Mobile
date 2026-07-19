import { describe, expect, it } from 'vitest'
import { handoffToPlayerParams } from './handoff'

describe('handoffToPlayerParams (item 39 — QR do desktop)', () => {
    it('filme válido vira params do player com pid e startAt', () => {
        expect(handoffToPlayerParams({ kind: 'movie', sid: '42', container: 'mkv', name: 'Filme', pos: '4520' })).toEqual({
            kind: 'movie', sid: '42', container: 'mkv', title: 'Filme', pid: 'movie:42', startAt: 4520,
        })
    })

    it('série vira kind episode e defaults seguros', () => {
        const params = handoffToPlayerParams({ kind: 'series', sid: 'e9' })
        expect(params?.kind).toBe('episode')
        expect(params?.pid).toBe('episode:e9')
        expect(params?.container).toBe('mp4')
        expect(params?.startAt).toBe(0)
    })

    it('rejeita kind desconhecido e sid vazio; pos inválida vira 0', () => {
        expect(handoffToPlayerParams({ kind: 'live', sid: '1' })).toBeNull()
        expect(handoffToPlayerParams({ kind: 'movie', sid: '  ' })).toBeNull()
        expect(handoffToPlayerParams({ kind: 'movie', sid: '1', pos: 'abc' })?.startAt).toBe(0)
    })
})
