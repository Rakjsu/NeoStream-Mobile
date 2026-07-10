import { describe, it, expect, beforeEach } from 'vitest'
import { clearZapContext, hasZapContext, setZapContext, wrapIndex, zapBy } from './zap'

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
