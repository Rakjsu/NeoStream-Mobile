/**
 * Notificações locais (Android 13+ pede permissão em runtime). Camada fina
 * sobre o expo-notifications — tudo best-effort: falhar em notificar nunca
 * pode derrubar o fluxo que notificaria.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { t, tf } from '../i18n/strings'

let configured = false

/** Mostra alerta mesmo com o app em primeiro plano (download termina com o app aberto). */
function configureOnce(): void {
    if (configured) return
    configured = true
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    })
}

export async function ensureNotifyPermission(): Promise<boolean> {
    try {
        configureOnce()
        const current = await Notifications.getPermissionsAsync()
        if (current.granted) return true
        const asked = await Notifications.requestPermissionsAsync()
        return asked.granted
    } catch {
        return false
    }
}

// 🔕 Snooze: avisos automáticos silenciados até o horário salvo (lembretes
// agendados pelo usuário passam direto — foram pedidos explicitamente).
const SNOOZE_KEY = 'neostream_notify_snooze_until'

export async function getNotifySnoozeUntil(): Promise<number> {
    try {
        const until = Number(await AsyncStorage.getItem(SNOOZE_KEY))
        return Number.isFinite(until) ? until : 0
    } catch {
        return 0
    }
}

export async function setNotifySnooze(untilMs: number): Promise<void> {
    try {
        if (untilMs > 0) await AsyncStorage.setItem(SNOOZE_KEY, String(untilMs))
        else await AsyncStorage.removeItem(SNOOZE_KEY)
    } catch { /* best-effort */ }
}

/** Notificação imediata com um marcador de rota no payload (o _layout roteia o clique). */
export async function notifyNow(title: string, body: string, route: string): Promise<void> {
    try {
        if (Date.now() < (await getNotifySnoozeUntil())) return
        if (!(await ensureNotifyPermission())) return
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data: { route } },
            trigger: null,
        })
    } catch { /* best-effort */ }
}

/** Notificação agendada pra um horário (lembrete de programa). */
export async function notifyAt(title: string, body: string, route: string, atMs: number): Promise<boolean> {
    try {
        if (atMs <= Date.now()) return false
        if (!(await ensureNotifyPermission())) return false
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data: { route } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: atMs },
        })
        return true
    } catch {
        return false
    }
}

export interface ScheduledReminder {
    id: string
    title: string
    body: string
    atMs: number
}

/** Lembretes agendados (só os com gatilho por data). */
export async function listScheduled(): Promise<ScheduledReminder[]> {
    try {
        const all = await Notifications.getAllScheduledNotificationsAsync()
        return all.flatMap(item => {
            const trigger = item.trigger as { type?: string; value?: number; date?: number } | null
            const atMs = Number(trigger?.value ?? trigger?.date)
            if (!Number.isFinite(atMs)) return []
            return [{
                id: item.identifier,
                title: item.content.title ?? '',
                body: item.content.body ?? '',
                atMs,
            }]
        }).sort((a, b) => a.atMs - b.atMs)
    } catch {
        return []
    }
}

export async function cancelScheduled(id: string): Promise<void> {
    try {
        await Notifications.cancelScheduledNotificationAsync(id)
    } catch { /* best-effort */ }
}

/** O clique numa notificação navega pra rota gravada no payload. */
export function onNotificationRoute(handler: (route: string) => void): () => void {
    configureOnce()
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
        const route = response.notification.request.content.data?.route
        if (typeof route === 'string' && route) handler(route)
    })
    return () => sub.remove()
}

/** "Download concluído" com clique levando pra tela de Downloads. */
export async function notifyDownloadDone(title: string): Promise<void> {
    await notifyNow(t('dlNotifTitle'), tf('dlNotifBody', { title }), '/downloads')
}

/** Progresso do download na barra de status (mesmo id → substitui, sem spam). */
export async function notifyDownloadProgress(id: string, title: string, pct: number): Promise<void> {
    try {
        if (!(await ensureNotifyPermission())) return
        await Notifications.scheduleNotificationAsync({
            identifier: `dl-${id}`,
            content: { title: tf('dlProgressNotif', { pct }), body: title, data: { route: '/downloads' } },
            trigger: null,
        })
    } catch { /* best-effort */ }
}

export async function dismissDownloadProgress(id: string): Promise<void> {
    try {
        await Notifications.dismissNotificationAsync(`dl-${id}`)
    } catch { /* best-effort */ }
}

// ------------------------------------------------------ gravação com ⏹ --

const REC_CATEGORY = 'neostream-rec'
const REC_STOP_ACTION = 'rec-stop'
let recCategoryReady = false

async function ensureRecCategory(): Promise<void> {
    if (recCategoryReady) return
    recCategoryReady = true
    try {
        await Notifications.setNotificationCategoryAsync(REC_CATEGORY, [
            { identifier: REC_STOP_ACTION, buttonTitle: t('recStopAction'), options: { opensAppToForeground: false } },
        ])
    } catch { /* best-effort */ }
}

/** "⏺ Gravando agora" com botão ⏹ — a ação é tratada no layout das abas. */
export async function notifyRecordingStarted(title: string): Promise<void> {
    try {
        if (!(await ensureNotifyPermission())) return
        await ensureRecCategory()
        await Notifications.scheduleNotificationAsync({
            content: { title: t('recStartedNotif'), body: title, data: { route: '/downloads' }, categoryIdentifier: REC_CATEGORY },
            trigger: null,
        })
    } catch { /* best-effort */ }
}

/** Escuta o ⏹ da notificação de gravação (para sem abrir o app). */
export function onRecStopAction(handler: () => void): () => void {
    configureOnce()
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
        if (response.actionIdentifier === REC_STOP_ACTION) handler()
    })
    return () => sub.remove()
}
