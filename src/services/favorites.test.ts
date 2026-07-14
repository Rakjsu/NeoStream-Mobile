import { describe, it, expect, vi } from 'vitest'
import { emptyFavorites, isFavorite, moveFavorite, toggleFavorite } from './favorites'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('favoritos (toggle puro)', () => {
    it('liga, desliga e não vaza entre tipos', () => {
        let favs = emptyFavorites()
        favs = toggleFavorite(favs, 'live', '7')
        expect(isFavorite(favs, 'live', '7')).toBe(true)
        expect(isFavorite(favs, 'movie', '7')).toBe(false)

        favs = toggleFavorite(favs, 'movie', '7')
        favs = toggleFavorite(favs, 'live', '7') // desliga o canal
        expect(isFavorite(favs, 'live', '7')).toBe(false)
        expect(isFavorite(favs, 'movie', '7')).toBe(true)
    })

    it('é imutável (não mexe no objeto original)', () => {
        const original = emptyFavorites()
        const next = toggleFavorite(original, 'series', 's1')
        expect(original.series).toEqual([])
        expect(next.series).toEqual(['s1'])
    })
})

describe('moveFavorite (ordem personalizada)', () => {
    it('sobe/desce e ignora movimentos impossíveis', () => {
        let favs = emptyFavorites()
        favs = toggleFavorite(favs, 'live', 'a')
        favs = toggleFavorite(favs, 'live', 'b')
        favs = toggleFavorite(favs, 'live', 'c')
        expect(moveFavorite(favs, 'live', 'c', -1).live).toEqual(['a', 'c', 'b'])
        expect(moveFavorite(favs, 'live', 'a', -1)).toBe(favs) // topo não sobe
        expect(moveFavorite(favs, 'live', 'c', 1)).toBe(favs) // fundo não desce
        expect(moveFavorite(favs, 'live', 'x', 1)).toBe(favs) // id desconhecido
    })

    it('não muta o original', () => {
        let favs = emptyFavorites()
        favs = toggleFavorite(favs, 'live', 'a')
        favs = toggleFavorite(favs, 'live', 'b')
        const next = moveFavorite(favs, 'live', 'b', -1)
        expect(favs.live).toEqual(['a', 'b'])
        expect(next.live).toEqual(['b', 'a'])
    })
})
