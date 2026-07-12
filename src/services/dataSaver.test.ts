import { describe, it, expect, vi, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isDataSaverEnabled, refreshDataSaver, setDataSaver, skipImages } from './dataSaver'

// Hoisted pelo vitest — roda antes dos imports acima.
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
            __store: store,
        },
    }
})

const network = { type: 'WIFI' }
vi.mock('expo-network', () => ({
    NetworkStateType: { CELLULAR: 'CELLULAR', WIFI: 'WIFI' },
    getNetworkStateAsync: vi.fn(async () => ({ type: network.type })),
}))

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store

describe('dataSaver', () => {
    beforeEach(async () => {
        store.clear()
        network.type = 'WIFI'
        await refreshDataSaver()
    })

    it('desligado por padrão; nunca pula imagem no Wi-Fi', async () => {
        expect(await isDataSaverEnabled()).toBe(false)
        expect(skipImages()).toBe(false)
        await setDataSaver(true)
        expect(skipImages()).toBe(false) // Wi-Fi: carrega mesmo com a opção ligada
    })

    it('opção ligada + rede móvel → pula imagens', async () => {
        network.type = 'CELLULAR'
        await setDataSaver(true)
        expect(skipImages()).toBe(true)
        await setDataSaver(false)
        expect(skipImages()).toBe(false)
    })
})
