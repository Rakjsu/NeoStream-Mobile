import { describe, it, expect, vi } from 'vitest'
import { pushError } from './errorLog'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('pushError', () => {
    it('novo erro no topo, cap fixo', () => {
        let list = pushError([], { at: 1, message: 'a' }, 3)
        list = pushError(list, { at: 2, message: 'b' }, 3)
        list = pushError(list, { at: 3, message: 'c' }, 3)
        list = pushError(list, { at: 4, message: 'd' }, 3)
        expect(list.map(e => e.message)).toEqual(['d', 'c', 'b'])
    })
})
