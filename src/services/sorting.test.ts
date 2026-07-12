import { describe, it, expect } from 'vitest'
import { nextSortMode, sortCatalog, type SortMode } from './sorting'

describe('nextSortMode (ciclo do botão)', () => {
    it('padrão → recentes → a–z → nota → padrão', () => {
        const seen: SortMode[] = ['default']
        for (let i = 0; i < 4; i++) seen.push(nextSortMode(seen[seen.length - 1]))
        expect(seen).toEqual(['default', 'recent', 'az', 'rating', 'default'])
    })
})

describe('sortCatalog', () => {
    const items = [
        { name: 'Zebra', rating: '6', added: '100' },
        { name: 'Água', rating: 9.1, added: '300' },
        { name: 'Casa', rating: undefined, added: 'lixo' },
    ]
    const addedOf = (item: typeof items[number]) => item.added

    it('default preserva a ordem (e a referência) do provedor', () => {
        expect(sortCatalog(items, 'default', addedOf)).toBe(items)
    })

    it('recent por epoch desc, az com locale pt, rating desc (lixo vira 0)', () => {
        expect(sortCatalog(items, 'recent', addedOf).map(i => i.name)).toEqual(['Água', 'Zebra', 'Casa'])
        expect(sortCatalog(items, 'az', addedOf).map(i => i.name)).toEqual(['Água', 'Casa', 'Zebra'])
        expect(sortCatalog(items, 'rating', addedOf).map(i => i.name)).toEqual(['Água', 'Zebra', 'Casa'])
        // Não muta o original.
        expect(items[0].name).toBe('Zebra')
    })
})
