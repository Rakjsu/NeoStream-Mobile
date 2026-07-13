import { describe, expect, it, vi } from 'vitest'
import { nextSundayEvening } from './weekly'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn() },
}))
vi.mock('./notify', () => ({ notifyAt: vi.fn(async () => true) }))
vi.mock('./usage', () => ({
    dayKey: () => '2026-07-13', formatMinutes: (m: number) => `${m}min`,
    loadTitleUsage: vi.fn(), loadUsage: vi.fn(), summarize: vi.fn(), topTitles: vi.fn(),
}))
vi.mock('../i18n/strings', () => ({ t: (k: string) => k, tf: (k: string) => k }))

describe('nextSundayEvening', () => {
    it('semana no meio → próximo domingo 20h; domingo 21h → domingo seguinte', () => {
        const monday = new Date(2026, 6, 13, 10, 0).getTime() // seg 2026-07-13
        const next = new Date(nextSundayEvening(monday))
        expect(next.getDay()).toBe(0)
        expect(next.getHours()).toBe(20)
        expect(next.getDate()).toBe(19)
        const sundayLate = new Date(2026, 6, 19, 21, 0).getTime()
        expect(new Date(nextSundayEvening(sundayLate)).getDate()).toBe(26)
    })
})
