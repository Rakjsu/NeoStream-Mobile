/**
 * Hábitos de horário (port adaptado do habitProfile do desktop): cada minuto
 * assistido soma em (dia da semana, faixa de hora) → título. O Início usa
 * pra montar o rail "Pra agora" — jornal às 20h, desenho de manhã. PURO na
 * agregação; chaves por perfil.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { profileKey } from './profiles'

export type HourBucket = 'morning' | 'afternoon' | 'evening' | 'night'

export function hourBucketOf(hour: number): HourBucket {
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'afternoon'
    if (hour >= 18) return 'evening'
    return 'night'
}

/** "1|evening" → "live|Jornal" → minutos. */
export type HabitMap = Record<string, Record<string, number>>

const STORAGE_KEY = 'neostream_usage_habits'
const MAX_KEYS_PER_CELL = 50

export function habitCell(weekday: number, bucket: HourBucket): string {
    return `${weekday}|${bucket}`
}

/** Soma 1 minuto sem mutar; poda o título mais frio quando a célula lota (PURO). */
export function addHabitMinute(map: HabitMap, weekday: number, bucket: HourBucket, key: string): HabitMap {
    const cell = habitCell(weekday, bucket)
    const entries = { ...map[cell], [key]: (map[cell]?.[key] ?? 0) + 1 }
    const keys = Object.keys(entries)
    if (keys.length > MAX_KEYS_PER_CELL) {
        // Nunca poda o que acabou de somar — senão título novo não entra nunca.
        const coldest = keys.filter(k => k !== key).sort((a, b) => entries[a] - entries[b])[0]
        delete entries[coldest]
    }
    return { ...map, [cell]: entries }
}

/** Títulos mais quentes desta célula, "kind|title" por minutos (PURO). */
export function topHabitKeys(map: HabitMap, weekday: number, bucket: HourBucket, top = 10): string[] {
    const entries = map[habitCell(weekday, bucket)] ?? {}
    return Object.keys(entries).sort((a, b) => entries[b] - entries[a]).slice(0, top)
}

export async function loadHabits(): Promise<HabitMap> {
    try {
        const raw = await AsyncStorage.getItem(profileKey(STORAGE_KEY))
        const parsed = raw ? (JSON.parse(raw) as HabitMap) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

/** O player pinga junto com o recordWatchMinute. */
export async function recordHabitMinute(kind: string, title: string, nowMs: number): Promise<void> {
    if (!title) return
    try {
        const date = new Date(nowMs)
        const map = addHabitMinute(await loadHabits(), date.getDay(), hourBucketOf(date.getHours()), `${kind}|${title}`)
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(map))
    } catch { /* best-effort */ }
}
