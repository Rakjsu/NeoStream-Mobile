/**
 * Tempo assistido (local, por aparelho): o player pinga 1 minuto por vez
 * enquanto toca; aqui a gente acumula por dia e por tipo. Agregação PURA
 * (testável); só load/save tocam o AsyncStorage. Base do futuro Wrapped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type UsageKind = 'live' | 'movie' | 'episode'

/** dia "YYYY-MM-DD" → minutos por tipo. */
export type UsageMap = Record<string, Partial<Record<UsageKind, number>>>

const STORAGE_KEY = 'neostream_usage'
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

/** 205 → "3h 25min"; 45 → "45min". */
export function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const rest = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${rest}min` : `${rest}min`
}

// ------------------------------------------------------------- persistência --

export async function loadUsage(): Promise<UsageMap> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as UsageMap) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

/** O player chama isto a cada minuto tocado. */
export async function recordWatchMinute(kind: UsageKind, nowMs = Date.now()): Promise<void> {
    try {
        const map = addMinutes(await loadUsage(), dayKey(nowMs), kind, 1)
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch { /* best-effort */ }
}
