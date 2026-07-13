import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    activeProfileId, addProfile, initProfiles, listProfiles, onProfileSwitch,
    profileKey, removeProfile, resetProfilesCache, shouldPickProfile, switchProfile,
} from './profiles'

vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
            multiRemove: vi.fn(async (keys: string[]) => { keys.forEach(key => store.delete(key)) }),
            /** Só do teste: zera o "disco" entre os casos. */
            __clear: () => store.clear(),
        },
    }
})

// Hoisted pelo vitest.
import AsyncStorage from '@react-native-async-storage/async-storage'

describe('perfis', () => {
    beforeEach(() => {
        resetProfilesCache()
        ;(AsyncStorage as unknown as { __clear: () => void }).__clear()
    })

    it('padrão usa a chave crua; perfil extra ganha sufixo', async () => {
        await initProfiles()
        expect(profileKey('neostream_favorites')).toBe('neostream_favorites')
        const kid = await addProfile('Criança')
        await switchProfile(kid!.id)
        expect(profileKey('neostream_favorites')).toBe(`neostream_favorites_p_${kid!.id}`)
    })

    it('troca de perfil dispara os resetters e persiste o ativo', async () => {
        await initProfiles()
        const reset = vi.fn()
        onProfileSwitch(reset)
        const extra = await addProfile('Sala')
        await switchProfile(extra!.id)
        expect(reset).toHaveBeenCalled()
        // Novo boot relê o perfil ativo persistido.
        resetProfilesCache()
        await initProfiles()
        expect(activeProfileId()).toBe(extra!.id)
    })

    it('boot com 2+ perfis pede escolha uma vez; remover volta pro padrão', async () => {
        await initProfiles()
        expect(shouldPickProfile()).toBe(false)
        const extra = await addProfile('Visitas')
        expect(shouldPickProfile()).toBe(true)
        await switchProfile(extra!.id)
        expect(shouldPickProfile()).toBe(false)
        await removeProfile(extra!.id)
        expect(activeProfileId()).toBe('default')
        expect((await listProfiles()).map(profile => profile.id)).toEqual(['default'])
    })

    it('nome vazio não cria perfil; padrão não remove', async () => {
        await initProfiles()
        expect(await addProfile('   ')).toBeNull()
        await removeProfile('default')
        expect((await listProfiles())).toHaveLength(1)
    })
})
