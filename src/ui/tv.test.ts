import { describe, it, expect, vi } from 'vitest'
import { getOverscan, isTV, OVERSCAN_STEPS, scaledSize, setOverscan, tvSize } from './tv'

// Sem ambiente nativo nos testes: o Platform vira um celular comum.
vi.mock('react-native', () => ({ Platform: { isTV: false } }))
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}))

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
        expect(getOverscan()).toBe(0)
    })

    it('overscan ajustável: clamp 0–64 e passos oferecidos', () => {
        setOverscan(999)
        expect(getOverscan()).toBe(64)
        setOverscan(-5)
        expect(getOverscan()).toBe(0)
        setOverscan(48)
        expect(getOverscan()).toBe(48)
        expect(OVERSCAN_STEPS).toContain(0)
        expect(OVERSCAN_STEPS.every(px => px >= 0 && px <= 64)).toBe(true)
        setOverscan(0) // devolve o padrão de celular pros demais testes
    })
})
