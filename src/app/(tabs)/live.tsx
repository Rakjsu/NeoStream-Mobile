import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native'
import { emptyFavorites, isFavorite, persistToggle, loadFavorites, type Favorites } from '../../services/favorites'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, LiveChannel, NowNext } from '../../services/xtream'
import { CategoryChips, EmptyState, Loading, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

export default function LiveTab() {
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    // EPG por canal, buscado quando a linha entra na tela (nunca em massa).
    const [epgMap, setEpgMap] = useState<Record<string, NowNext>>({})
    const epgInFlight = useRef(new Set<string>())

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [list, cats, favs] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels(), force),
                cachedFetch('live-cats', () => client.getLiveCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
            ])
            setChannels(list)
            setCategories(cats)
            setFavorites(favs)
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar os canais.')
            setChannels([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    const filtered = useMemo(() => {
        if (!channels) return []
        const q = query.trim().toLowerCase()
        let list = channels
        if (category === 'fav') list = list.filter(c => isFavorite(favorites, 'live', String(c.stream_id)))
        else if (category !== 'all') list = list.filter(c => c.category_id === category)
        return q ? list.filter(c => c.name.toLowerCase().includes(q)) : list
    }, [channels, query, category, favorites])

    const play = async (channel: LiveChannel) => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
        })
    }

    const toggleFav = (channel: LiveChannel) => {
        void persistToggle('live', String(channel.stream_id)).then(setFavorites)
    }

    // Linhas visíveis pedem o "agora/a seguir" (cache por sessão + dedupe).
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
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
    })
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 })

    if (channels === null) return <Loading label="Carregando canais…" />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar canal…" />
            <CategoryChips categories={categories} selected={category} onSelect={setCategory} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
                onViewableItemsChanged={onViewableItemsChanged.current}
                viewabilityConfig={viewabilityConfig.current}
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
                        label={category === 'fav' ? 'Nenhum canal favorito ainda — toque no ❤ de um canal.' : query ? 'Nenhum canal encontrado.' : 'Nenhum canal na lista.'}
                    />
                }
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => {
                    const fav = isFavorite(favorites, 'live', String(item.stream_id))
                    const epg = epgMap[String(item.stream_id)]
                    const epgLine = epg?.now
                        ? `${epg.now.title}${epg.next ? `  ·  A seguir: ${epg.next.title}` : ''}`
                        : epg?.next
                            ? `A seguir: ${epg.next.title}`
                            : ''
                    return (
                        <TouchableOpacity style={styles.row} onPress={() => void play(item)}>
                            {item.stream_icon ? (
                                <Image source={{ uri: item.stream_icon }} style={styles.logo} resizeMode="contain" />
                            ) : (
                                <View style={[styles.logo, styles.logoFallback]}>
                                    <Ionicons name="tv-outline" size={18} color={colors.textDim} />
                                </View>
                            )}
                            <View style={styles.nameBlock}>
                                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                                {epgLine ? <Text style={styles.epg} numberOfLines={1}>{epgLine}</Text> : null}
                            </View>
                            <TouchableOpacity style={styles.favBtn} onPress={() => toggleFav(item)}>
                                <Ionicons
                                    name={fav ? 'heart' : 'heart-outline'}
                                    size={20}
                                    color={fav ? colors.danger : colors.textDim}
                                />
                            </TouchableOpacity>
                            <Ionicons name="play" size={18} color={colors.accent} />
                        </TouchableOpacity>
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
    logo: { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.card },
    logoFallback: { alignItems: 'center', justifyContent: 'center' },
    nameBlock: { flex: 1, gap: 1 },
    name: { color: colors.text, fontSize: 15 },
    epg: { color: colors.textDim, fontSize: 12 },
    favBtn: { padding: spacing.xs },
})
