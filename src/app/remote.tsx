import { Stack, router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getDesktopLinkConfig } from '../services/desktopLink'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

/**
 * 🎛️ Controle do desktop DENTRO do app: fala o mesmo protocolo WS do
 * controle web (endereço + PIN vêm do pareamento). Transporte, volume e
 * navegação por setas (navKey — desktops v4.34+; os antigos só ignoram).
 */
// Socket vive no módulo (a rota é singleton) — mesmo padrão do desktopLink.
let activeSocket: WebSocket | null = null

export default function DesktopRemote() {
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline' | 'unpaired'>('connecting')
    const [nowTitle, setNowTitle] = useState('')

    useEffect(() => {
        let disposed = false
        let ws: WebSocket | null = null
        void getDesktopLinkConfig().then(config => {
            if (disposed) return
            if (!config.addr || !config.pin) {
                setStatus('unpaired')
                return
            }
            const address = config.addr.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
            ws = new WebSocket(`ws://${address}/?pin=${encodeURIComponent(config.pin)}`)
            activeSocket = ws
            ws.onopen = () => { if (!disposed) setStatus('online') }
            ws.onmessage = event => {
                if (disposed || typeof event.data !== 'string') return
                try {
                    const msg = JSON.parse(event.data) as { type?: string; title?: string; now?: string }
                    if (msg?.type === 'state') {
                        setNowTitle(typeof msg.title === 'string' && msg.title
                            ? msg.title
                            : typeof msg.now === 'string' ? msg.now : '')
                    }
                } catch { /* frame de outra feature */ }
            }
            ws.onclose = () => { if (!disposed) setStatus('offline') }
            ws.onerror = () => { if (!disposed) setStatus('offline') }
        })
        return () => {
            disposed = true
            try { ws?.close() } catch { /* já fechado */ }
            if (activeSocket === ws) activeSocket = null
        }
    }, [])

    const send = useCallback((action: string, extra?: Record<string, unknown>) => {
        const ws = activeSocket
        if (!ws || ws.readyState !== 1) return
        try { ws.send(JSON.stringify({ action, ...extra })) } catch { /* cai no onclose */ }
    }, [])

    const button = (label: string, onPress: () => void, big = false) => (
        <TvTouchable key={label} style={[styles.btn, big && styles.btnBig]} onPress={onPress}>
            <Text style={styles.btnText}>{label}</Text>
        </TvTouchable>
    )

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('remoteTitle') }} />
            <Text style={styles.title}>🎛️ {t('remoteTitle')}</Text>
            <Text style={styles.status}>
                {status === 'online' ? `🟢 ${t('remoteConnected')}`
                    : status === 'connecting' ? `🟡 ${t('remoteConnecting')}`
                    : status === 'unpaired' ? t('deskLinkNeedPair')
                    : `🔴 ${t('remoteOffline')}`}
            </Text>
            {nowTitle ? <Text style={styles.now} numberOfLines={1}>{nowTitle}</Text> : null}
            <View style={styles.row}>
                {button('⏮', () => send('previous'))}
                {button('⏯', () => send('togglePlay'), true)}
                {button('⏭', () => send('next'))}
            </View>
            <View style={styles.row}>
                {button('🔉', () => send('volumeDown'))}
                {button('🔇', () => send('mute'))}
                {button('🔊', () => send('volumeUp'))}
                {button('⏹', () => send('stop'))}
            </View>
            <View style={styles.row}>{button('▲', () => send('navKey', { key: 'up' }))}</View>
            <View style={styles.row}>
                {button('◀', () => send('navKey', { key: 'left' }))}
                {button('OK', () => send('navKey', { key: 'ok' }), true)}
                {button('▶', () => send('navKey', { key: 'right' }))}
            </View>
            <View style={styles.row}>{button('▼', () => send('navKey', { key: 'down' }))}</View>
            <View style={styles.row}>{button('↩', () => send('navKey', { key: 'back' }))}</View>
            {status === 'unpaired' ? (
                <TvTouchable onPress={() => router.replace('/pairdesktop')}>
                    <Text style={styles.link}>{t('pairBtn')}</Text>
                </TvTouchable>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xl,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    status: { color: colors.textDim, fontSize: 13, textAlign: 'center' },
    now: { color: colors.text, fontSize: 14, maxWidth: '90%' },
    row: { flexDirection: 'row', gap: spacing.sm },
    btn: {
        minWidth: 64,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 12,
        backgroundColor: colors.card,
        alignItems: 'center',
    },
    btnBig: { minWidth: 96 },
    btnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
    link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
})
