import { describe, it, expect, vi } from 'vitest'
import { addMinutes, addMonthMinute, addTitleMinute, currentStreak, dayKey, formatMinutes, lastDays, lastMonths, monthKey, summarize, topTitles, usageCsv, yearSummary, type MonthUsageMap, type TitleUsageMap, type UsageMap } from './usage'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

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

describe('lastDays', () => {
    it('devolve a janela completa (zeros incluídos), do mais antigo pra hoje', () => {
        const map: UsageMap = { '2026-07-12': { live: 30 }, '2026-07-10': { movie: 60 } }
        const days = lastDays(map, '2026-07-12', 3)
        expect(days).toEqual([
            { day: '2026-07-10', minutes: 60 },
            { day: '2026-07-11', minutes: 0 },
            { day: '2026-07-12', minutes: 30 },
        ])
    })

    it('atravessa viradas de mês', () => {
        const days = lastDays({}, '2026-08-01', 2)
        expect(days.map(d => d.day)).toEqual(['2026-07-31', '2026-08-01'])
    })
})

describe('mais assistidos (títulos)', () => {
    it('acumula por título e poda dias velhos', () => {
        let map: TitleUsageMap = {}
        map = addTitleMinute(map, '2026-07-12', 'live', 'Globo')
        map = addTitleMinute(map, '2026-07-12', 'live', 'Globo')
        expect(map['2026-07-12']['live|Globo']).toBe(2)
        for (let day = 1; day <= 9; day++) map = addTitleMinute(map, `2026-07-0${day}`, 'movie', 'X', 3)
        expect(Object.keys(map).length).toBeLessThanOrEqual(3)
    })

    it('topTitles filtra por tipo e ordena por minutos na janela', () => {
        const map: TitleUsageMap = {
            '2026-07-12': { 'live|Globo': 30, 'live|SBT': 10, 'episode|Dark': 50 },
            '2026-07-11': { 'live|SBT': 40 },
            '2026-07-01': { 'live|Velho': 999 },
        }
        const channels = topTitles(map, '2026-07-12', ['live'], 2)
        expect(channels.map(c => c.title)).toEqual(['SBT', 'Globo'])
        const shows = topTitles(map, '2026-07-12', ['episode', 'movie'])
        expect(shows[0]).toMatchObject({ title: 'Dark', minutes: 50 })
    })
})

describe('wrapped anual (meses)', () => {
    it('acumula por mês e resume o ano com mês campeão', () => {
        let map: MonthUsageMap = {}
        for (let i = 0; i < 3; i++) map = addMonthMinute(map, '2026-07', 'live')
        map = addMonthMinute(map, '2026-08', 'movie')
        map = addMonthMinute(map, '2025-12', 'live')
        const summary = yearSummary(map, 2026)
        expect(summary.totals).toEqual({ live: 3, movie: 1, episode: 0 })
        expect(summary.totalMinutes).toBe(4)
        expect(summary.topMonth).toEqual({ month: '2026-07', minutes: 3 })
    })

    it('monthKey no fuso local', () => {
        expect(monthKey(new Date(2026, 11, 25).getTime())).toBe('2026-12')
    })
})

describe('lastMonths / usageCsv (fase 3)', () => {
    const months: MonthUsageMap = {
        '2026-05': { live: 100, movie: 20 },
        '2026-07': { episode: 30 },
    }

    it('série dos últimos meses com zeros e virada de ano', () => {
        const series = lastMonths(months, '2026-07', 4)
        expect(series.map(entry => entry.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
        expect(series.map(entry => entry.minutes)).toEqual([0, 120, 0, 30])
        expect(lastMonths({}, '2026-01', 2).map(e => e.month)).toEqual(['2025-12', '2026-01'])
    })

    it('CSV ordenado com cabeçalho', () => {
        expect(usageCsv(months)).toBe('mes,tv,filmes,series\n2026-05,100,20,0\n2026-07,0,0,30')
    })
})

describe('currentStreak', () => {
    it('conta dias seguidos; hoje vazio começa de ontem; buraco zera', () => {
        const map: UsageMap = {
            '2026-07-13': { live: 10 },
            '2026-07-12': { movie: 5 },
            '2026-07-11': { episode: 1 },
            '2026-07-09': { live: 99 },
        }
        expect(currentStreak(map, '2026-07-13')).toBe(3)
        expect(currentStreak({ '2026-07-12': { live: 1 } }, '2026-07-13')).toBe(1)
        expect(currentStreak({}, '2026-07-13')).toBe(0)
    })
})
