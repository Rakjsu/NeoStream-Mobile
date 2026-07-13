import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, ScrollView, StyleSheet, Text, View, type ViewToken } from 'react-native'
import { loadFavorites } from '../services/favorites'
import { hiddenIdSet } from '../services/hidden'
import { loadParental } from '../services/parental'
import { guardedCategoryIds } from '../services/kids'
import { listRecentChannels, recordRecentChannel } from '../services/recents'
import { notifyAt } from '../services/notify'
import { enqueueDownloads } from '../services/downloads'
import { cachedFetch, getClient, resolvePlayableUrl } from '../services/session'
import { hasCatchup } from '../services/xtream'
import type { Category, EpgProgram, LiveChannel } from '../services/xtream'
import { rankChannels, setZapContext } from '../services/zap'
import { EmptyState, Loading, SearchBar, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

const PX_PER_MIN = 4
const NAME_W = 112
const ROW_H = 52
const PAST_H = 2 // horas de passado visíveis (replay)
const FUTURE_H = 22 // horas de futuro visíveis
const TIMELINE_W = (PAST_H + FUTURE_H) * 60 * PX_PER_MIN
const VIEWABILITY = { itemVisiblePercentThreshold: 30 }

/** Meia hora cheia anterior a `nowMs` menos as horas de passado da janela. */
export function guideBaseMs(nowMs: number): number {
    const halfHour = 30 * 60_000
    return Math.floor((nowMs - PAST_H * 3600_000) / halfHour) * halfHour
}

/** Posição/largura do bloco na régua (clipado na janela). */
function blockRect(program: EpgProgram, baseMs: number): { left: number; width: number } | null {
    const endX = ((program.endMs - baseMs) / 60_000) * PX_PER_MIN
    if (endX <= 0) return null
    const left = Math.max(0, ((program.startMs - baseMs) / 60_000) * PX_PER_MIN)
    if (left >= TIMELINE_W) return null
    const width = Math.min(endX, TIMELINE_W) - left
    if (width < 8) return null
    return { left, width }
}

/**
 * Grade EPG visual (canais × tempo, estilo TV a cabo): linha vermelha marca o
 * "agora", programação buscada por canal visível (viewability — nada de rajada
 * no provedor). Toque: ao vivo toca o canal, passado com tv_archive faz replay,
 * futuro agenda lembrete.
 */
export default function Guide() {
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [query, setQuery] = useState('')
    const [favOnly, setFavOnly] = useState(false)
    const [favSet, setFavSet] = useState<Set<string>>(new Set())
    const [scheduleMap, setScheduleMap] = useState<Record<string, EpgProgram[]>>({})
    const inFlight = useRef(new Set<string>())
    const scrollRef = useRef<ScrollView | null>(null)
    const scrolledRef = useRef(false)

    // Relógio congelado por render (regra react-hooks/purity).
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])
    const baseMs = guideBaseMs(nowMs)
    const nowX = ((nowMs - baseMs) / 60_000) * PX_PER_MIN

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
                setFavSet(new Set(favorites.live))
            })()
        })
    }, [])

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        for (const token of viewableItems) {
            const channel = token.item as LiveChannel | null
            if (!channel?.stream_id) continue
            const id = String(channel.stream_id)
            if (inFlight.current.has(id)) continue
            inFlight.current.add(id)
            void (async () => {
                const client = await getClient()
                if (!client?.getDaySchedule) return
                const programs = await cachedFetch(`day:${id}`, async () => await client.getDaySchedule?.(id) ?? [])
                    .catch(() => [] as EpgProgram[])
                setScheduleMap(prev => ({ ...prev, [id]: programs }))
            })()
        }
    }, [])

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

    const playCatchup = (channel: LiveChannel, program: EpgProgram) => {
        void (async () => {
            const client = await getClient()
            if (!client?.catchupUrl) return
            const durationMin = Math.max(1, Math.round((program.endMs - program.startMs) / 60_000))
            const url = client.catchupUrl(String(channel.stream_id), program.startMs, durationMin, program.id)
            if (!url) return
            router.push({
                pathname: '/player',
                params: { url, title: `⏪ ${program.title}` },
            })
        })()
    }

    // ⏪ Programa que já passou: assistir agora ou BAIXAR (vira item nas Gravações).
    const offerCatchup = (channel: LiveChannel, program: EpgProgram) => {
        void (async () => {
            const client = await getClient()
            if (!client?.catchupUrl) return
            const durationMin = Math.max(1, Math.round((program.endMs - program.startMs) / 60_000))
            const raw = client.catchupUrl(String(channel.stream_id), program.startMs, durationMin, program.id)
            if (!raw) return
            Alert.alert(`⏪ ${program.title}`, channel.name, [
                { text: t('cancel'), style: 'cancel' },
                // HLS não vira arquivo único — o download só aparece pra stream direto.
                ...(raw.includes('.m3u8') ? [] : [{
                    text: t('catchupDlBtn'),
                    onPress: () => {
                        void (async () => {
                            await enqueueDownloads([{
                                id: `rec:catchup:${channel.stream_id}:${program.startMs}`,
                                url: await resolvePlayableUrl(raw),
                                title: `⏪ ${program.title}`,
                                cover: channel.stream_icon || '',
                                container: 'ts',
                            }])
                            Alert.alert(t('catchupDlQueued'))
                        })()
                    },
                }]),
                { text: t('catchupPlayBtn'), onPress: () => playCatchup(channel, program) },
            ])
        })()
    }

    const remind = (channel: LiveChannel, program: EpgProgram) => {
        void notifyAt(tf('remindNotif', { title: program.title }), channel.name, '/guide', program.startMs)
            .then(ok => { if (ok) Alert.alert(t('remindSet')) })
    }

    const pressProgram = (channel: LiveChannel, program: EpgProgram) => {
        if (program.startMs <= nowMs && nowMs < program.endMs) { play(channel); return }
        if (program.endMs <= nowMs) {
            if (hasCatchup(channel)) offerCatchup(channel, program)
            return
        }
        remind(channel, program)
    }

    /** Salta a régua pra um horário (clampado na janela do guia). */
    const jumpTo = (targetMs: number) => {
        const x = ((targetMs - baseMs) / 60_000) * PX_PER_MIN
        scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(x - 60, TIMELINE_W - 200)), animated: true })
    }

    // Alvos de salto: agora + horários cheios dentro da janela de 24h.
    const jumps: { label: string; ms: number }[] = [{ label: t('guideJumpNow'), ms: nowMs }]
    for (const hour of [20, 8, 12]) {
        const target = new Date(nowMs)
        target.setHours(hour, 0, 0, 0)
        let ms = target.getTime()
        if (ms <= nowMs) ms += 86_400_000
        if (ms < baseMs + (PAST_H + FUTURE_H) * 3600_000) {
            jumps.push({ label: `${String(hour).padStart(2, '0')}:00`, ms })
        }
    }
    jumps.sort((a, b) => a.ms - b.ms)

    // Régua de horas: uma marca a cada hora cheia da janela.
    const hourMarks: { x: number; label: string }[] = []
    for (let ms = Math.ceil(baseMs / 3600_000) * 3600_000; ms < baseMs + (PAST_H + FUTURE_H) * 3600_000; ms += 3600_000) {
        const date = new Date(ms)
        hourMarks.push({
            x: ((ms - baseMs) / 60_000) * PX_PER_MIN,
            label: `${String(date.getHours()).padStart(2, '0')}:00`,
        })
    }

    const visibleChannels = channels?.filter(channel =>
        (!favOnly || favSet.has(String(channel.stream_id)))
        && (!query.trim() || channel.name.toLowerCase().includes(query.trim().toLowerCase()))) ?? null

    if (channels === null || visibleChannels === null) return <Loading label={t('loadingChannels')} />

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('guideTitle') }} />
            <View style={styles.filterRow}>
                <View style={{ flex: 1 }}>
                    <SearchBar value={query} onChange={setQuery} placeholder={t('searchChannel')} />
                </View>
                <TvTouchable
                    style={[styles.favChip, favOnly && styles.favChipOn]}
                    accessibilityLabel={t('guideOnlyFavs')}
                    onPress={() => setFavOnly(current => !current)}
                >
                    <Ionicons name={favOnly ? 'heart' : 'heart-outline'} size={16} color={favOnly ? '#fff' : colors.danger} />
                </TvTouchable>
                {jumps.map(jump => (
                    <TvTouchable key={jump.label} style={styles.jumpChip} onPress={() => jumpTo(jump.ms)}>
                        <Text style={styles.jumpText}>{jump.label}</Text>
                    </TvTouchable>
                ))}
            </View>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator
                onContentSizeChange={() => {
                    if (scrolledRef.current) return
                    scrolledRef.current = true
                    scrollRef.current?.scrollTo({ x: Math.max(0, nowX - 80), animated: false })
                }}
            >
                <View style={{ width: NAME_W + TIMELINE_W }}>
                    <View style={styles.ruler}>
                        {hourMarks.map(mark => (
                            <Text key={mark.label + mark.x} style={[styles.rulerText, { left: NAME_W + mark.x }]}>
                                {mark.label}
                            </Text>
                        ))}
                    </View>
                    <View pointerEvents="none" style={[styles.nowLine, { left: NAME_W + nowX }]} />
                    <FlatList
                        data={visibleChannels}
                        keyExtractor={item => String(item.stream_id)}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={VIEWABILITY}
                        ListEmptyComponent={<EmptyState icon="tv-outline" label={t('nowEmpty')} />}
                        contentContainerStyle={visibleChannels.length === 0 ? { flexGrow: 1 } : undefined}
                        renderItem={({ item, index }) => {
                            const programs = scheduleMap[String(item.stream_id)]
                            return (
                                <View style={styles.row}>
                                    <TvTouchable style={styles.nameCell} hasTVPreferredFocus={index === 0} onPress={() => play(item)}>
                                        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                                    </TvTouchable>
                                    <View style={styles.timeline}>
                                        {programs === undefined ? (
                                            <Text style={styles.loadingCell}>…</Text>
                                        ) : programs.flatMap(program => {
                                            const rect = blockRect(program, baseMs)
                                            if (!rect) return []
                                            const live = program.startMs <= nowMs && nowMs < program.endMs
                                            const past = program.endMs <= nowMs
                                            return [(
                                                <TvTouchable
                                                    key={String(program.startMs)}
                                                    style={[styles.block, { left: rect.left, width: rect.width },
                                                        live && styles.blockLive, past && styles.blockPast]}
                                                    onPress={() => pressProgram(item, program)}
                                                >
                                                    <Text style={[styles.blockText, live && styles.blockTextLive]} numberOfLines={1}>
                                                        {past && hasCatchup(item) ? '⏪ ' : ''}{program.title}
                                                    </Text>
                                                </TvTouchable>
                                            )]
                                        })}
                                    </View>
                                </View>
                            )
                        }}
                    />
                </View>
            </ScrollView>
            <View style={styles.hintBar}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textDim} />
                <Text style={styles.hint} numberOfLines={1}>{t('guideHint')}</Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    ruler: { height: 22 },
    filterRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, gap: spacing.sm },
    favChip: {
        width: 40,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.danger,
    },
    favChipOn: { backgroundColor: colors.danger },
    jumpChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
    },
    jumpText: { color: colors.text, fontSize: 12, fontWeight: '600' },
    rulerText: { position: 'absolute', top: 4, color: colors.textDim, fontSize: 11 },
    nowLine: {
        position: 'absolute',
        top: 22,
        bottom: 0,
        width: 2,
        backgroundColor: colors.danger,
        zIndex: 5,
    },
    row: {
        flexDirection: 'row',
        height: ROW_H,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    nameCell: {
        width: NAME_W,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        borderRightColor: colors.border,
        borderRightWidth: 1,
        backgroundColor: colors.card,
    },
    name: { color: colors.text, fontSize: 12, fontWeight: '600' },
    timeline: { width: TIMELINE_W },
    loadingCell: { color: colors.textDim, fontSize: 12, padding: spacing.md },
    block: {
        position: 'absolute',
        top: 4,
        height: ROW_H - 9,
        justifyContent: 'center',
        paddingHorizontal: 6,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 6,
    },
    blockLive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    blockPast: { opacity: 0.65 },
    blockText: { color: colors.text, fontSize: 11 },
    blockTextLive: { fontWeight: '700' },
    hintBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    hint: { flex: 1, color: colors.textDim, fontSize: 11 },
})
