import { describe, it, expect, beforeEach } from 'vitest'
import { channelNumber, clearZapContext, hasZapContext, setZapContext, wrapIndex, zapBy, zapToNumber, rankChannels } from './zap'

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

describe('zap por número', () => {
    it('pula pra posição 1-based e informa o número do canal', () => {
        setZapContext([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 'a')
        expect(zapToNumber(2)?.id).toBe('b')
        expect(zapBy(1)?.id).toBe('c') // o índice andou junto
        expect(channelNumber('c')).toBe(3)
        expect(channelNumber('x')).toBe(0)
    })

    it('rejeita números fora do alcance', () => {
        setZapContext([{ id: 'a', name: 'A' }], 'a')
        expect(zapToNumber(0)).toBeNull()
        expect(zapToNumber(2)).toBeNull()
        expect(zapToNumber(1.5)).toBeNull()
        clearZapContext()
    })
})

describe('números reais de canal (campo num do provedor)', () => {
    it('zapToNumber prioriza o num real e cai na posição sem match', () => {
        setZapContext([
            { id: 'a', name: 'A', num: 10 },
            { id: 'b', name: 'B', num: 22 },
            { id: 'c', name: 'C' },
        ], 'a')
        expect(zapToNumber(22)?.id).toBe('b')
        expect(zapToNumber(3)?.id).toBe('c') // posição 3 (nenhum canal com num=3)
        expect(zapToNumber(99)).toBeNull()
        clearZapContext()
    })

    it('channelNumber devolve o num real quando existe', () => {
        setZapContext([{ id: 'a', name: 'A', num: '15' }, { id: 'b', name: 'B' }], 'a')
        expect(channelNumber('a')).toBe(15)
        expect(channelNumber('b')).toBe(2)
        clearZapContext()
    })
})
