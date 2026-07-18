import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addBookmark, fmtBookmark, listBookmarks, removeBookmark } from './bookmarks'

// AsyncStorage em memória — cada teste começa limpo.
const memory = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
        setItem: vi.fn(async (key: string, value: string) => { memory.set(key, value) }),
        removeItem: vi.fn(async (key: string) => { memory.delete(key) }),
    },
}))

describe('bookmarks (marcadores de cena em VOD)', () => {
    beforeEach(() => memory.clear())

    it('adiciona ordenado, deduplica ±5s e remove', async () => {
        await addBookmark('filme1', 120, 1)
        await addBookmark('filme1', 30, 2)
        await addBookmark('filme1', 122, 3) // a 2s da de 120 → substitui
        expect((await listBookmarks('filme1')).map(m => m.t)).toEqual([30, 122])

        await removeBookmark('filme1', 30)
        expect((await listBookmarks('filme1')).map(m => m.t)).toEqual([122])
    })

    it('conteúdos são independentes e o teto por conteúdo vale', async () => {
        for (let i = 0; i < 25; i++) await addBookmark('serie1', i * 10, i)
        await addBookmark('filme2', 7, 99)
        expect((await listBookmarks('serie1')).length).toBe(20)
        expect((await listBookmarks('filme2')).map(m => m.t)).toEqual([7])
    })

    it('fmtBookmark formata MM:SS e H:MM:SS', () => {
        expect(fmtBookmark(65)).toBe('01:05')
        expect(fmtBookmark(3723)).toBe('1:02:03')
        expect(fmtBookmark(-5)).toBe('00:00')
    })
})
