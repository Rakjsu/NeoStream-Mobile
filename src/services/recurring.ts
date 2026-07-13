/**
 * Lembretes recorrentes: "avisar SEMPRE que {programa} passar". Guardamos o
 * título + canal; a cada abertura do app, a grade do canal é consultada e o
 * próximo horário futuro vira uma notificação agendada (com dedupe por
 * ocorrência). A busca da ocorrência é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyAt } from './notify'
import { cachedFetch, getClient } from './session'
import type { EpgProgram } from './xtream'

export interface RecurringReminder {
    title: string
    channelId: string
    channelName: string
}

const STORAGE_KEY = 'neostream_recurring_reminders'
const MAX_ITEMS = 10

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/** Próxima exibição FUTURA do título na grade (PURO; null = não passa hoje). */
export function nextOccurrence(programs: EpgProgram[], title: string, nowMs: number): EpgProgram | null {
    const wanted = normalize(title)
    return programs
        .filter(program => program.startMs > nowMs && normalize(program.title) === wanted)
        .sort((a, b) => a.startMs - b.startMs)[0] ?? null
}

export async function listRecurring(): Promise<RecurringReminder[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((item): item is RecurringReminder =>
                !!item && typeof (item as RecurringReminder).title === 'string'
                && typeof (item as RecurringReminder).channelId === 'string')
            : []
    } catch {
        return []
    }
}

async function persist(list: RecurringReminder[]): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
    } catch { /* best-effort */ }
}

export async function addRecurring(reminder: RecurringReminder): Promise<void> {
    const list = await listRecurring()
    const exists = list.some(item =>
        normalize(item.title) === normalize(reminder.title) && item.channelId === reminder.channelId)
    if (exists) return
    await persist([reminder, ...list])
}

export async function removeRecurring(reminder: RecurringReminder): Promise<RecurringReminder[]> {
    const next = (await listRecurring()).filter(item =>
        !(normalize(item.title) === normalize(reminder.title) && item.channelId === reminder.channelId))
    await persist(next)
    return next
}

/**
 * Chamado no load do Início: agenda a próxima ocorrência de cada recorrente
 * (dedupe por título+horário — reabrir o app não duplica a notificação).
 */
export async function checkRecurringReminders(): Promise<void> {
    const list = await listRecurring()
    if (list.length === 0) return
    const client = await getClient()
    if (!client?.getDaySchedule) return
    for (const reminder of list) {
        try {
            const programs = await cachedFetch(`day:${reminder.channelId}`,
                async () => await client.getDaySchedule?.(reminder.channelId) ?? [])
            const next = nextOccurrence(programs, reminder.title, Date.now())
            if (!next) continue
            const flag = `neostream_recurring_done_${reminder.channelId}_${next.startMs}`
            if (await AsyncStorage.getItem(flag)) continue
            await AsyncStorage.setItem(flag, '1')
            await notifyAt(`🔁 ${next.title}`, reminder.channelName, '/now', next.startMs)
        } catch { /* melhor sorte na próxima abertura */ }
    }
}
