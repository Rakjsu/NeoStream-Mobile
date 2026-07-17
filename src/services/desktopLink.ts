/**
 * 🔗 Receber do desktop: cliente WebSocket que se conecta ao controle web do
 * NeoStream desktop (mesmo servidor da página do navegador), se identifica
 * como APP ({action:'helloMobile'}) e reage ao "📱 Enviar pro celular" — o
 * desktop manda {type:'playOnMobile', streamId, name} e o app dá play no
 * canal com a PRÓPRIA conta. Endereço+PIN vêm do pareamento (pairdesktop).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
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

export function disconnectDesktopLink(): void {
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
            try {
                ws.send(JSON.stringify({ action: 'helloMobile', name: 'NeoStream Mobile' }))
            } catch { /* cai no retry do onclose */ }
        }
        ws.onmessage = event => {
            const push = parseDesktopPush(typeof event.data === 'string' ? event.data : '')
            if (push) void playPushed(push)
        }
        const scheduleRetry = () => {
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
