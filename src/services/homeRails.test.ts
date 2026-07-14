import { describe, it, expect, vi } from 'vitest'
import { RAIL_KEYS, defaultRailPrefs, moveRail, orderedRails, railOrderAll, toggleRail } from './homeRails'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('rails da Home (helpers puros)', () => {
    it('ordem padrão é a lista completa e nada escondido', () => {
        const prefs = defaultRailPrefs()
        expect(orderedRails(prefs)).toEqual([...RAIL_KEYS])
    })

    it('toggleRail esconde e mostra de novo', () => {
        let prefs = defaultRailPrefs()
        prefs = toggleRail(prefs, 'newMovies')
        expect(orderedRails(prefs)).not.toContain('newMovies')
        prefs = toggleRail(prefs, 'newMovies')
        expect(orderedRails(prefs)).toContain('newMovies')
    })

    it('moveRail troca vizinhos e ignora movimentos impossíveis', () => {
        let prefs = defaultRailPrefs()
        prefs = moveRail(prefs, RAIL_KEYS[1], -1)
        expect(prefs.order[0]).toBe(RAIL_KEYS[1])
        expect(prefs.order[1]).toBe(RAIL_KEYS[0])
        expect(moveRail(prefs, prefs.order[0], -1)).toBe(prefs) // topo não sobe
    })

    it('ordem salva parcial ganha as chaves novas no fim (updates do app)', () => {
        const partial = { order: ['newSeries'] as never, hidden: [] }
        const all = railOrderAll(partial)
        expect(all[0]).toBe('newSeries')
        expect(all).toHaveLength(RAIL_KEYS.length)
    })
})
