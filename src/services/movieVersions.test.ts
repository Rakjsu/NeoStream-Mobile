import { describe, expect, it } from 'vitest'
import { findMovieVersions, isSameMovie, movieBaseName, versionLabel } from './movieVersions'

describe('versões do mesmo filme', () => {
    it('rótulo por marcadores 4K/[L]/LEG', () => {
        expect(versionLabel('Avatar 4K [L]')).toBe('4K Legendado')
        expect(versionLabel('Avatar LEG')).toBe('FHD Legendado')
        expect(versionLabel('Avatar (2009)')).toBe('FHD Dublado')
    })

    it('base name ignora marcadores, ano e pontuação', () => {
        expect(movieBaseName('Avatar 4K [L] (2009)')).toBe('avatar')
        expect(movieBaseName('Velozes & Furiosos 9 FHD')).toBe('velozes furiosos 9')
    })

    it('sequências não se misturam; nomes curtos exigem match exato', () => {
        expect(isSameMovie('Velozes e Furiosos 9 [4K]', 'Velozes e Furiosos 9 LEG')).toBe(true)
        expect(isSameMovie('Velozes e Furiosos 9', 'Velozes e Furiosos 8')).toBe(false)
        expect(isSameMovie('Matrix II', 'Matrix III')).toBe(false)
        expect(isSameMovie('Urano', 'Urano e o Mar')).toBe(false)
    })

    it('agrupa, ordena e dedup por rótulo', () => {
        const movies = [
            { stream_id: 1, name: 'Avatar (2009)' },
            { stream_id: 2, name: 'Avatar 4K' },
            { stream_id: 3, name: 'Avatar [L]' },
            { stream_id: 4, name: 'Avatar LEG' },
            { stream_id: 5, name: 'Outro Filme Qualquer' },
        ]
        const versions = findMovieVersions(movies[0], movies)
        expect(versions.map(version => version.label)).toEqual(['FHD Dublado', 'FHD Legendado', '4K Dublado'])
        expect(versions.some(version => version.movie.stream_id === 5)).toBe(false)
    })
})
