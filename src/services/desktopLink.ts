/**
 * 🔗 Receber do desktop: cliente WebSocket que se conecta ao controle web do
 * NeoStream desktop (mesmo servidor da página do navegador), se identifica
 * como APP ({action:'helloMobile'}) e reage ao "📱 Enviar pro celular" — o
 * desktop manda {type:'playOnMobile', streamId, name} e o app dá play no
 * canal com a PRÓPRIA conta. Endereço+PIN vêm do pareamento (pairdesktop).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { listScheduled, notifyAt, notifyNow } from './notify'
import { isFavorite, loadFavorites, persistToggle } from './favorites'
import { router } from 'expo-router'
import { getClient } from './session'
import { setZapContext } from './zap'

const CONFIG_KEY = 'neostream_desktop_link'
const RETRY_MS = 15_000

export interface DesktopLinkConfig {
    addr: string
    pin: string
    enabled: boolean
}

let cachedConfig: DesktopLinkConfig | null = null
let socket: WebSocket | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

export async function getDesktopLinkConfig(): Promise<DesktopLinkConfig> {
    if (cachedConfig) return cachedConfig
    try {
        const raw = await AsyncStorage.getItem(CONFIG_KEY)
        const parsed = raw ? JSON.parse(raw) as Partial<DesktopLinkConfig> : null
        cachedConfig = {
            addr: typeof parsed?.addr === 'string' ? parsed.addr : '',
            pin: typeof parsed?.pin === 'string' ? parsed.pin : '',
            enabled: parsed?.enabled === true,
        }
    } catch {
        cachedConfig = { addr: '', pin: '', enabled: false }
    }
    return cachedConfig
}

export async function setDesktopLinkConfig(partial: Partial<DesktopLinkConfig>): Promise<DesktopLinkConfig> {
    const current = await getDesktopLinkConfig()
    cachedConfig = { ...current, ...partial }
    try {
        await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(cachedConfig))
    } catch { /* best-effort */ }
    return cachedConfig
}

/** ⭐ Favoritos vindos do desktop (PURO): mapeia o type do desktop pro kind local. */
export function parseFavoritesPush(text: string): { kind: 'live' | 'movie' | 'series'; id: string }[] | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const message = parsed as { type?: unknown; items?: unknown } | null
    if (!message || message.type !== 'favorites' || !Array.isArray(message.items)) return null
    const out: { kind: 'live' | 'movie' | 'series'; id: string }[] = []
    for (const raw of message.items) {
        const item = raw as { id?: unknown; type?: unknown } | null
        if (!item || typeof item.id !== 'string' || !item.id) continue
        const kind = item.type === 'channel' ? 'live'
            : item.type === 'movie' ? 'movie'
            : item.type === 'series' ? 'series'
            : null
        if (kind) out.push({ kind, id: item.id })
    }
    return out
}

/** ⏰ Lembretes vindos do desktop (PURO): só os futuros interessam. */
export function parseRemindersPush(text: string, nowMs: number): { title: string; channelName: string; startMs: number }[] | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const message = parsed as { type?: unknown; items?: unknown } | null
    if (!message || message.type !== 'reminders' || !Array.isArray(message.items)) return null
    const out: { title: string; channelName: string; startMs: number }[] = []
    for (const raw of message.items) {
        const item = raw as { title?: unknown; channelName?: unknown; startIso?: unknown } | null
        if (!item || typeof item.title !== 'string' || !item.title || typeof item.startIso !== 'string') continue
        const startMs = Date.parse(item.startIso)
        if (!Number.isFinite(startMs) || startMs <= nowMs) continue
        out.push({
            title: item.title,
            channelName: typeof item.channelName === 'string' ? item.channelName : '',
            startMs,
        })
    }
    return out
}

// 🔄 Itens 123/124: favoritos entram por união (ids do provedor — mesmo
// servidor casa direto); lembretes futuros viram notificações locais com
// dedupe por título + horário (~1 min de tolerância).
async function applyFavoritesSync(items: { kind: 'live' | 'movie' | 'series'; id: string }[]): Promise<void> {
    const current = await loadFavorites()
    for (const item of items) {
        if (!isFavorite(current, item.kind, item.id)) await persistToggle(item.kind, item.id)
    }
}

async function applyRemindersSync(items: { title: string; channelName: string; startMs: number }[]): Promise<void> {
    const scheduled = await listScheduled()
    for (const reminder of items.slice(0, 20)) {
        const exists = scheduled.some(s => s.title === reminder.title && Math.abs(s.atMs - reminder.startMs) < 60_000)
        if (!exists) await notifyAt(reminder.title, reminder.channelName, '/(tabs)/live', reminder.startMs)
    }
}

/** Mensagem do desktop pedindo pra tocar um canal aqui (PURO). */
export function parseDesktopPush(text: string): { streamId: string; name: string } | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const message = parsed as { type?: unknown; streamId?: unknown; name?: unknown } | null
    if (!message || message.type !== 'playOnMobile' || typeof message.streamId !== 'string' || !message.streamId) {
        return null
    }
    return { streamId: message.streamId, name: typeof message.name === 'string' ? message.name : '' }
}

async function playPushed(push: { streamId: string; name: string }): Promise<void> {
    const client = await getClient()
    if (!client) return
    const channels = await client.getLiveChannels()
    const normalize = (value: string) => value.trim().toLowerCase()
    // Id igual primeiro (mesmo provedor); nome como resgate (contas diferentes).
    const channel = channels.find(c => String(c.stream_id) === push.streamId)
        ?? (push.name ? channels.find(c => normalize(c.name) === normalize(push.name)) : undefined)
    if (!channel) return
    setZapContext(channels.map(c => ({ id: String(c.stream_id), name: c.name, num: c.num })), String(channel.stream_id))
    router.push({
        pathname: '/player',
        params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
    })
}

/** Mensagem do desktop pedindo pra tocar um VOD/episódio aqui (PURO). */
export function parseVodPush(text: string): { kind: 'movie' | 'series'; sid: string; container: string; name: string } | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const message = parsed as { type?: unknown; kind?: unknown; sid?: unknown; container?: unknown; name?: unknown } | null
    if (!message || message.type !== 'playVodOnMobile' || typeof message.sid !== 'string' || !message.sid) return null
    return {
        kind: message.kind === 'series' ? 'series' : 'movie',
        sid: message.sid,
        container: typeof message.container === 'string' && message.container ? message.container : 'mp4',
        name: typeof message.name === 'string' ? message.name : '',
    }
}

/** Aviso vindo do desktop (ex.: gravação concluída) pra notificar aqui (PURO). */
export function parseNotifyPush(text: string): { title: string; body: string } | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const message = parsed as { type?: unknown; title?: unknown; body?: unknown } | null
    if (!message || message.type !== 'notifyMobile' || typeof message.title !== 'string' || !message.title) return null
    return { title: message.title, body: typeof message.body === 'string' ? message.body : '' }
}

async function playPushedVod(push: { kind: 'movie' | 'series'; sid: string; container: string; name: string }): Promise<void> {
    const client = await getClient()
    if (!client) return
    const url = push.kind === 'series'
        ? client.seriesStreamUrl(push.sid, push.container)
        : client.vodStreamUrl(push.sid, push.container)
    router.push({ pathname: '/player', params: { url, title: push.name } })
}

// 🖥️ Estado da ponte + envio de comandos crus (o controle web valida a action).
let connected = false

export function isDesktopLinked(): boolean {
    return connected
}

/** Envia um comando pro controle web do desktop (ex.: playChannel). */
export function sendToDesktop(message: object): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    try {
        socket.send(JSON.stringify(message))
        return true
    } catch {
        return false
    }
}

export function disconnectDesktopLink(): void {
    connected = false
    if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
    }
    const current = socket
    socket = null
    try {
        current?.close()
    } catch { /* já caiu */ }
}

export async function connectDesktopLink(): Promise<void> {
    const config = await getDesktopLinkConfig()
    if (!config.enabled || !config.addr || config.pin.length < 4) return
    disconnectDesktopLink()
    try {
        const address = config.addr.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
        const ws = new WebSocket(`ws://${address}/?pin=${encodeURIComponent(config.pin)}`)
        socket = ws
        ws.onopen = () => {
            connected = true
            try {
                ws.send(JSON.stringify({ action: 'helloMobile', name: 'NeoStream Mobile' }))
                // 🔄 Pede o snapshot de favoritos e lembretes do desktop (v4.34+).
                ws.send(JSON.stringify({ action: 'requestFavorites' }))
                ws.send(JSON.stringify({ action: 'requestReminders' }))
            } catch { /* cai no retry do onclose */ }
        }
        ws.onmessage = event => {
            const text = typeof event.data === 'string' ? event.data : ''
            const push = parseDesktopPush(text)
            if (push) { void playPushed(push); return }
            const vod = parseVodPush(text)
            if (vod) { void playPushedVod(vod); return }
            const favorites = parseFavoritesPush(text)
            if (favorites) { void applyFavoritesSync(favorites); return }
            const reminders = parseRemindersPush(text, Date.now())
            if (reminders) { void applyRemindersSync(reminders); return }
            const notice = parseNotifyPush(text)
            if (notice) void notifyNow(notice.title, notice.body, '/(tabs)/home')
        }
        const scheduleRetry = () => {
            connected = false
            if (socket !== ws) return // desconexão pedida ou já substituída
            socket = null
            retryTimer = setTimeout(() => { void connectDesktopLink() }, RETRY_MS)
        }
        ws.onclose = scheduleRetry
        ws.onerror = scheduleRetry
    } catch {
        retryTimer = setTimeout(() => { void connectDesktopLink() }, RETRY_MS)
    }
}
