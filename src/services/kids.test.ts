import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isKidsMode, resetKidsCache, setKidsMode } from './kids'
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
