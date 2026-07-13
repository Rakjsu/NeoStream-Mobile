import { describe, it, expect } from 'vitest'
import { becauseYouWatched, normalizeTitle, type RecCandidate } from './recommend'
import type { TopTitle } from './usage'

const top = (title: string): TopTitle => ({ title, kind: 'episode', minutes: 60 })
const show = (id: string, name: string, category: string): RecCandidate =>
    ({ id, name, kind: 'series', category, cover: '' })

const CATALOG: RecCandidate[] = [
    show('1', 'Breaking Bad', 'drama'),
    show('2', 'Better Call Saul', 'drama'),
    show('3', 'Ozark', 'drama'),
    show('4', 'The Wire', 'drama'),
    show('5', 'Friends', 'comedia'),
    { id: '9', name: 'Breaking Bad — O Filme', kind: 'movie', category: 'drama', cover: '' },
]

describe('becauseYouWatched', () => {
    it('acha a âncora sem diferenciar caixa/espaços e recomenda a mesma categoria', () => {
        const rec = becauseYouWatched([top('  breaking   BAD ')], CATALOG)
        expect(rec?.anchor).toBe('Breaking Bad')
        expect(rec?.items.map(item => item.id)).toEqual(['2', '3', '4'])
    })

    it('pula tops sem correspondência e exige o mínimo de vizinhos', () => {
        const rec = becauseYouWatched([top('Série Fantasma'), top('Friends'), top('Breaking Bad')], CATALOG)
        // Friends só tem 0 vizinhos de comédia → cai pro próximo top.
        expect(rec?.anchor).toBe('Breaking Bad')
    })

    it('não mistura tipos nem devolve a própria âncora', () => {
        const rec = becauseYouWatched([top('Breaking Bad')], CATALOG)!
        expect(rec.items.every(item => item.kind === 'series')).toBe(true)
        expect(rec.items.some(item => item.id === '1')).toBe(false)
    })

    it('null quando nada rende recomendação', () => {
        expect(becauseYouWatched([top('Friends')], CATALOG)).toBeNull()
        expect(becauseYouWatched([], CATALOG)).toBeNull()
    })

    it('normalizeTitle colapsa espaços e caixa', () => {
        expect(normalizeTitle('  The   WIRE ')).toBe('the wire')
    })
})
