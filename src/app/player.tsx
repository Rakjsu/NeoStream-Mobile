import { Ionicons } from '@expo/vector-icons'
import { useEvent, useEventListener } from 'expo'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView, type AudioTrack, type SubtitleTrack } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getDownload } from '../services/downloads'
import { nextEpisodeAfter, type QueuedEpisode } from '../services/episodeQueue'
import { getEntry, resumePosition, saveSample, type ProgressKind } from '../services/progress'
import { cachedFetch, getClient } from '../services/session'
import { hasZapContext, zapBy } from '../services/zap'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

// Atribuições de faixa ficam fora do componente: o expo-video expõe as
// faixas como propriedades atribuíveis, o que a regra react-hooks/immutability
// não deixa fazer direto num handler.
type TrackPlayer = { audioTrack: AudioTrack | null; subtitleTrack: SubtitleTrack | null }
function applyAudioTrack(target: TrackPlayer, track: AudioTrack) {
    target.audioTrack = track
}
function applySubtitleTrack(target: TrackPlayer, track: SubtitleTrack | null) {
    target.subtitleTrack = track
}

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

    // Item baixado troca a fonte pro arquivo local — mudar o `source` faz o
    // useVideoPlayer recriar o player (jeito permitido pela regra de hooks).
    const [source, setSource] = useState(String(url ?? ''))
    const player = useVideoPlayer(source, p => {
        p.play()
    })
    const { status, error } = useEvent(player, 'statusChange', {
        status: player.status,
        error: undefined,
    })

    const trackable = live !== '1' && !!pid && !!sid

    // Faixas de áudio/legenda embutidas (ExoPlayer). 🎧 cicla dublado/legendado;
    // 💬 cicla desligada → cada legenda → desligada. Toast confirma a escolha.
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
    const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
    const [trackToast, setTrackToast] = useState('')
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (status !== 'readyToPlay') return
        queueMicrotask(() => {
            try {
                setAudioTracks(player.availableAudioTracks ?? [])
                setSubtitleTracks(player.availableSubtitleTracks ?? [])
            } catch { /* player já liberado */ }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    const showTrackToast = (text: string) => {
        setTrackToast(text)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setTrackToast(''), 2000)
    }

    // Sleep timer: 🌙 cicla 30 → 60 → 90 min → desligado; ao zerar, pausa.
    const SLEEP_STEPS = [0, 30, 60, 90]
    const [sleepMin, setSleepMin] = useState(0)

    const cycleSleep = () => {
        const next = SLEEP_STEPS[(SLEEP_STEPS.indexOf(sleepMin) + 1) % SLEEP_STEPS.length]
        setSleepMin(next)
        showTrackToast(next === 0 ? t('sleepOff') : tf('sleepIn', { m: next }))
    }

    useEffect(() => {
        if (sleepMin <= 0) return
        const timer = setTimeout(() => {
            try { player.pause() } catch { /* player já liberado */ }
            setSleepMin(0)
            showTrackToast(t('sleepDone'))
        }, sleepMin * 60_000)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sleepMin])

    // A barra do topo (e o zap) some após 5s sem toque; um toque no topo traz de volta.
    const [chrome, setChrome] = useState(true)
    useEffect(() => {
        if (!chrome) return
        const timer = setTimeout(() => setChrome(false), 5000)
        return () => clearTimeout(timer)
    }, [chrome])

    const cycleAudio = () => {
        if (audioTracks.length < 2) return
        const index = audioTracks.findIndex(track => track.id === player.audioTrack?.id)
        const next = audioTracks[(index + 1) % audioTracks.length]
        applyAudioTrack(player, next)
        showTrackToast(`🎧 ${next.label || next.language || tf('audioN', { n: (index + 1) % audioTracks.length + 1 })}`)
    }

    const cycleSubtitle = () => {
        if (subtitleTracks.length === 0) return
        const index = subtitleTracks.findIndex(track => track.id === player.subtitleTrack?.id)
        const nextIndex = player.subtitleTrack ? index + 1 : 0
        if (nextIndex >= subtitleTracks.length) {
            applySubtitleTrack(player, null)
            showTrackToast(t('subtitleOff'))
        } else {
            const next = subtitleTracks[nextIndex]
            applySubtitleTrack(player, next)
            showTrackToast(`💬 ${next.label || next.language || tf('subtitleN', { n: nextIndex + 1 })}`)
        }
    }
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


    // Autoplay: fim do episódio → overlay "A seguir" com contagem regressiva.
    // A fila vem da tela da série (episodeQueue); trocar de episódio é um
    // router.replace com os params novos — o effect do `url` recria o player.
    const [upNext, setUpNext] = useState<QueuedEpisode | null>(null)
    const [countdown, setCountdown] = useState(5)

    const playNext = (episode: QueuedEpisode) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            setUpNext(null)
            router.replace({
                pathname: '/player',
                params: {
                    url: client.seriesStreamUrl(episode.sid, episode.container),
                    title: episode.title, pid: episode.pid, kind: 'episode',
                    sid: episode.sid, container: episode.container, cover: episode.cover,
                },
            })
        })()
    }

    useEventListener(player, 'playToEnd', () => {
        if (kind !== 'episode' || !trackable) return
        const next = nextEpisodeAfter(String(pid))
        if (next) { setCountdown(5); setUpNext(next) }
    })

    useEffect(() => {
        if (!upNext) return
        if (countdown <= 0) { playNext(upNext); return }
        const timer = setTimeout(() => setCountdown(current => current - 1), 1000)
        return () => clearTimeout(timer)
         
    }, [upNext, countdown])

    // O autoplay troca os params deste mesmo screen (replace) — segue a URL nova.
    useEffect(() => {
        queueMicrotask(() => setSource(String(url ?? '')))
         
    }, [url])

    // Item baixado → aponta a fonte pro arquivo local.
    useEffect(() => {
        if (!trackable) return
        let cancelled = false
        void getDownload(String(pid))
            .then(download => {
                if (download && !cancelled) setSource(download.fileUri)
            })
            .catch(() => undefined)
        return () => { cancelled = true }
    }, [pid, trackable])

    // Retomar do ponto salvo (re-executa se a fonte virar o arquivo local).
    useEffect(() => {
        if (!trackable) return
        let cancelled = false
        void getEntry(String(pid)).then(entry => {
            const at = resumePosition(entry)
            if (!cancelled && at > 0) player.currentTime = at
        })
        return () => { cancelled = true }
        // player é estável pra um mesmo source — pid/source são o que importa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid, trackable, source])

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
                startsPictureInPictureAutomatically
            />

            {!chrome ? (
                <TouchableOpacity
                    style={[styles.chromeStrip, { height: insets.top + 56 }]}
                    onPress={() => setChrome(true)}
                />
            ) : (
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
                <TouchableOpacity style={styles.trackBtn} onPress={cycleSleep}>
                    <Ionicons
                        name={sleepMin > 0 ? 'moon' : 'moon-outline'}
                        size={20}
                        color={sleepMin > 0 ? colors.accent : colors.text}
                    />
                </TouchableOpacity>
                {audioTracks.length > 1 ? (
                    <TouchableOpacity style={styles.trackBtn} onPress={cycleAudio}>
                        <Ionicons name="headset" size={20} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
                {subtitleTracks.length > 0 ? (
                    <TouchableOpacity style={styles.trackBtn} onPress={cycleSubtitle}>
                        <Ionicons name="chatbox-ellipses" size={20} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
            </View>
            )}

            {trackToast ? (
                <View style={styles.trackToast}>
                    <Text style={styles.trackToastText}>{trackToast}</Text>
                </View>
            ) : null}

            {chrome && zappable ? (
                <View style={styles.zapCol}>
                    <TouchableOpacity style={styles.zapBtn} onPress={() => zap(1)}>
                        <Ionicons name="chevron-up" size={26} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.zapBtn} onPress={() => zap(-1)}>
                        <Ionicons name="chevron-down" size={26} color={colors.text} />
                    </TouchableOpacity>
                </View>
            ) : null}

            {upNext ? (
                <View style={styles.upNext}>
                    <Text style={styles.upNextLabel}>{t('upNextTitle')} {tf('autoplayIn', { s: countdown })}</Text>
                    <Text style={styles.upNextName} numberOfLines={1}>{upNext.title}</Text>
                    <View style={styles.upNextRow}>
                        <TouchableOpacity style={styles.upNextPlay} onPress={() => playNext(upNext)}>
                            <Ionicons name="play" size={16} color="#fff" />
                            <Text style={styles.upNextPlayText}>{t('watchNow')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.upNextCancel} onPress={() => setUpNext(null)}>
                            <Text style={styles.upNextCancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : null}

            {status === 'error' ? (
                <View style={styles.errorBox}>
                    <Ionicons name="warning" size={28} color={colors.danger} />
                    <Text style={styles.errorText}>
                        {t('playError')}{'\n'}
                        {error?.message ?? t('playErrorHint')}
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
    trackBtn: { padding: spacing.sm },
    trackToast: {
        position: 'absolute',
        bottom: 96,
        alignSelf: 'center',
        backgroundColor: 'rgba(22,22,31,0.92)',
        borderRadius: 20,
        paddingHorizontal: spacing.lg,
        paddingVertical: 8,
    },
    trackToastText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    chromeStrip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
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
    upNext: {
        position: 'absolute',
        right: spacing.lg,
        bottom: 96,
        maxWidth: 320,
        gap: spacing.sm,
        backgroundColor: 'rgba(22,22,31,0.95)',
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: spacing.lg,
    },
    upNextLabel: { color: colors.textDim, fontSize: 12, textTransform: 'uppercase' },
    upNextName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    upNextRow: { flexDirection: 'row', gap: spacing.md },
    upNextPlay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.accent,
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
    },
    upNextPlayText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    upNextCancel: { justifyContent: 'center', paddingHorizontal: spacing.md },
    upNextCancelText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
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
