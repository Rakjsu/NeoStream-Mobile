import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native'
import { loadFavorites } from '../services/favorites'
import { hiddenIdSet } from '../services/hidden'
import { allowedCategoryIds, loadParental } from '../services/parental'
import { listRecentChannels, recordRecentChannel } from '../services/recents'
import { cachedFetch, getClient } from '../services/session'
import type { Category, LiveChannel, NowNext } from '../services/xtream'
import { rankChannels, setZapContext } from '../services/zap'
import { EmptyState, Loading } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

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
                const allowed = allowedCategoryIds(liveCats, parental.enabled)
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
            <Stack.Screen options={{ title: t('nowTitle') }} />
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
                        <TouchableOpacity style={styles.row} onPress={() => play(item)}>
                            {item.stream_icon ? (
                                <Image source={{ uri: item.stream_icon }} style={styles.logo} resizeMode="contain" />
                            ) : (
                                <View style={[styles.logo, styles.logoFallback]}>
                                    <Ionicons name="tv-outline" size={16} color={colors.textDim} />
                                </View>
                            )}
                            <View style={styles.info}>
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
                            </View>
                            <Ionicons name="play" size={18} color={colors.accent} />
                        </TouchableOpacity>
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
})
