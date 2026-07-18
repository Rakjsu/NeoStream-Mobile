import { describe, expect, it } from 'vitest'
import { idleMinutes, pingActivity } from './idle'

describe('idle (gatilho do protetor de tela)', () => {
    it('pingActivity zera o relógio e o idle cresce com o tempo injetado', () => {
        pingActivity()
        expect(idleMinutes()).toBeLessThan(0.1)
        expect(idleMinutes(Date.now() + 5 * 60_000)).toBeCloseTo(5, 1)
        expect(idleMinutes(Date.now() - 60_000)).toBe(0) // relógio pra trás não fica negativo
    })
})
