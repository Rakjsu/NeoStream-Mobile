import { describe, expect, it, vi } from 'vitest'
import { addHabitMinute, hourBucketOf, topHabitKeys, type HabitMap } from './habit'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn() },
}))
vi.mock('./profiles', () => ({ profileKey: (base: string) => base }))

describe('hábitos por horário', () => {
    it('faixas de hora', () => {
        expect(hourBucketOf(8)).toBe('morning')
        expect(hourBucketOf(13)).toBe('afternoon')
        expect(hourBucketOf(20)).toBe('evening')
        expect(hourBucketOf(2)).toBe('night')
    })

    it('acumula por célula e ranqueia', () => {
        let map: HabitMap = {}
        map = addHabitMinute(map, 1, 'evening', 'live|Jornal')
        map = addHabitMinute(map, 1, 'evening', 'live|Jornal')
        map = addHabitMinute(map, 1, 'evening', 'episode|Série')
        map = addHabitMinute(map, 2, 'evening', 'live|Futebol')
        expect(topHabitKeys(map, 1, 'evening')).toEqual(['live|Jornal', 'episode|Série'])
        expect(topHabitKeys(map, 2, 'evening')).toEqual(['live|Futebol'])
        expect(topHabitKeys(map, 3, 'morning')).toEqual([])
    })

    it('célula lotada poda o título mais frio', () => {
        let map: HabitMap = {}
        for (let i = 0; i < 50; i++) {
            map = addHabitMinute(map, 0, 'night', `live|C${i}`)
            map = addHabitMinute(map, 0, 'night', `live|C${i}`)
        }
        map = addHabitMinute(map, 0, 'night', 'live|Novo')
        const keys = topHabitKeys(map, 0, 'night', 60)
        expect(keys).toHaveLength(50)
        expect(keys).toContain('live|Novo')
    })
})
