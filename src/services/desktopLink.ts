/**
 * 🔗 Receber do desktop: cliente WebSocket que se conecta ao controle web do
 * NeoStream desktop (mesmo servidor da página do navegador), se identifica
 * como APP ({action:'helloMobile'}) e reage ao "📱 Enviar pro celular" — o
 * desktop manda {type:'playOnMobile', streamId, name} e o app dá play no
 * canal com a PRÓPRIA conta. Endereço+PIN vêm do pareamento (pairdesktop).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyNow } from './notify'
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
            } catch { /* cai no retry do onclose */ }
        }
        ws.onmessage = event => {
            const text = typeof event.data === 'string' ? event.data : ''
            const push = parseDesktopPush(text)
            if (push) { void playPushed(push); return }
            const vod = parseVodPush(text)
            if (vod) { void playPushedVod(vod); return }
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
