import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCollection, isInCollection, listCollections, removeCollection, resetCollectionsCache, toggleInCollection } from './collections'

vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
            multiRemove: vi.fn(async (keys: string[]) => { for (const key of keys) store.delete(key) }),
        },
    }
})

const movie = { kind: 'movie' as const, id: '10', name: 'Filme X', cover: '' }

describe('collections (pastas de favoritos)', () => {
    beforeEach(() => { resetCollectionsCache() })

    it('cria, adiciona/remove item e apaga a pasta', async () => {
        const created = await createCollection('  Sessão pipoca  ')
        expect(created?.name).toBe('Sessão pipoca')

        expect(await toggleInCollection(created!.id, movie)).toBe(true)
        let list = await listCollections()
        expect(isInCollection(list, created!.id, 'movie', '10')).toBe(true)

        expect(await toggleInCollection(created!.id, movie)).toBe(false)
        list = await listCollections()
        expect(isInCollection(list, created!.id, 'movie', '10')).toBe(false)

        await removeCollection(created!.id)
        expect(await listCollections()).toEqual([])
    })

    it('nome vazio não cria pasta', async () => {
        expect(await createCollection('   ')).toBeNull()
    })
})
