import { beforeEach, describe, expect, it, vi } from 'vitest'
import { intersectAllowed, isKidsMode, resetKidsCache, setKidsMode, whitelistCategoryIds } from './kids'
// Hoisted pelo vitest.
import AsyncStorage from '@react-native-async-storage/async-storage'

vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
        },
    }
})

describe('modo infantil', () => {
    beforeEach(() => {
        resetKidsCache()
        vi.clearAllMocks()
    })

    it('desligado por padrão', async () => {
        expect(await isKidsMode()).toBe(false)
    })

    it('liga, persiste e lê de volta (inclusive sem cache)', async () => {
        await setKidsMode(true)
        expect(await isKidsMode()).toBe(true)
        resetKidsCache()
        expect(await isKidsMode()).toBe(true)
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('neostream_kids_mode', '1')
    })

    it('desligar remove a chave', async () => {
        await setKidsMode(true)
        await setKidsMode(false)
        resetKidsCache()
        expect(await isKidsMode()).toBe(false)
        expect(AsyncStorage.removeItem).toHaveBeenCalledWith('neostream_kids_mode')
    })
})

describe('whitelist do modo infantil (puras)', () => {
    const cats = [
        { category_id: '1', category_name: 'Infantil' },
        { category_id: '2', category_name: 'Desenhos' },
        { category_id: '3', category_name: 'Filmes' },
    ]

    it('whitelist por nome, sem diferenciar caixa; vazia = null', () => {
        expect(whitelistCategoryIds(cats, ['infantil', 'DESENHOS'])).toEqual(new Set(['1', '2']))
        expect(whitelistCategoryIds(cats, [])).toBeNull()
    })

    it('interseção trata null como "sem restrição"', () => {
        expect(intersectAllowed(null, new Set(['1']))).toEqual(new Set(['1']))
        expect(intersectAllowed(new Set(['1', '2']), null)).toEqual(new Set(['1', '2']))
        expect(intersectAllowed(new Set(['1', '2']), new Set(['2', '3']))).toEqual(new Set(['2']))
    })
})
