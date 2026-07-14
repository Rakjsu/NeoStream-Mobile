import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUsageGoal, recordWatchMinute, setUsageGoal, usageGoalJustHit } from './usage'

// Storage funcional em memória — a meta e a flag do dia são lidas de verdade.
const store = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value) },
        removeItem: async (key: string) => { store.delete(key) },
    },
}))

beforeEach(() => store.clear())

describe('meta de tempo pra adultos', () => {
    it('liga/desliga e persiste', async () => {
        expect(await getUsageGoal()).toBe(0)
        await setUsageGoal(120)
        expect(await getUsageGoal()).toBe(120)
        await setUsageGoal(0)
        expect(await getUsageGoal()).toBe(0)
    })

    it('avisa UMA vez ao atingir a meta e a flag do dia segura o resto', async () => {
        const now = 1_800_000_000_000
        await setUsageGoal(2)
        expect(await usageGoalJustHit(now)).toBe(0) // 0 min assistidos
        await recordWatchMinute('movie', now, 'Duna')
        await recordWatchMinute('movie', now, 'Duna')
        expect(await usageGoalJustHit(now)).toBe(2) // atingiu → avisa a meta
        expect(await usageGoalJustHit(now)).toBe(0) // flag do dia segura
    })
})
