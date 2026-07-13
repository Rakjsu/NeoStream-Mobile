import { describe, expect, it, vi } from 'vitest'
import { cleanTitle, detailsUrl, emptyVodDetails, mergeDetails, parseSearchId, parseTmdbDetails, searchUrl } from './tmdb'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('cleanTitle', () => {
    it('remove tags, qualidade e marcações de idioma', () => {
        expect(cleanTitle('Matrix [4K] (1999) DUBLADO')).toBe('Matrix')
        expect(cleanTitle('Breaking Bad FHD H265')).toBe('Breaking Bad')
        expect(cleanTitle('  Duna  ')).toBe('Duna')
    })
})

describe('URLs', () => {
    it('searchUrl escapa a query e leva idioma', () => {
        const url = searchUrl('movie', 'O Poderoso Chefão', 'k1', 'pt-BR')
        expect(url).toContain('search/movie')
        expect(url).toContain('query=O+Poderoso+Chef')
        expect(url).toContain('language=pt-BR')
    })

    it('detailsUrl pede videos e credits juntos', () => {
        expect(detailsUrl('tv', 42, 'k1', 'en-US')).toContain('/tv/42')
        expect(detailsUrl('tv', 42, 'k1', 'en-US')).toContain('append_to_response=videos%2Ccredits')
    })
})

describe('parsers', () => {
    it('parseSearchId pega o primeiro resultado (null quando vazio/lixo)', () => {
        expect(parseSearchId({ results: [{ id: 7 }, { id: 8 }] })).toBe(7)
        expect(parseSearchId({ results: [] })).toBeNull()
        expect(parseSearchId(null)).toBeNull()
    })

    it('parseTmdbDetails achata ficha, trailer do YouTube e elenco top-5', () => {
        const details = parseTmdbDetails({
            overview: 'Sinopse.',
            vote_average: 8.412,
            runtime: 136,
            poster_path: '/abc.jpg',
            release_date: '1999-03-31',
            genres: [{ name: 'Ação' }, { name: 'Ficção' }],
            videos: { results: [{ site: 'Vimeo', key: 'x' }, { site: 'YouTube', type: 'Trailer', key: 'yt1' }] },
            credits: { cast: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }] },
        })
        expect(details.plot).toBe('Sinopse.')
        expect(details.rating).toBe('8.4')
        expect(details.duration).toBe('136 min')
        expect(details.cover).toBe('https://image.tmdb.org/t/p/w500/abc.jpg')
        expect(details.trailer).toBe('https://www.youtube.com/watch?v=yt1')
        expect(details.genre).toBe('Ação, Ficção')
        expect(details.cast).toBe('A, B, C, D, E')
    })

    it('parseTmdbDetails tolera lixo', () => {
        expect(parseTmdbDetails(null).plot).toBe('')
    })
})

describe('mergeDetails', () => {
    it('provedor vence; TMDB só preenche buraco', () => {
        const provider = { ...emptyVodDetails(), plot: 'Do provedor', rating: '' }
        const tmdb = { ...emptyVodDetails(), plot: 'Do TMDB', rating: '8.4' }
        const merged = mergeDetails(provider, tmdb)
        expect(merged.plot).toBe('Do provedor')
        expect(merged.rating).toBe('8.4')
    })
})
