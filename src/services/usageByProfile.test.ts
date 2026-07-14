import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dayKey, recordWatchMinute, usageByProfile } from './usage'
import { resetProfilesCache } from './profiles'

// Storage funcional em memória — perfis e chaves de uso lidas de verdade.
const store = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value) },
        removeItem: async (key: string) => { store.delete(key) },
        multiRemove: async (keys: string[]) => { keys.forEach(key => store.delete(key)) },
    },
}))

beforeEach(() => {
    store.clear()
    resetProfilesCache()
})

describe('usageByProfile (últimos 7 dias por perfil)', () => {
    it('soma cada perfil, ordena do maior pro menor e pula quem não assistiu', async () => {
        const now = 1_800_000_000_000
        store.set('neostream_profiles', JSON.stringify([{ id: 'p1', name: 'Sala', color: '#123' }]))
        await recordWatchMinute('live', now, 'Globo') // perfil padrão (ativo)
        store.set('neostream_usage_p_p1', JSON.stringify({ [dayKey(now)]: { movie: 5 } }))

        const list = await usageByProfile(now)
        expect(list.map(profile => `${profile.id}:${profile.minutes}`)).toEqual(['p1:5', 'default:1'])
        // Convidado sem minutos não aparece.
        expect(list.some(profile => profile.id === 'guest')).toBe(false)
    })

    it('sem uso nenhum devolve lista vazia', async () => {
        expect(await usageByProfile(1_800_000_000_000)).toEqual([])
    })
})
