import { describe, expect, it, vi } from 'vitest'
import { hasItem, toggleItem, type WatchItem } from './watchlist'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
}))

const item = (id: string, kind: WatchItem['kind'] = 'movie'): WatchItem =>
    ({ kind, id, name: `Item ${id}`, cover: '', addedAt: 1 })

describe('toggleItem / hasItem', () => {
    it('adiciona no início e remove no segundo toggle', () => {
        let list = toggleItem([], item('1'))
        list = toggleItem(list, item('2'))
        expect(list.map(entry => entry.id)).toEqual(['2', '1'])
        list = toggleItem(list, item('2'))
        expect(list.map(entry => entry.id)).toEqual(['1'])
    })

    it('filme e série com o mesmo id não conflitam', () => {
        const list = toggleItem(toggleItem([], item('7', 'movie')), item('7', 'series'))
        expect(list).toHaveLength(2)
        expect(hasItem(list, 'movie', '7')).toBe(true)
        expect(hasItem(list, 'series', '7')).toBe(true)
    })

    it('respeita o teto de 100 itens', () => {
        let list: WatchItem[] = []
        for (let i = 0; i < 105; i++) list = toggleItem(list, item(String(i)))
        expect(list).toHaveLength(100)
        expect(list[0].id).toBe('104')
    })
})
