import { describe, it, expect, vi } from 'vitest'
import { diffNewEpisodes } from './newEpisodes'
import type { SeriesItem } from './xtream'

// Hoisted pelo vitest — roda antes dos imports acima.
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), multiRemove: vi.fn() },
}))

const show = (id: string, lm: string): SeriesItem => ({ series_id: id, name: `Série ${id}`, last_modified: lm })

describe('diffNewEpisodes', () => {
    it('primeira passada só semeia (nada é novo)', () => {
        const diff = diffNewEpisodes(['1'], [show('1', '100')], {})
        expect(diff.updated).toEqual([])
        expect(diff.nextSnapshot).toEqual({ '1': '100' })
    })

    it('carimbo mudou numa favorita → novidade; não-favorita é ignorada', () => {
        const diff = diffNewEpisodes(['1'], [show('1', '200'), show('2', '999')], { '1': '100', '2': '1' })
        expect(diff.updated.map(s => s.series_id)).toEqual(['1'])
        expect(diff.nextSnapshot).toEqual({ '1': '200' })
    })

    it('favorita recém-adicionada entra no snapshot sem alarde', () => {
        const diff = diffNewEpisodes(['1', '3'], [show('1', '100'), show('3', '50')], { '1': '100' })
        expect(diff.updated).toEqual([])
        expect(diff.nextSnapshot).toEqual({ '1': '100', '3': '50' })
    })

    it('carimbo igual ou vazio não dispara', () => {
        const diff = diffNewEpisodes(['1', '2'], [show('1', '100'), show('2', '')], { '1': '100', '2': '' })
        expect(diff.updated).toEqual([])
    })
})
