import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecMaxAgeDays, setRecMaxAgeDays } from './downloads'

// Storage funcional em memória — a idade máxima é lida/gravada de verdade.
const store = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value) },
        removeItem: async (key: string) => { store.delete(key) },
    },
}))
// downloads.ts puxa módulos nativos — mocka o que não interessa aqui.
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/' }))
vi.mock('./notify', () => ({ notifyDownloadDone: vi.fn() }))
vi.mock('./progress', () => ({ loadWatched: vi.fn(async () => new Set()) }))
vi.mock('./session', () => ({ resolvePlayableUrl: vi.fn(async (url: string) => url) }))

beforeEach(() => store.clear())

describe('idade máxima das gravações (auto-faxina)', () => {
    it('liga, troca e desliga persistindo no storage', async () => {
        expect(await getRecMaxAgeDays()).toBe(0)
        await setRecMaxAgeDays(7)
        expect(await getRecMaxAgeDays()).toBe(7)
        await setRecMaxAgeDays(30)
        expect(await getRecMaxAgeDays()).toBe(30)
        await setRecMaxAgeDays(0)
        expect(await getRecMaxAgeDays()).toBe(0)
    })

    it('valor podre no storage vira desligado', async () => {
        store.set('neostream_rec_maxage_days', 'lixo')
        expect(await getRecMaxAgeDays()).toBe(0)
    })
})
