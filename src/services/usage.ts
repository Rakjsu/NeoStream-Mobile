/**
 * Tempo assistido (local, por aparelho): o player pinga 1 minuto por vez
 * enquanto toca; aqui a gente acumula por dia e por tipo. Agregação PURA
 * (testável); só load/save tocam o AsyncStorage. Base do futuro Wrapped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { profileKey } from './profiles'

export type UsageKind = 'live' | 'movie' | 'episode'

/** dia "YYYY-MM-DD" → minutos por tipo. */
export type UsageMap = Record<string, Partial<Record<UsageKind, number>>>

const STORAGE_KEY = 'neostream_usage'
const TITLES_KEY = 'neostream_usage_titles'
const MONTHS_KEY = 'neostream_usage_months'
const KEEP_DAYS = 30

/** Epoch ms → "YYYY-MM-DD" no fuso local. */
export function dayKey(ms: number): string {
    const date = new Date(ms)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/** Soma minutos num dia/tipo, sem mutar; poda dias além do horizonte. */
export function addMinutes(map: UsageMap, day: string, kind: UsageKind, minutes: number, keepDays = KEEP_DAYS): UsageMap {
    const next: UsageMap = { ...map, [day]: { ...map[day], [kind]: (map[day]?.[kind] ?? 0) + minutes } }
    const days = Object.keys(next).sort()
    for (const stale of days.slice(0, Math.max(0, days.length - keepDays))) delete next[stale]
    return next
}

export interface UsageSummary {
    /** Minutos por tipo na janela. */
    totals: Record<UsageKind, number>
    totalMinutes: number
}

/** Totais dos últimos `windowDays` dias terminando em `todayKey` (PURO). */
export function summarize(map: UsageMap, todayKey: string, windowDays = 7): UsageSummary {
    const totals: Record<UsageKind, number> = { live: 0, movie: 0, episode: 0 }
    for (const [day, kinds] of Object.entries(map)) {
        if (day > todayKey) continue
        const age = (Date.parse(todayKey) - Date.parse(day)) / 86_400_000
        if (age >= windowDays) continue
        totals.live += kinds.live ?? 0
        totals.movie += kinds.movie ?? 0
        totals.episode += kinds.episode ?? 0
    }
    return { totals, totalMinutes: totals.live + totals.movie + totals.episode }
}

/** mês "YYYY-MM" → minutos por tipo (base do Wrapped anual). */
export type MonthUsageMap = Record<string, Partial<Record<UsageKind, number>>>

/** Epoch ms → "YYYY-MM" no fuso local. */
export function monthKey(ms: number): string {
    const date = new Date(ms)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Soma 1 minuto num mês/tipo, sem mutar; mantém 24 meses (PURO). */
export function addMonthMinute(map: MonthUsageMap, month: string, kind: UsageKind, keepMonths = 24): MonthUsageMap {
    const next: MonthUsageMap = { ...map, [month]: { ...map[month], [kind]: (map[month]?.[kind] ?? 0) + 1 } }
    const months = Object.keys(next).sort()
    for (const stale of months.slice(0, Math.max(0, months.length - keepMonths))) delete next[stale]
    return next
}

export interface YearSummary {
    totals: Record<UsageKind, number>
    totalMinutes: number
    topMonth: { month: string; minutes: number } | null
}

/** Totais de um ano + mês mais assistido (PURO). */
export function yearSummary(map: MonthUsageMap, year: number): YearSummary {
    const totals: Record<UsageKind, number> = { live: 0, movie: 0, episode: 0 }
    let topMonth: { month: string; minutes: number } | null = null
    for (const [month, kinds] of Object.entries(map)) {
        if (!month.startsWith(`${year}-`)) continue
        const monthTotal = (kinds.live ?? 0) + (kinds.movie ?? 0) + (kinds.episode ?? 0)
        totals.live += kinds.live ?? 0
        totals.movie += kinds.movie ?? 0
        totals.episode += kinds.episode ?? 0
        if (!topMonth || monthTotal > topMonth.minutes) topMonth = { month, minutes: monthTotal }
    }
    return { totals, totalMinutes: totals.live + totals.movie + totals.episode, topMonth }
}

/** dia → "kind|título" → minutos (o que exatamente tocou). */
export type TitleUsageMap = Record<string, Record<string, number>>

/** Soma 1 minuto num título, sem mutar; poda dias velhos (PURO). */
export function addTitleMinute(map: TitleUsageMap, day: string, kind: UsageKind, title: string, keepDays = 8): TitleUsageMap {
    const key = `${kind}|${title}`
    const next: TitleUsageMap = { ...map, [day]: { ...map[day], [key]: (map[day]?.[key] ?? 0) + 1 } }
    const days = Object.keys(next).sort()
    for (const stale of days.slice(0, Math.max(0, days.length - keepDays))) delete next[stale]
    return next
}

export interface TopTitle {
    title: string
    kind: UsageKind
    minutes: number
}

/** Top N títulos da janela, filtrando por tipo (PURO). */
export function topTitles(map: TitleUsageMap, todayKey: string, kinds: UsageKind[], top = 3, windowDays = 7): TopTitle[] {
    const totals = new Map<string, number>()
    for (const [day, entries] of Object.entries(map)) {
        if (day > todayKey) continue
        const age = (Date.parse(todayKey) - Date.parse(day)) / 86_400_000
        if (age >= windowDays) continue
        for (const [key, minutes] of Object.entries(entries)) totals.set(key, (totals.get(key) ?? 0) + minutes)
    }
    return [...totals.entries()]
        .map(([key, minutes]) => {
            const separator = key.indexOf('|')
            return { kind: key.slice(0, separator) as UsageKind, title: key.slice(separator + 1), minutes }
        })
        .filter(entry => kinds.includes(entry.kind) && entry.title)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, top)
}

/** Os últimos `n` meses (antigo → atual), com zero nos vazios (PURO). */
export function lastMonths(map: MonthUsageMap, currentMonth: string, n = 12): { month: string; minutes: number }[] {
    const [year, month] = currentMonth.split('-').map(Number)
    const series: { month: string; minutes: number }[] = []
    for (let offset = n - 1; offset >= 0; offset--) {
        const date = new Date(Date.UTC(year, month - 1 - offset, 1))
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
        const kinds = map[key] ?? {}
        series.push({ month: key, minutes: (kinds.live ?? 0) + (kinds.movie ?? 0) + (kinds.episode ?? 0) })
    }
    return series
}

/** Meses → CSV pra planilha (PURO). */
export function usageCsv(map: MonthUsageMap): string {
    const rows = Object.keys(map).sort().map(month => {
        const kinds = map[month]
        return `${month},${kinds.live ?? 0},${kinds.movie ?? 0},${kinds.episode ?? 0}`
    })
    return ['mes,tv,filmes,series', ...rows].join('\n')
}

/** Os últimos `n` dias (mais antigo → hoje), com zero nos dias sem uso (PURO). */
export function lastDays(map: UsageMap, todayKey: string, n = 7): { day: string; minutes: number }[] {
    const [year, month, day] = todayKey.split('-').map(Number)
    const series: { day: string; minutes: number }[] = []
    for (let offset = n - 1; offset >= 0; offset--) {
        const date = new Date(Date.UTC(year, month - 1, day - offset))
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
        const kinds = map[key] ?? {}
        series.push({ day: key, minutes: (kinds.live ?? 0) + (kinds.movie ?? 0) + (kinds.episode ?? 0) })
    }
    return series
}

/** Minutos desta semana (0–6 dias atrás) e da anterior (7–13) (PURO). */
export function weekDelta(map: UsageMap, todayKey: string): { current: number; previous: number } {
    let current = 0
    let previous = 0
    for (const [day, kinds] of Object.entries(map)) {
        if (day > todayKey) continue
        const age = (Date.parse(todayKey) - Date.parse(day)) / 86_400_000
        const minutes = (kinds.live ?? 0) + (kinds.movie ?? 0) + (kinds.episode ?? 0)
        if (age < 7) current += minutes
        else if (age < 14) previous += minutes
    }
    return { current, previous }
}

/** Dias SEGUIDOS assistindo até hoje (hoje vazio conta a partir de ontem) (PURO). */
export function currentStreak(map: UsageMap, todayKey: string): number {
    const minutesOf = (key: string) => {
        const kinds = map[key] ?? {}
        return (kinds.live ?? 0) + (kinds.movie ?? 0) + (kinds.episode ?? 0)
    }
    const [year, month, day] = todayKey.split('-').map(Number)
    let streak = 0
    let offset = minutesOf(todayKey) > 0 ? 0 : 1
    for (;;) {
        const date = new Date(Date.UTC(year, month - 1, day - offset))
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
        if (minutesOf(key) <= 0) break
        streak++
        offset++
    }
    return streak
}

/** 205 → "3h 25min"; 45 → "45min". */
export function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const rest = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${rest}min` : `${rest}min`
}

// ------------------------------------------------------------- persistência --

export async function loadUsage(): Promise<UsageMap> {
    try {
        const raw = await AsyncStorage.getItem(profileKey(STORAGE_KEY))
        const parsed = raw ? (JSON.parse(raw) as UsageMap) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function loadMonthUsage(): Promise<MonthUsageMap> {
    try {
        const raw = await AsyncStorage.getItem(profileKey(MONTHS_KEY))
        const parsed = raw ? (JSON.parse(raw) as MonthUsageMap) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function loadTitleUsage(): Promise<TitleUsageMap> {
    try {
        const raw = await AsyncStorage.getItem(profileKey(TITLES_KEY))
        const parsed = raw ? (JSON.parse(raw) as TitleUsageMap) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

/** O player chama isto a cada minuto tocado (com o título do que toca). */
export async function recordWatchMinute(kind: UsageKind, nowMs = Date.now(), title = ''): Promise<void> {
    try {
        const map = addMinutes(await loadUsage(), dayKey(nowMs), kind, 1)
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(map))
        if (title) {
            const titles = addTitleMinute(await loadTitleUsage(), dayKey(nowMs), kind, title)
            await AsyncStorage.setItem(profileKey(TITLES_KEY), JSON.stringify(titles))
        }
        const months = addMonthMinute(await loadMonthUsage(), monthKey(nowMs), kind)
        await AsyncStorage.setItem(profileKey(MONTHS_KEY), JSON.stringify(months))
    } catch { /* best-effort */ }
}
