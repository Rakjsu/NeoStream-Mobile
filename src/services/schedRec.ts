/**
 * Gravação agendada: "gravar este programa" guarda a intenção + agenda uma
 * notificação. O Android não deixa gravar em background — ao ABRIR o app
 * dentro da janela do programa, o REC dispara sozinho com auto-stop no fim.
 * A triagem é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyAt, notifyNow } from './notify'
import { recordingTitle, startRecording } from './recorder'
import { getClient } from './session'

export interface ScheduledRec {
    channelId: string
    channelName: string
    title: string
    startMs: number
    endMs: number
}

const STORAGE_KEY = 'neostream_sched_recs'

/** Separa: devidas AGORA (start≤now<end) e futuras; vencidas caem fora (PURO). */
export function splitDue(list: ScheduledRec[], nowMs: number): { due: ScheduledRec[]; keep: ScheduledRec[] } {
    return {
        due: list.filter(rec => rec.startMs <= nowMs && nowMs < rec.endMs),
        keep: list.filter(rec => rec.startMs > nowMs),
    }
}

export async function listScheduledRecs(): Promise<ScheduledRec[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((rec): rec is ScheduledRec => !!rec && typeof (rec as ScheduledRec).channelId === 'string')
            : []
    } catch {
        return []
    }
}

async function persist(list: ScheduledRec[]): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 10)))
    } catch { /* best-effort */ }
}

/** Agenda a intenção + a notificação-gatilho na hora do programa. */
export async function addScheduledRec(rec: ScheduledRec, notifTitle: string): Promise<void> {
    const list = await listScheduledRecs()
    if (list.some(item => item.channelId === rec.channelId && item.startMs === rec.startMs)) return
    await persist([...list, rec])
    await notifyAt(notifTitle, rec.title, '/(tabs)/home', rec.startMs)
}

/** Cancela uma agendada e devolve a lista nova. */
export async function removeScheduledRec(channelId: string, startMs: number): Promise<ScheduledRec[]> {
    const next = (await listScheduledRecs()).filter(rec =>
        !(rec.channelId === channelId && rec.startMs === startMs))
    await persist(next)
    return next
}

/** Chamado no load do Início: dispara o REC das intenções na janela. */
export async function checkScheduledRecordings(recStartedTitle: string): Promise<void> {
    const { due, keep } = splitDue(await listScheduledRecs(), Date.now())
    await persist(keep)
    const first = due[0]
    if (!first || recordingTitle()) return
    const client = await getClient()
    if (!client) return
    const url = client.liveStreamUrl(first.channelId)
    const ok = await startRecording(url, first.title, first.endMs - Date.now())
    if (ok) await notifyNow(recStartedTitle, first.title, '/downloads')
}
