import { Ionicons } from '@expo/vector-icons'
import { useEvent, useEventListener } from 'expo'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView, type AudioTrack, type SubtitleTrack } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import { FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as NavigationBar from 'expo-navigation-bar'
import { getDownload } from '../services/downloads'
import { castAvailable, castToCurrentSession, onCastSessionStarted, showCastPicker, type CastControls } from '../services/cast'
import { nextEpisodeAfter, type QueuedEpisode } from '../services/episodeQueue'
import { getEntry, resumePosition, saveSample, type ProgressKind } from '../services/progress'
import { listRecentChannels, recordRecentChannel } from '../services/recents'
import { loadFavorites } from '../services/favorites'
import { cachedFetch, getClient, resolvePlayableUrl } from '../services/session'
import { tapLight } from '../services/haptics'
import { alternateLiveUrl } from '../services/xtream'
import { recordWatchMinute } from '../services/usage'
import { hasZapContext, rankChannels, zapBy, zapList, zapTo, type ZapChannel } from '../services/zap'
import { TvTouchable } from '../ui/components'
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
function applyPlaybackRate(target: { playbackRate: number }, rate: number) {
    target.playbackRate = rate
}
function applyBackgroundMode(
    target: { staysActiveInBackground: boolean; showNowPlayingNotification: boolean },
    enabled: boolean,
) {
    target.staysActiveInBackground = enabled
    target.showNowPlayingNotification = enabled
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
    // URL adiada (stalker://) começa vazia — o effect resolve e preenche.
    const initialUrl = String(url ?? '')
    const [source, setSource] = useState(initialUrl.startsWith('stalker://') ? '' : initialUrl)
    const player = useVideoPlayer(source, p => {
        p.play()
    })
    const { status, error } = useEvent(player, 'statusChange', {
        status: player.status,
        error: undefined,
    })

    const trackable = live !== '1' && !!pid && !!sid

    // Resgate ao vivo: erro num canal Xtream → tenta .ts↔.m3u8 UMA vez.
    const rescueTriedRef = useRef(false)
    useEffect(() => {
        if (status !== 'error' || live !== '1' || rescueTriedRef.current) return
        const alternate = alternateLiveUrl(source)
        if (!alternate) return
        rescueTriedRef.current = true
        queueMicrotask(() => setSource(alternate))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

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

    // Tela cheia de verdade: barra de navegação some enquanto o player vive.
    useEffect(() => {
        if (Platform.OS !== 'android') return
        void NavigationBar.setVisibilityAsync('hidden').catch(() => undefined)
        return () => {
            void NavigationBar.setVisibilityAsync('visible').catch(() => undefined)
        }
    }, [])

    // 🎵 Áudio em segundo plano: o vídeo segue tocando com o app minimizado,
    // com notificação de mídia do sistema (play/pause na barra do Android).
    const [bgAudio, setBgAudio] = useState(false)
    const toggleBgAudio = () => {
        const next = !bgAudio
        setBgAudio(next)
        try { applyBackgroundMode(player, next) } catch { /* player já liberado */ }
        showTrackToast(next ? t('bgAudioOn') : t('bgAudioOff'))
    }

    // 🛑 "Só mais esse": no fim do episódio atual, pausa em vez de emendar.
    const [stopAfter, setStopAfter] = useState(false)
    const stopAfterRef = useRef(false)
    const toggleStopAfter = () => {
        const next = !stopAfter
        setStopAfter(next)
        stopAfterRef.current = next
        showTrackToast(next ? t('stopAfterOn') : t('stopAfterOff'))
    }

    // Velocidade de reprodução (VOD): 1x → 1.25x → 1.5x → 2x.
    const RATES = [1, 1.25, 1.5, 2]
    const [rate, setRate] = useState(1)
    const cycleRate = () => {
        const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
        setRate(next)
        try { applyPlaybackRate(player, next) } catch { /* player já liberado */ }
        showTrackToast(`⏩ ${next}x`)
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

    const switchChannel = (channel: ZapChannel) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            await player.replaceAsync(client.liveStreamUrl(channel.id))
            player.play()
            setLiveTitle(channel.name)
            setLiveEpg('')
            void recordRecentChannel({ id: channel.id, name: channel.name, logo: '' })
            showEpg(channel.id)
        })()
    }

    const zap = (delta: number) => {
        const channel = zapBy(delta)
        if (channel) {
            tapLight()
            switchChannel(channel)
        }
    }

    // Gaveta de canais: lista do contexto de zap com filtro; toque troca direto.
    // Favoritos e recentes sobem pro topo (carregados ao abrir a gaveta).
    const [channelsOpen, setChannelsOpen] = useState(false)
    const [channelFilter, setChannelFilter] = useState('')
    const [drawerFavs, setDrawerFavs] = useState<Set<string>>(new Set())
    const [drawerRecents, setDrawerRecents] = useState<string[]>([])

    const openDrawer = () => {
        setChannelFilter('')
        setChannelsOpen(true)
        void loadFavorites().then(favorites => setDrawerFavs(new Set(favorites.live)))
        void listRecentChannels().then(recents => setDrawerRecents(recents.map(channel => channel.id)))
    }

    const drawerChannels = channelsOpen
        ? rankChannels(
            zapList().filter(channel => channel.name.toLowerCase().includes(channelFilter.trim().toLowerCase())),
            drawerFavs,
            drawerRecents,
        )
        : []


    // Chromecast: 📺 abre o seletor; conectou → manda a mídia atual (retomando
    // do ponto em que o usuário estava) e pausa o local — a TV assume. O
    // progresso do receiver volta pro "continuar assistindo" a cada ~5s.
    const canCast = castAvailable()
    const [casting, setCasting] = useState<CastControls | null>(null)
    // Episódio que a TV está tocando quando a fila avança (os params da rota
    // ficam no episódio original; os efeitos usam castEp ?? params).
    const [castEp, setCastEp] = useState<QueuedEpisode | null>(null)
    const [castPaused, setCastPaused] = useState(false)
    const castingRef = useRef(false)
    const lastCastSaveRef = useRef(0)

    useEffect(() => {
        if (!canCast) return
        return onCastSessionStarted(() => {
            let startAt = 0
            try { startAt = player.currentTime || 0 } catch { /* player já liberado */ }
            void castToCurrentSession(
                source,
                live === '1' ? liveTitle : String(title ?? ''),
                String(cover ?? ''),
                live === '1',
                startAt,
            ).then(controls => {
                if (!controls) return
                castingRef.current = true
                setCasting(controls)
                setCastPaused(false)
                try { player.pause() } catch { /* player já liberado */ }
                showTrackToast('📺 Chromecast')
            })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCast, source, liveTitle])

    useEffect(() => {
        if (!casting || !trackable) return
        return casting.onProgress(positionSec => {
            const now = Date.now()
            if (now - lastCastSaveRef.current < 5000) return
            lastCastSaveRef.current = now
            lastSample.current = { position: positionSec, duration: lastSample.current.duration }
            void saveSample({
                id: castEp?.pid ?? String(pid),
                kind: (kind === 'episode' ? 'episode' : 'movie') as ProgressKind,
                streamId: castEp?.sid ?? String(sid),
                container: castEp?.container ?? String(container || 'mp4'),
                title: castEp?.title ?? String(title ?? ''),
                cover: castEp?.cover ?? String(cover ?? ''),
                position: positionSec,
                duration: castEp ? 0 : lastSample.current.duration,
                updatedAt: now,
            })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [casting, trackable, castEp])

    // Fila na TV: episódio acabou no receiver → emenda o próximo da série.
    const lastAdvanceRef = useRef(0)
    useEffect(() => {
        if (!casting || kind !== 'episode') return
        return casting.onEnded(() => {
            const now = Date.now()
            if (now - lastAdvanceRef.current < 3000) return // status duplicado
            lastAdvanceRef.current = now
            if (stopAfterRef.current) {
                stopAfterRef.current = false
                setStopAfter(false)
                return
            }
            const next = nextEpisodeAfter(castEp?.pid ?? String(pid))
            if (!next) return
            void (async () => {
                const client = await getClient()
                if (!client) return
                const controls = await castToCurrentSession(
                    await resolvePlayableUrl(client.seriesStreamUrl(next.sid, next.container)),
                    next.title,
                    next.cover,
                    false,
                )
                if (!controls) return
                lastCastSaveRef.current = 0
                setCasting(controls)
                setCastEp(next)
                setCastPaused(false)
                showTrackToast(`📺 ${next.title}`)
            })()
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [casting, castEp])

    const stopCasting = () => {
        casting?.stop()
        castingRef.current = false
        setCasting(null)
        setCastEp(null)
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
        if (stopAfterRef.current) {
            stopAfterRef.current = false
            setStopAfter(false)
            return // pediu pra parar aqui — sem próximo episódio
        }
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
        queueMicrotask(() => {
            const raw = String(url ?? '')
            void resolvePlayableUrl(raw)
                .then(resolved => setSource(resolved || raw))
                .catch(() => setSource(raw))
        })
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

    // Tempo assistido: 1 minuto contabilizado por minuto tocando (local ou TV).
    useEffect(() => {
        const usageKind = live === '1' ? 'live' : kind === 'episode' ? 'episode' : 'movie'
        // Episódio agrega pela série ("Série · Ep 3" → "Série").
        const usageTitle = live === '1'
            ? liveTitle
            : kind === 'episode' ? String(title ?? '').split(' · ')[0] : String(title ?? '')
        const timer = setInterval(() => {
            let playing = castingRef.current && !castPaused
            if (!playing) {
                try { playing = player.playing } catch { return } // player já liberado
            }
            if (playing) void recordWatchMinute(usageKind, Date.now(), usageTitle)
        }, 60_000)
        return () => clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live, kind, castPaused, liveTitle])

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
            if (castingRef.current) return // a TV é a fonte do progresso agora
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
            <StatusBar hidden />
            <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls
                allowsPictureInPicture
                startsPictureInPictureAutomatically
            />

            {!chrome ? (
                <TvTouchable
                    style={[styles.chromeStrip, { height: insets.top + 56 }]}
                    accessibilityLabel={t('a11yShowBar')}
                    onPress={() => setChrome(true)}
                />
            ) : (
            <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
                <TvTouchable style={styles.back} accessibilityLabel={t('a11yBack')} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TvTouchable>
                <View style={styles.titleBlock}>
                    <Text style={styles.title} numberOfLines={1}>
                        {live === '1' ? `🔴 ${liveTitle}` : title ?? ''}
                    </Text>
                    {live === '1' && liveEpg ? (
                        <Text style={styles.epg} numberOfLines={1}>{liveEpg}</Text>
                    ) : null}
                </View>
                {canCast ? (
                    <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11yCast')} onPress={() => void showCastPicker()}>
                        <Ionicons name="tv-outline" size={20} color={colors.text} />
                    </TvTouchable>
                ) : null}
                <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11yBgAudio')} onPress={toggleBgAudio}>
                    <Ionicons
                        name={bgAudio ? 'musical-notes' : 'musical-notes-outline'}
                        size={20}
                        color={bgAudio ? colors.accent : colors.text}
                    />
                </TvTouchable>
                {kind === 'episode' ? (
                    <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11yStopAfter')} onPress={toggleStopAfter}>
                        <Ionicons
                            name={stopAfter ? 'pause-circle' : 'pause-circle-outline'}
                            size={20}
                            color={stopAfter ? colors.accent : colors.text}
                        />
                    </TvTouchable>
                ) : null}
                {live !== '1' ? (
                    <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11yRate')} onPress={cycleRate}>
                        <Text style={styles.rateText}>{rate}x</Text>
                    </TvTouchable>
                ) : null}
                <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11ySleep')} onPress={cycleSleep}>
                    <Ionicons
                        name={sleepMin > 0 ? 'moon' : 'moon-outline'}
                        size={20}
                        color={sleepMin > 0 ? colors.accent : colors.text}
                    />
                </TvTouchable>
                {audioTracks.length > 1 ? (
                    <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11yAudio')} onPress={cycleAudio}>
                        <Ionicons name="headset" size={20} color={colors.text} />
                    </TvTouchable>
                ) : null}
                {subtitleTracks.length > 0 ? (
                    <TvTouchable style={styles.trackBtn} accessibilityLabel={t('a11ySubtitle')} onPress={cycleSubtitle}>
                        <Ionicons name="chatbox-ellipses" size={20} color={colors.text} />
                    </TvTouchable>
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
                    <TvTouchable
                        style={styles.zapBtn}
                        accessibilityLabel={t('a11yChannels')}
                        onPress={openDrawer}
                    >
                        <Ionicons name="list" size={24} color={colors.text} />
                    </TvTouchable>
                    <TvTouchable style={styles.zapBtn} accessibilityLabel={t('a11yZapNext')} onPress={() => zap(1)}>
                        <Ionicons name="chevron-up" size={26} color={colors.text} />
                    </TvTouchable>
                    <TvTouchable style={styles.zapBtn} accessibilityLabel={t('a11yZapPrev')} onPress={() => zap(-1)}>
                        <Ionicons name="chevron-down" size={26} color={colors.text} />
                    </TvTouchable>
                </View>
            ) : null}

            {channelsOpen ? (
                <View style={styles.drawer}>
                    <View style={styles.drawerHeader}>
                        <TextInput
                            style={styles.drawerFilter}
                            value={channelFilter}
                            onChangeText={setChannelFilter}
                            placeholder={t('chFilterPh')}
                            placeholderTextColor={colors.textDim}
                            autoCorrect={false}
                        />
                        <TvTouchable
                            style={styles.drawerClose}
                            accessibilityLabel={t('cancel')}
                            onPress={() => setChannelsOpen(false)}
                        >
                            <Ionicons name="close" size={22} color={colors.text} />
                        </TvTouchable>
                    </View>
                    <FlatList
                        data={drawerChannels}
                        keyExtractor={channel => channel.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <TvTouchable
                                style={styles.drawerRow}
                                onPress={() => {
                                    const channel = zapTo(item.id)
                                    if (channel) switchChannel(channel)
                                    setChannelsOpen(false)
                                }}
                            >
                                <Text
                                    style={[styles.drawerName, item.name === liveTitle && styles.drawerNameOn]}
                                    numberOfLines={1}
                                >
                                    {item.name}
                                </Text>
                                {item.name === liveTitle ? (
                                    <Ionicons name="play" size={14} color={colors.accent} />
                                ) : null}
                            </TvTouchable>
                        )}
                    />
                </View>
            ) : null}

            {casting ? (
                <View style={styles.castBar}>
                    <Ionicons name="tv" size={18} color={colors.accent} />
                    <Text style={styles.castText}>{t('castingOnTv')}</Text>
                    <TvTouchable
                        style={styles.castBtn}
                        accessibilityLabel={castPaused ? t('a11yPlay') : t('a11yPause')}
                        onPress={() => {
                            if (castPaused) casting.play()
                            else casting.pause()
                            setCastPaused(!castPaused)
                        }}
                    >
                        <Ionicons name={castPaused ? 'play' : 'pause'} size={18} color={colors.text} />
                    </TvTouchable>
                    <TvTouchable style={styles.castBtn} onPress={stopCasting}>
                        <Text style={styles.castStopText}>{t('stopCast')}</Text>
                    </TvTouchable>
                </View>
            ) : null}

            {upNext ? (
                <View style={styles.upNext}>
                    <Text style={styles.upNextLabel}>{t('upNextTitle')} {tf('autoplayIn', { s: countdown })}</Text>
                    <Text style={styles.upNextName} numberOfLines={1}>{upNext.title}</Text>
                    <View style={styles.upNextRow}>
                        <TvTouchable style={styles.upNextPlay} onPress={() => playNext(upNext)}>
                            <Ionicons name="play" size={16} color="#fff" />
                            <Text style={styles.upNextPlayText}>{t('watchNow')}</Text>
                        </TvTouchable>
                        <TvTouchable style={styles.upNextCancel} onPress={() => setUpNext(null)}>
                            <Text style={styles.upNextCancelText}>{t('cancel')}</Text>
                        </TvTouchable>
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
    rateText: { color: colors.text, fontSize: 13, fontWeight: '700', minWidth: 30, textAlign: 'center' },
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
    drawer: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        maxWidth: '80%',
        backgroundColor: 'rgba(11,11,16,0.97)',
        borderLeftColor: colors.border,
        borderLeftWidth: 1,
        paddingTop: 48,
    },
    drawerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
    },
    drawerFilter: {
        flex: 1,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        fontSize: 14,
    },
    drawerClose: { padding: spacing.xs },
    drawerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    drawerName: { flex: 1, color: colors.text, fontSize: 14 },
    drawerNameOn: { color: colors.accent, fontWeight: '700' },
    castBar: {
        position: 'absolute',
        bottom: 32,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: 'rgba(22,22,31,0.95)',
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 24,
        paddingHorizontal: spacing.lg,
        paddingVertical: 8,
    },
    castText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    castBtn: { padding: spacing.xs },
    castStopText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
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
