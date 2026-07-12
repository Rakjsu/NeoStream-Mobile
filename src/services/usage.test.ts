import { describe, it, expect } from 'vitest'
import { addMinutes, dayKey, formatMinutes, summarize, type UsageMap } from './usage'

describe('dayKey', () => {
    it('formata YYYY-MM-DD', () => {
        expect(dayKey(new Date(2026, 6, 12, 23, 30).getTime())).toBe('2026-07-12')
        expect(dayKey(new Date(2026, 0, 5, 0, 1).getTime())).toBe('2026-01-05')
    })
})

describe('addMinutes', () => {
    it('acumula por dia/tipo sem mutar o original', () => {
        const original: UsageMap = {}
        const once = addMinutes(original, '2026-07-12', 'live', 1)
        const twice = addMinutes(once, '2026-07-12', 'live', 1)
        expect(twice['2026-07-12'].live).toBe(2)
        expect(original).toEqual({})
    })

    it('poda os dias além do horizonte', () => {
        let map: UsageMap = {}
        for (let day = 1; day <= 5; day++) map = addMinutes(map, `2026-07-0${day}`, 'movie', 10, 3)
        expect(Object.keys(map).sort()).toEqual(['2026-07-03', '2026-07-04', '2026-07-05'])
    })
})

describe('summarize', () => {
    const map: UsageMap = {
        '2026-07-12': { live: 30, episode: 60 },
        '2026-07-10': { movie: 90 },
        '2026-07-01': { live: 999 }, // fora da janela de 7 dias
    }

    it('soma só a janela e devolve totais por tipo', () => {
        const summary = summarize(map, '2026-07-12', 7)
        expect(summary.totals).toEqual({ live: 30, movie: 90, episode: 60 })
        expect(summary.totalMinutes).toBe(180)
    })
})

describe('formatMinutes', () => {
    it('horas quando passa de 60', () => {
        expect(formatMinutes(205)).toBe('3h 25min')
        expect(formatMinutes(45)).toBe('45min')
        expect(formatMinutes(0)).toBe('0min')
    })
})
