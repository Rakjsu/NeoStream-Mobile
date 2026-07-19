import { describe, expect, it } from 'vitest'
import { pickTmdbHitIds } from './trakt'
import { cleanTitle, episodeKey, traktWins, titleMatches } from './traktSync'
import type { ProgressEntry } from './progress'

function entry(partial: Partial<ProgressEntry>): ProgressEntry {
    return {
        id: 'movie:1',
        kind: 'movie',
        streamId: '1',
        container: 'mp4',
        title: 'Filme',
        cover: '',
        position: 0,
        duration: 0,
        updatedAt: 0,
        ...partial,
    }
}

describe('traktSync — maior progresso vence', () => {
    it('sem entrada local, o Trakt sempre entra', () => {
        expect(traktWins(undefined, 5)).toBe(true)
    })

    it('Trakt maior que o local em segundos → Trakt vence', () => {
        // local: 600s de 6000s = 10%
        expect(traktWins(entry({ position: 600, duration: 6000 }), 40)).toBe(true)
    })

    it('local maior que o Trakt → local fica', () => {
        // local: 4800s de 6000s = 80%
        expect(traktWins(entry({ position: 4800, duration: 6000 }), 40)).toBe(false)
    })

    it('empate não sobrescreve (evita loop de gravação)', () => {
        expect(traktWins(entry({ position: 3000, duration: 6000 }), 50)).toBe(false)
    })

    it('entrada local que já veio do Trakt compara % com %', () => {
        expect(traktWins(entry({ position: 30, duration: 100, fromTraktPct: true }), 45)).toBe(true)
        expect(traktWins(entry({ position: 60, duration: 100, fromTraktPct: true }), 45)).toBe(false)
    })
})

describe('traktSync — helpers de casamento', () => {
    it('cleanTitle tira ano e normaliza', () => {
        expect(cleanTitle('Avatar (2009)')).toBe('avatar')
        expect(cleanTitle('  DUNA ')).toBe('duna')
    })

    it('episodeKey é estável e case-insensitive no show', () => {
        expect(episodeKey('Breaking Bad', 2, 5)).toBe('breaking bad|2|5')
        expect(episodeKey('breaking BAD (2008)', 2, 5)).toBe('breaking bad|2|5')
    })
})

describe('titleMatches (fix: matching estrito, sem "Sex Drive" fantasma)', () => {
    it('igualdade normalizada casa (ano e caixa ignorados)', () => {
        expect(titleMatches('Drive (2011)', 'drive')).toBe(true)
    })

    it('título com subtítulo casa com o título base', () => {
        expect(titleMatches('Sex Drive: Rumo ao Sexo', 'Sex Drive')).toBe(true)
        expect(titleMatches('Mad Max - Estrada da Fúria', 'Mad Max')).toBe(true)
    })

    it('substring solta NÃO casa — "Drive" não vira "Sex Drive"', () => {
        expect(titleMatches('Sex Drive: Rumo ao Sexo', 'Drive')).toBe(false)
        expect(titleMatches('Driven', 'Drive')).toBe(false)
    })
})

describe('pickTmdbHitIds (resolução exata pelo TMDB id)', () => {
    it('extrai os ids do tipo pedido', () => {
        expect(pickTmdbHitIds([{ type: 'movie', movie: { ids: { trakt: 1, tmdb: 550 } } }], 'movie'))
            .toEqual({ trakt: 1, tmdb: 550 })
    })

    it('ignora hits de outro tipo e lixo', () => {
        expect(pickTmdbHitIds([{ type: 'show', show: { ids: { trakt: 9 } } }], 'movie')).toBeNull()
        expect(pickTmdbHitIds(null, 'movie')).toBeNull()
    })
})
