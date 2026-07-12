import { describe, it, expect, beforeEach } from 'vitest'
import { clearZapContext, hasZapContext, setZapContext, wrapIndex, zapBy, rankChannels } from './zap'

describe('wrapIndex (vizinho com volta)', () => {
    it('anda pra frente e pra trás com wrap', () => {
        expect(wrapIndex(3, 0, 1)).toBe(1)
        expect(wrapIndex(3, 2, 1)).toBe(0)  // último → primeiro
        expect(wrapIndex(3, 0, -1)).toBe(2) // primeiro → último
        expect(wrapIndex(0, 0, 1)).toBe(-1) // lista vazia
    })
})

describe('contexto de zapping', () => {
    const canais = [
        { id: '1', name: 'Globo' },
        { id: '2', name: 'SBT' },
        { id: '3', name: 'Record' },
    ]

    beforeEach(() => clearZapContext())

    it('anda a partir do canal aberto, com volta', () => {
        setZapContext(canais, '2')
        expect(hasZapContext()).toBe(true)
        expect(zapBy(1)?.name).toBe('Record')
        expect(zapBy(1)?.name).toBe('Globo') // wrap
        expect(zapBy(-1)?.name).toBe('Record')
    })

    it('sem contexto (id desconhecido, lista de 1, ou limpo) → null', () => {
        setZapContext(canais, 'nao-existe')
        expect(hasZapContext()).toBe(false)
        expect(zapBy(1)).toBeNull()

        setZapContext([canais[0]], '1') // canal único: zapear não faz sentido
        expect(hasZapContext()).toBe(false)

        setZapContext(canais, '1')
        clearZapContext()
        expect(zapBy(1)).toBeNull()
    })
})

describe('rankChannels (gaveta esperta)', () => {
    const ch = (id: string) => ({ id, name: `Canal ${id}` })

    it('favoritos primeiro, recentes em ordem de uso, resto na ordem original', () => {
        const list = [ch('1'), ch('2'), ch('3'), ch('4'), ch('5')]
        const ranked = rankChannels(list, new Set(['4']), ['3', '5'])
        expect(ranked.map(c => c.id)).toEqual(['4', '3', '5', '1', '2'])
    })

    it('sem favoritos nem recentes, mantém a ordem', () => {
        const list = [ch('a'), ch('b')]
        expect(rankChannels(list, new Set(), []).map(c => c.id)).toEqual(['a', 'b'])
    })
})
