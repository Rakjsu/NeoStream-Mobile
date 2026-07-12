import { describe, it, expect, beforeEach, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { disableAppLock, enableAppLock, loadAppLock, needsUnlock, resetAppLockCache, unlockApp } from './appLock'

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

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store

describe('appLock', () => {
    beforeEach(() => {
        store.clear()
        resetAppLockCache()
    })

    it('desligado por padrão: não pede desbloqueio', async () => {
        expect(await needsUnlock()).toBe(false)
        expect((await loadAppLock()).enabled).toBe(false)
    })

    it('ativar exige PIN de 4 dígitos e já libera a sessão de quem ativou', async () => {
        expect(await enableAppLock('12')).toBe(false)
        expect(await enableAppLock('abcd')).toBe(false)
        expect(await enableAppLock('1234')).toBe(true)
        // Quem ativou não é trancado na hora.
        expect(await needsUnlock()).toBe(false)
        // Mas uma sessão nova (cache zerado, storage mantido) é.
        resetAppLockCache()
        expect(await needsUnlock()).toBe(true)
    })

    it('desbloquear com PIN certo libera; errado não', async () => {
        await enableAppLock('1234')
        resetAppLockCache()
        expect(await unlockApp('0000')).toBe(false)
        expect(await needsUnlock()).toBe(true)
        expect(await unlockApp('1234')).toBe(true)
        expect(await needsUnlock()).toBe(false)
    })

    it('desativar exige o PIN correto e persiste', async () => {
        await enableAppLock('1234')
        expect(await disableAppLock('9999')).toBe(false)
        expect(await disableAppLock('1234')).toBe(true)
        resetAppLockCache()
        expect(await needsUnlock()).toBe(false)
    })

    it('storage corrompido cai no estado desligado', async () => {
        store.set('neostream_applock', '{{{nao é json')
        expect((await loadAppLock()).enabled).toBe(false)
    })
})
