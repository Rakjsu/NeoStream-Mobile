import { describe, it, expect, vi } from 'vitest'
import { allowedCategoryIds, isAdultCategory, isValidPin } from './parental'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('isAdultCategory (classificação conservadora)', () => {
    it('pega os nomes típicos de categoria adulta', () => {
        for (const name of ['ADULTOS', 'Adult Movies', 'XXX', 'Conteúdo Erótico', 'FILMES +18', '18+ VIP', 'Sexo & Cia', 'Sexy Hot', 'OnlyFans', 'PLAYBOY TV']) {
            expect(isAdultCategory(name), name).toBe(true)
        }
    })

    it('não pega falsos positivos comuns em pt-BR', () => {
        for (const name of ['FILMES 2018', 'Sexta no Cinema', 'Séries Legendadas', 'Esportes', 'Sessão da Tarde', 'Kids 10-18h']) {
            expect(isAdultCategory(name), name).toBe(false)
        }
    })
})

describe('allowedCategoryIds', () => {
    const cats = [
        { category_id: '1', category_name: 'Filmes' },
        { category_id: '2', category_name: 'ADULTOS +18' },
        { category_id: '3', category_name: 'Séries' },
    ]

    it('desligado → null (sem filtro); ligado → só as não-adultas', () => {
        expect(allowedCategoryIds(cats, false)).toBeNull()
        const allowed = allowedCategoryIds(cats, true)
        expect(allowed).toEqual(new Set(['1', '3']))
    })
})

describe('isValidPin', () => {
    it('exige exatamente 4 dígitos', () => {
        expect(isValidPin('1234')).toBe(true)
        expect(isValidPin('0000')).toBe(true)
        expect(isValidPin('123')).toBe(false)
        expect(isValidPin('12345')).toBe(false)
        expect(isValidPin('12a4')).toBe(false)
        expect(isValidPin('')).toBe(false)
    })
})
