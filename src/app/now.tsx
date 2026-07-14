import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Stack, router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native'
import { loadFavorites } from '../services/favorites'
import { hiddenIdSet } from '../services/hidden'
import { loadParental } from '../services/parental'
import { guardedCategoryIds } from '../services/kids'
import { listRecentChannels, recordRecentChannel } from '../services/recents'
import { notifyAt } from '../services/notify'
import { addRecurring } from '../services/recurring'
import { addScheduledRec } from '../services/schedRec'
import { cachedFetch, getClient } from '../services/session'
import { hasCatchup } from '../services/xtream'
import type { Category, EpgProgram, LiveChannel, NowNext } from '../services/xtream'
import { rankChannels, setZapContext } from '../services/zap'
import { EmptyState, Loading, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

const VIEWABILITY = { itemVisiblePercentThreshold: 40 }

/** % decorrido do programa atual (0..100). */
function nowPct(nowNext: NowNext | undefined, nowMs: number): number {
    const program = nowNext?.now
    if (!program || program.endMs <= program.startMs) return 0
    return Math.min(100, Math.max(0, Math.round(((nowMs - program.startMs) / (program.endMs - program.startMs)) * 100)))
}

/**
 * "Agora na TV": todos os canais visíveis, favoritos e recentes primeiro,
 * com o programa atual + barra de progresso (EPG buscado por viewability,
 * igual à aba TV — nada de rajada no provedor).
 */
export default function NowOnTv() {
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [epgMap, setEpgMap] = useState<Record<string, NowNext>>({})
    const [schedule, setSchedule] = useState<{ name: string; channelId: string; archive: boolean; programs: EpgProgram[] } | null>(null)
    const epgInFlight = useRef(new Set<string>())

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const [live, liveCats, parental, favorites, recents, hidden] = await Promise.all([
                    cachedFetch('live', () => client.getLiveChannels()),
                    cachedFetch('live-cats', () => client.getLiveCategories()).catch(() => [] as Category[]),
                    loadParental(),
                    loadFavorites(),
                    listRecentChannels(),
                    hiddenIdSet(),
                ])
                const allowed = await guardedCategoryIds(liveCats, parental.enabled)
                const visible = live.filter(channel =>
                    !hidden.has(String(channel.stream_id))
                    && (!allowed || !channel.category_id || allowed.has(channel.category_id)))
                const ranked = rankChannels(
                    visible.map(channel => ({ id: String(channel.stream_id), name: channel.name })),
                    new Set(favorites.live),
                    recents.map(recent => recent.id),
                )
                const byId = new Map(visible.map(channel => [String(channel.stream_id), channel]))
                setChannels(ranked.flatMap(entry => byId.get(entry.id) ?? []))
            })()
        })
    }, [])

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        for (const token of viewableItems) {
            const channel = token.item as LiveChannel | null
            if (!channel?.stream_id) continue
            const id = String(channel.stream_id)
            if (epgInFlight.current.has(id)) continue
            epgInFlight.current.add(id)
            void (async () => {
                const client = await getClient()
                if (!client) return
                const nowNext = await cachedFetch(`epg:${id}`, () => client.getShortEpg(id)).catch(() => null)
                if (nowNext) setEpgMap(prev => ({ ...prev, [id]: nowNext }))
            })()
        }
    }, [])

    /** Toque no EPG: grade do dia do canal (quando a conta suporta). */
    const openSchedule = (channel: LiveChannel) => {
        void (async () => {
            const client = await getClient()
            if (!client?.getDaySchedule) return
            const programs = await client.getDaySchedule(String(channel.stream_id)).catch(() => [] as EpgProgram[])
            setSchedule({
                name: channel.name,
                channelId: String(channel.stream_id),
                archive: hasCatchup(channel) && !!client.catchupUrl,
                programs,
            })
        })()
    }

    /** Replay: programa que já passou num canal com tv_archive → toca o catch-up. */
    const playCatchup = (program: EpgProgram) => {
        if (!schedule) return
        void (async () => {
            const client = await getClient()
            if (!client?.catchupUrl) return
            const durationMin = Math.max(1, Math.round((program.endMs - program.startMs) / 60_000))
            const url = client.catchupUrl(schedule.channelId, program.startMs, durationMin, program.id)
            if (!url) return
            router.push({
                pathname: '/player',
                params: { url, title: `⏪ ${program.title}` },
            })
        })()
    }

    /** Long-press: notificação quando o PRÓXIMO programa do canal começar. */
    const remind = (channel: LiveChannel) => {
        const next = epgMap[String(channel.stream_id)]?.next
        if (!next) return
        const time = new Date(next.startMs)
        const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
        Alert.alert(channel.name, tf('remindMsg', { title: next.title, time: hhmm }), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('remindBtn'),
                onPress: () => {
                    void notifyAt(tf('remindNotif', { title: next.title }), channel.name, '/now', next.startMs)
                        .then(ok => { if (ok) Alert.alert(t('remindSet')) })
                },
            },
        ])
    }

    const play = (channel: LiveChannel) => {
        void (async () => {
            const client = await getClient()
            if (!client || !channels) return
            setZapContext(channels.map(c => ({ id: String(c.stream_id), name: c.name })), String(channel.stream_id))
            void recordRecentChannel({ id: String(channel.stream_id), name: channel.name, logo: channel.stream_icon || '' })
            router.push({
                pathname: '/player',
                params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
            })
        })()
    }

    // Relógio congelado por render (regra react-hooks/purity) — atualiza a
    // cada minuto pra barra de progresso andar.
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])

    if (channels === null) return <Loading label={t('loadingChannels')} />

    return (
        <View style={styles.root}>
            <Stack.Screen
                options={{
                    title: t('nowTitle'),
                    headerRight: () => (
                        <TouchableOpacity accessibilityLabel={t('guideTitle')} onPress={() => router.push('/guide')}>
                            <Ionicons name="grid-outline" size={20} color={colors.text} />
                        </TouchableOpacity>
                    ),
                }}
            />
            {schedule ? (
                <View style={styles.scheduleOverlay}>
                    <View style={styles.scheduleBox}>
                        <View style={styles.scheduleHeader}>
                            <Text style={styles.scheduleTitle} numberOfLines={1}>{schedule.name}</Text>
                            <TouchableOpacity accessibilityLabel={t('cancel')} onPress={() => setSchedule(null)}>
                                <Ionicons name="close" size={22} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={schedule.programs}
                            keyExtractor={program => String(program.startMs)}
                            ListEmptyComponent={<Text style={styles.scheduleEmpty}>{t('scheduleEmpty')}</Text>}
                            renderItem={({ item: program }) => {
                                const live = program.startMs <= nowMs && nowMs < program.endMs
                                const replayable = schedule.archive && program.endMs <= nowMs
                                const hh = (ms: number) => {
                                    const date = new Date(ms)
                                    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                                }
                                return (
                                    <TouchableOpacity
                                        style={styles.scheduleRow}
                                        accessibilityLabel={replayable ? t('catchupPlay') : undefined}
                                        onPress={replayable ? () => playCatchup(program) : undefined}
                                        onLongPress={() => {
                                            Alert.alert(schedule.name, program.title, [
                                                { text: t('cancel'), style: 'cancel' },
                                                {
                                                    text: t('remindBtn'),
                                                    onPress: () => {
                                                        void notifyAt(tf('remindNotif', { title: program.title }), schedule.name, '/now', program.startMs)
                                                            .then(ok => { if (ok) Alert.alert(t('remindSet')) })
                                                    },
                                                },
                                                {
                                                    text: t('recScheduleBtn'),
                                                    onPress: () => {
                                                        void addScheduledRec({
                                                            channelId: schedule.channelId,
                                                            channelName: schedule.name,
                                                            title: program.title,
                                                            startMs: program.startMs,
                                                            endMs: program.endMs,
                                                        }, t('recNotifTitle')).then(() => Alert.alert(t('recScheduledMsg')))
                                                    },
                                                },
                                                {
                                                    text: t('remindAlwaysBtn'),
                                                    onPress: () => {
                                                        void addRecurring({
                                                            title: program.title,
                                                            channelId: schedule.channelId,
                                                            channelName: schedule.name,
                                                        }).then(() => Alert.alert(t('recurringSet')))
                                                    },
                                                },
                                            ])
                                        }}
                                        delayLongPress={350}
                                    >
                                        <Text style={[styles.scheduleTime, live && styles.scheduleLive]}>{hh(program.startMs)}</Text>
                                        <Text style={[styles.scheduleName, live && styles.scheduleLive]} numberOfLines={1}>
                                            {program.title}
                                        </Text>
                                        {live ? <Ionicons name="radio-outline" size={14} color={colors.accent} /> : null}
                                        {replayable ? <Ionicons name="play-back-circle-outline" size={16} color={colors.accent} /> : null}
                                    </TouchableOpacity>
                                )
                            }}
                        />
                    </View>
                </View>
            ) : null}
            <FlatList
                data={channels}
                keyExtractor={item => String(item.stream_id)}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VIEWABILITY}
                ListEmptyComponent={<EmptyState icon="tv-outline" label={t('nowEmpty')} />}
                contentContainerStyle={channels.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => {
                    const id = String(item.stream_id)
                    const nowNext = epgMap[id]
                    const pct = nowPct(nowNext, nowMs)
                    return (
                        <TvTouchable
                            style={styles.row}
                            onPress={() => play(item)}
                            onLongPress={() => remind(item)}
                            delayLongPress={350}
                        >
                            {item.stream_icon ? (
                                <Image source={{ uri: item.stream_icon }} style={styles.logo} contentFit="contain" transition={120} />
                            ) : (
                                <View style={[styles.logo, styles.logoFallback]}>
                                    <Ionicons name="tv-outline" size={16} color={colors.textDim} />
                                </View>
                            )}
                            <TouchableOpacity style={styles.info} onPress={() => openSchedule(item)}>
                                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.program} numberOfLines={1}>
                                    {nowNext?.now?.title ?? '—'}
                                </Text>
                                {pct > 0 ? (
                                    <View style={styles.track}>
                                        <View style={[styles.fill, { width: `${pct}%` }]} />
                                    </View>
                                ) : null}
                                {nowNext?.next ? (
                                    <Text style={styles.next} numberOfLines={1}>▸ {nowNext.next.title}</Text>
                                ) : null}
                            </TouchableOpacity>
                            <Ionicons name="play" size={18} color={colors.accent} />
                        </TvTouchable>
                    )
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    logo: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.card },
    logoFallback: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, gap: 3 },
    name: { color: colors.text, fontSize: 14, fontWeight: '600' },
    program: { color: colors.textDim, fontSize: 13 },
    track: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
    fill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    next: { color: colors.textDim, fontSize: 11 },
    scheduleOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    scheduleBox: {
        maxHeight: '75%',
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: spacing.md,
    },
    scheduleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: spacing.sm,
        gap: spacing.md,
    },
    scheduleTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
    scheduleEmpty: { color: colors.textDim, fontSize: 13, padding: spacing.md },
    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 8,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
    },
    scheduleTime: { color: colors.textDim, fontSize: 13, width: 44 },
    scheduleName: { flex: 1, color: colors.text, fontSize: 14 },
    scheduleLive: { color: colors.accent, fontWeight: '700' },
})
