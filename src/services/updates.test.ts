import { describe, it, expect, vi } from 'vitest'
import { isNewerVersion, parseVersion } from './updates'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('parseVersion / isNewerVersion', () => {
    it('aceita com e sem "v" e compara componente a componente', () => {
        expect(parseVersion('v0.3.0')).toEqual([0, 3, 0])
        expect(parseVersion('1.2')).toEqual([1, 2])
        expect(parseVersion('beta')).toEqual([])

        expect(isNewerVersion('0.2.0', 'v0.3.0')).toBe(true)
        expect(isNewerVersion('0.3.0', 'v0.3.0')).toBe(false)
        expect(isNewerVersion('0.3.1', 'v0.3.0')).toBe(false)
        expect(isNewerVersion('0.9.0', 'v1.0.0')).toBe(true)
        expect(isNewerVersion('1.0', 'v1.0.1')).toBe(true) // comprimentos diferentes
    })

    it('tag inválida nunca dispara aviso', () => {
        expect(isNewerVersion('0.2.0', 'nightly')).toBe(false)
        expect(isNewerVersion('', 'v9.9.9')).toBe(false)
    })
})
