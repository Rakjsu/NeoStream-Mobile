/**
 * Resumo semanal: domingo às 20h uma notificação conta a semana ("12h — 8h
 * de TV, 3h de séries · Top: Jornal"). Agendada ao abrir o app, com dedupe
 * por semana. O cálculo do próximo domingo é PURO (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyAt } from './notify'
import { dayKey, formatMinutes, loadTitleUsage, loadUsage, summarize, topTitles } from './usage'
import { tf, t } from '../i18n/strings'

/** Próximo domingo 20:00 DEPOIS de nowMs (PURO). */
export function nextSundayEvening(nowMs: number): number {
    const date = new Date(nowMs)
    date.setHours(20, 0, 0, 0)
    const daysAhead = (7 - date.getDay()) % 7
    date.setDate(date.getDate() + daysAhead)
    if (date.getTime() <= nowMs) date.setDate(date.getDate() + 7)
    return date.getTime()
}

export async function scheduleWeeklySummary(nowMs = Date.now()): Promise<void> {
    try {
        const at = nextSundayEvening(nowMs)
        const flag = `neostream_weekly_${dayKey(at)}`
        if (await AsyncStorage.getItem(flag)) return
        const [usage, titles] = await Promise.all([loadUsage(), loadTitleUsage()])
        const summary = summarize(usage, dayKey(nowMs))
        if (summary.totalMinutes < 30) return // semana morta não vira notificação
        const top = topTitles(titles, dayKey(nowMs), ['live', 'movie', 'episode'], 1)[0]
        const body = tf('weeklyBody', {
            total: formatMinutes(summary.totalMinutes),
            live: formatMinutes(summary.totals.live),
            ep: formatMinutes(summary.totals.episode + summary.totals.movie),
            top: top?.title ?? '—',
        })
        const ok = await notifyAt(t('weeklyTitle'), body, '/(tabs)/settings', at)
        if (ok) await AsyncStorage.setItem(flag, '1')
    } catch { /* best-effort */ }
}
