import { Ionicons } from '@expo/vector-icons'
import { useEvent } from 'expo'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getEntry, resumePosition, saveSample, type ProgressKind } from '../services/progress'
import { cachedFetch, getClient } from '../services/session'
import { hasZapContext, zapBy } from '../services/zap'
import { colors, spacing } from '../ui/theme'

export default function Player() {
    const { url, title, live, pid, kind, sid, container, cover } = useLocalSearchParams<{
        url: string
        title?: string
        live?: string
        /** Presentes só em VOD/episódio: habilitam o "continuar assistindo". */
        pid?: string
        kind?: string
        sid?: string
        container?: string
        cover?: string
    }>()
    const insets = useSafeAreaInsets()
    useKeepAwake()

    const player = useVideoPlayer(String(url ?? ''), p => {
        p.play()
    })
    const { status, error } = useEvent(player, 'statusChange', {
        status: player.status,
        error: undefined,
    })

    const trackable = live !== '1' && !!pid && !!sid
    // O expo-video pode disparar release do player no unmount antes do cleanup;
    // amostras ficam aqui pra última gravação não precisar tocar o player.
    const lastSample = useRef({ position: 0, duration: 0 })

    // Zapping ao vivo: título vira estado (troca junto com o canal) e o "agora"
    // do EPG aparece embaixo. O contexto vem da tela que abriu o player.
    const [liveTitle, setLiveTitle] = useState(title ?? '')
    const [liveEpg, setLiveEpg] = useState('')
    const zappable = live === '1' && hasZapContext()

    const showEpg = (channelId: string) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            const nowNext = await cachedFetch(`epg:${channelId}`, () => client.getShortEpg(channelId))
                .catch(() => null)
            if (nowNext?.now) setLiveEpg(nowNext.now.title)
        })()
    }

    const zap = (delta: number) => {
        const channel = zapBy(delta)
        if (!channel) return
        void (async () => {
            const client = await getClient()
            if (!client) return
            await player.replaceAsync(client.liveStreamUrl(channel.id))
            player.play()
            setLiveTitle(channel.name)
            setLiveEpg('')
            showEpg(channel.id)
        })()
    }

    // Retomar do ponto salvo: seek único logo que a mídia carrega.
    useEffect(() => {
        if (!trackable) return
        let cancelled = false
        void getEntry(String(pid)).then(entry => {
            const at = resumePosition(entry)
            if (!cancelled && at > 0) player.currentTime = at
        })
        return () => { cancelled = true }
        // player é estável entre renders (useVideoPlayer) — só o pid importa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid, trackable])

    // Amostra a posição a cada 5s + gravação final ao sair da tela.
    useEffect(() => {
        if (!trackable) return
        const persist = () => {
            const { position, duration } = lastSample.current
            if (position <= 0) return
            void saveSample({
                id: String(pid),
                kind: (kind === 'episode' ? 'episode' : 'movie') as ProgressKind,
                streamId: String(sid),
                container: String(container || 'mp4'),
                title: String(title ?? ''),
                cover: String(cover ?? ''),
                position,
                duration,
                updatedAt: Date.now(),
            })
        }
        const timer = setInterval(() => {
            try {
                lastSample.current = { position: player.currentTime || 0, duration: player.duration || 0 }
            } catch { return } // player já liberado
            persist()
        }, 5000)
        return () => {
            clearInterval(timer)
            try {
                lastSample.current = { position: player.currentTime || 0, duration: player.duration || 0 }
            } catch { /* usa a última amostra do intervalo */ }
            persist()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid, trackable])

    return (
        <View style={styles.root}>
            <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls
                allowsPictureInPicture
            />

            <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
                <TouchableOpacity style={styles.back} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.titleBlock}>
                    <Text style={styles.title} numberOfLines={1}>
                        {live === '1' ? `🔴 ${liveTitle}` : title ?? ''}
                    </Text>
                    {live === '1' && liveEpg ? (
                        <Text style={styles.epg} numberOfLines={1}>{liveEpg}</Text>
                    ) : null}
                </View>
            </View>

            {zappable ? (
                <View style={styles.zapCol}>
                    <TouchableOpacity style={styles.zapBtn} onPress={() => zap(1)}>
                        <Ionicons name="chevron-up" size={26} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.zapBtn} onPress={() => zap(-1)}>
                        <Ionicons name="chevron-down" size={26} color={colors.text} />
                    </TouchableOpacity>
                </View>
            ) : null}

            {status === 'error' ? (
                <View style={styles.errorBox}>
                    <Ionicons name="warning" size={28} color={colors.danger} />
                    <Text style={styles.errorText}>
                        Não deu pra reproduzir este conteúdo.{'\n'}
                        {error?.message ?? 'O formato pode não ser suportado ou o servidor está fora do ar.'}
                    </Text>
                </View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    video: { flex: 1 },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingBottom: spacing.sm,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    back: { padding: spacing.xs },
    titleBlock: { flex: 1 },
    title: { color: colors.text, fontSize: 16, fontWeight: '600' },
    epg: { color: 'rgba(244,244,248,0.7)', fontSize: 12 },
    zapCol: {
        position: 'absolute',
        right: spacing.sm,
        top: '38%',
        gap: spacing.md,
    },
    zapBtn: {
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 22,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorBox: {
        position: 'absolute',
        left: spacing.xl,
        right: spacing.xl,
        top: '40%',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(22,22,31,0.95)',
        borderRadius: 12,
        padding: spacing.lg,
    },
    errorText: { color: colors.text, fontSize: 14, textAlign: 'center' },
})
