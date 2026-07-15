import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native'
import { emptyFavorites, isFavorite, persistMove, persistToggle, loadFavorites, type Favorites } from '../../services/favorites'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { hiddenIdSet, hideChannel } from '../../services/hidden'
import { groupChannelVariants } from '../../services/channelVariants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { recordRecentChannel } from '../../services/recents'
import { cachedFetch, getClient } from '../../services/session'
import { hasCatchup } from '../../services/xtream'
import type { Category, EpgProgram, LiveChannel, NowNext } from '../../services/xtream'
import { setZapContext } from '../../services/zap'
import { CategoryChips, EmptyState, Loading, SearchBar, TvTouchable } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'
import { t } from '../../i18n/strings'
import { tvSize } from '../../ui/tv'

const VIEWABILITY = { itemVisiblePercentThreshold: 30 }

export default function LiveTab() {
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [allowed, setAllowed] = useState<Set<string> | null>(null)
    const [hidden, setHidden] = useState<Set<string>>(new Set())
    // EPG por canal, buscado quando a linha entra na tela (nunca em massa).
    const [epgMap, setEpgMap] = useState<Record<string, NowNext>>({})
    const epgInFlight = useRef(new Set<string>())
    // Mini-guia inline: um canal expandido por vez, grade via cache SWR.
    const [expandedId, setExpandedId] = useState<string | null>(null)
    // FHD/HD/SD do mesmo canal viram UM card (desligável nos Ajustes).
    const [groupVariants, setGroupVariants] = useState(true)
    useEffect(() => {
        void AsyncStorage.getItem('neostream_group_variants')
            .then(raw => setGroupVariants(raw !== 'off'))
            .catch(() => undefined)
    }, [])
    const [daySchedules, setDaySchedules] = useState<Record<string, EpgProgram[]>>({})

    const toggleExpand = (id: string) => {
        if (expandedId === id) { setExpandedId(null); return }
        setExpandedId(id)
        void (async () => {
            const client = await getClient()
            if (!client?.getDaySchedule) return
            const programs = await cachedFetch(`day:${id}`, async () => await client.getDaySchedule?.(id) ?? [])
                .catch(() => [] as EpgProgram[])
            setDaySchedules(prev => ({ ...prev, [id]: programs }))
        })()
    }

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [list, cats, favs, parental, hiddenIds] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels(), force),
                cachedFetch('live-cats', () => client.getLiveCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
                loadParental(),
                hiddenIdSet(),
            ])
            setHidden(hiddenIds)
            setChannels(list)
            setCategories(cats)
            setFavorites(favs)
            setAllowed(await guardedCategoryIds(cats, parental.enabled))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failChannels'))
            setChannels([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    const { list: filtered, variantsOf } = useMemo(() => {
        if (!channels) return { list: [] as LiveChannel[], variantsOf: new Map<string, LiveChannel[]>() }
        const q = query.trim().toLowerCase()
        let list = channels
        if (category === 'fav') {
            list = list.filter(c => isFavorite(favorites, 'live', String(c.stream_id)))
            // Ordem personalizada: a posição no array de favoritos manda (setas ↑/↓).
            const order = new Map(favorites.live.map((favId, index) => [favId, index]))
            list = [...list].sort((a, b) => (order.get(String(a.stream_id)) ?? 0) - (order.get(String(b.stream_id)) ?? 0))
        }
        else if (category !== 'all') list = list.filter(c => c.category_id === category)
        if (allowed) list = list.filter(item => !item.category_id || allowed.has(item.category_id))
        if (hidden.size > 0) list = list.filter(item => !hidden.has(String(item.stream_id)))
        if (q) list = list.filter(c => c.name.toLowerCase().includes(q))
        if (!groupVariants) return { list, variantsOf: new Map<string, typeof list>() }
        const grouped = groupChannelVariants(list)
        return { list: grouped.groups, variantsOf: grouped.variantsOf }
    }, [channels, query, category, favorites, allowed, hidden, groupVariants])

    const play = async (channel: LiveChannel) => {
        const client = await getClient()
        if (!client) return
        // A lista FILTRADA vira o contexto de zapping (⏮/⏭ no player).
        setZapContext(filtered.map(c => ({ id: String(c.stream_id), name: c.name, num: c.num })), String(channel.stream_id))
        void recordRecentChannel({ id: String(channel.stream_id), name: channel.name, logo: channel.stream_icon || '' })
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
        })
    }

    const toggleFav = (channel: LiveChannel) => {
        void persistToggle('live', String(channel.stream_id)).then(setFavorites)
    }

    // 📇 Ficha do canal (long-press): número, categoria, agora/a seguir e
    // replay — com atalhos de ocultar e assistir (o ocultar antigo mora aqui).
    const showChannelInfo = (channel: LiveChannel) => {
        void (async () => {
            const client = await getClient()
            const catName = categories.find(cat => cat.category_id === channel.category_id)?.category_name ?? ''
            const nowNext = client
                ? await cachedFetch(`epg:${channel.stream_id}`, () => client.getShortEpg(String(channel.stream_id))).catch(() => null)
                : null
            const lines = [
                channel.num ? `nº ${channel.num}` : '',
                catName ? `📂 ${catName}` : '',
                nowNext?.now ? `▶ ${nowNext.now.title}` : '',
                nowNext?.next ? `⏭ ${nowNext.next.title}` : '',
                hasCatchup(channel) ? t('chInfoCatchup') : '',
            ].filter(Boolean).join('\n')
            Alert.alert(channel.name, lines || t('scheduleEmpty'), [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('hide'),
                    style: 'destructive',
                    onPress: () => {
                        void hideChannel({ id: String(channel.stream_id), name: channel.name })
                            .then(hiddenIdSet)
                            .then(setHidden)
                    },
                },
                { text: t('watchNow'), onPress: () => void play(channel) },
            ])
        })()
    }

    // Linhas visíveis pedem o "agora/a seguir" (cache por sessão + dedupe).
    // useCallback([]) mantém a referência estável, exigência do FlatList.
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
                const nowNext = await cachedFetch(`epg:${id}`, () => client.getShortEpg(id))
                    .catch(() => null)
                if (nowNext) setEpgMap(prev => ({ ...prev, [id]: nowNext }))
            })()
        }
    }, [])

    if (channels === null) return <Loading label={t('loadingChannels')} />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder={t('searchChannel')} />
            <CategoryChips categories={allowed ? categories.filter(c => allowed.has(c.category_id)) : categories} selected={category} onSelect={setCategory} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VIEWABILITY}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        tintColor={colors.accent}
                        onRefresh={() => {
                            setRefreshing(true)
                            void load(true).finally(() => setRefreshing(false))
                        }}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        icon="tv-outline"
                        label={category === 'fav' ? t('noFavChannels') : query ? t('noChannelFound') : t('noChannels')}
                    />
                }
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => {
                    const fav = isFavorite(favorites, 'live', String(item.stream_id))
                    const epg = epgMap[String(item.stream_id)]
                    const epgLine = epg?.now
                        ? `${epg.now.title}${epg.next ? `  ·  ${t('nextUp')}${epg.next.title}` : ''}`
                        : epg?.next
                            ? `${t('nextUp')}${epg.next.title}`
                            : ''
                    return (
                        <>
                        <TvTouchable
                            style={styles.row}
                            onPress={() => void play(item)}
                            onLongPress={() => showChannelInfo(item)}
                            delayLongPress={350}
                        >
                            {item.stream_icon ? (
                                <Image source={{ uri: item.stream_icon }} style={styles.logo} contentFit="contain" transition={120} />
                            ) : (
                                <View style={[styles.logo, styles.logoFallback]}>
                                    <Ionicons name="tv-outline" size={18} color={colors.textDim} />
                                </View>
                            )}
                            <View style={styles.nameBlock}>
                                <Text style={styles.name} numberOfLines={1}>{item.num ? <Text style={styles.chNum}>{item.num}  </Text> : null}{item.name}</Text>
                                {epgLine ? <Text style={styles.epg} numberOfLines={1}>{epgLine}</Text> : null}
                            </View>
                            {variantsOf.has(String(item.stream_id)) ? (
                                <TouchableOpacity
                                    style={styles.favBtn}
                                    accessibilityLabel={t('variantPick')}
                                    onPress={() => {
                                        const variants = variantsOf.get(String(item.stream_id)) ?? []
                                        Alert.alert(t('variantPick'), item.name, [
                                            { text: t('cancel'), style: 'cancel' },
                                            ...variants.map(variant => ({ text: variant.name, onPress: () => void play(variant) })),
                                        ])
                                    }}
                                >
                                    <Text style={styles.variantBadge}>×{variantsOf.get(String(item.stream_id))?.length}</Text>
                                </TouchableOpacity>
                            ) : null}
                            {category === 'fav' ? (
                                <View style={styles.reorderCol}>
                                    <TouchableOpacity
                                        style={styles.reorderBtn}
                                        accessibilityLabel={t('favUp')}
                                        onPress={() => void persistMove('live', String(item.stream_id), -1).then(setFavorites)}
                                    >
                                        <Ionicons name="chevron-up" size={14} color={colors.textDim} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.reorderBtn}
                                        accessibilityLabel={t('favDown')}
                                        onPress={() => void persistMove('live', String(item.stream_id), 1).then(setFavorites)}
                                    >
                                        <Ionicons name="chevron-down" size={14} color={colors.textDim} />
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                            <TouchableOpacity
                                style={styles.favBtn}
                                accessibilityLabel={t('a11yExpand')}
                                onPress={() => toggleExpand(String(item.stream_id))}
                            >
                                <Ionicons
                                    name={expandedId === String(item.stream_id) ? 'chevron-up' : 'chevron-down'}
                                    size={18}
                                    color={colors.textDim}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.favBtn} onPress={() => toggleFav(item)}>
                                <Ionicons
                                    name={fav ? 'heart' : 'heart-outline'}
                                    size={20}
                                    color={fav ? colors.danger : colors.textDim}
                                />
                            </TouchableOpacity>
                            <Ionicons name="play" size={18} color={colors.accent} />
                        </TvTouchable>
                        {expandedId === String(item.stream_id) ? (
                            <View style={styles.miniGuide}>
                                {epgMap[String(item.stream_id)]?.now?.desc ? (
                                    <Text style={styles.miniDesc} numberOfLines={3}>
                                        {epgMap[String(item.stream_id)]?.now?.desc}
                                    </Text>
                                ) : null}
                                {(daySchedules[String(item.stream_id)] ?? []).filter(p => p.endMs > Date.now()).slice(0, 6).map(program => {
                                    const time = new Date(program.startMs)
                                    const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
                                    const liveNow = program.startMs <= Date.now() && Date.now() < program.endMs
                                    return (
                                        <View key={String(program.startMs)} style={styles.miniRow}>
                                            <Text style={[styles.miniTime, liveNow && { color: colors.accent }]}>{hhmm}</Text>
                                            <Text style={[styles.miniTitle, liveNow && { color: colors.accent }]} numberOfLines={1}>
                                                {program.title}
                                            </Text>
                                        </View>
                                    )
                                })}
                                {daySchedules[String(item.stream_id)]?.length === 0 ? (
                                    <TouchableOpacity
                                        onPress={() => router.push({
                                            pathname: '/epgfix',
                                            params: { channel: String(item.stream_id), name: item.name },
                                        })}
                                    >
                                        <Text style={styles.miniTime}>{t('scheduleEmpty')} · <Text style={{ color: colors.accent }}>{t('epgFixBtn')}</Text></Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        ) : null}
                        </>
                    )
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.sm },
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    logo: { width: tvSize(42), height: tvSize(42), borderRadius: 8, backgroundColor: colors.card },
    miniGuide: {
        backgroundColor: colors.card,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        borderRadius: 10,
        padding: spacing.md,
        gap: 5,
    },
    miniRow: { flexDirection: 'row', gap: spacing.md },
    miniTime: { color: colors.textDim, fontSize: 12, width: 42 },
    miniTitle: { flex: 1, color: colors.text, fontSize: 13 },
    miniDesc: { color: colors.textDim, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
    logoFallback: { alignItems: 'center', justifyContent: 'center' },
    nameBlock: { flex: 1, gap: 1 },
    name: { color: colors.text, fontSize: tvSize(15) },
    chNum: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
    epg: { color: colors.textDim, fontSize: tvSize(12) },
    favBtn: { padding: spacing.xs },
    variantBadge: { color: colors.accent, fontSize: tvSize(11), fontWeight: '800' },
    reorderCol: { justifyContent: 'center' },
    reorderBtn: { paddingHorizontal: 4, paddingVertical: 2 },
})
