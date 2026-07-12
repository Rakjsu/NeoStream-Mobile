/**
 * Notificações locais (Android 13+ pede permissão em runtime). Camada fina
 * sobre o expo-notifications — tudo best-effort: falhar em notificar nunca
 * pode derrubar o fluxo que notificaria.
 */
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

/** Notificação imediata com um marcador de rota no payload (o _layout roteia o clique). */
export async function notifyNow(title: string, body: string, route: string): Promise<void> {
    try {
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
