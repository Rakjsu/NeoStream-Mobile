import { describe, it, expect, vi } from 'vitest'
import { isTV, overscan, scaledSize, tvSize } from './tv'

// Sem ambiente nativo nos testes: o Platform vira um celular comum.
vi.mock('react-native', () => ({ Platform: { isTV: false } }))

describe('escala 10-foot', () => {
    it('na TV cresce pelo fator e arredonda; fora dela fica intacto', () => {
        expect(scaledSize(100, true)).toBe(130)
        expect(scaledSize(11, true)).toBe(14)
        expect(scaledSize(100, false)).toBe(100)
        expect(scaledSize(96, true, 1.5)).toBe(144)
    })

    it('no ambiente de teste (sem TV) tvSize e identidade e overscan e 0', () => {
        expect(isTV).toBe(false)
        expect(tvSize(42)).toBe(42)
        expect(overscan).toBe(0)
    })
})
