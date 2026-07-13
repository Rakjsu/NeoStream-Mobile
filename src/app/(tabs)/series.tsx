import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { listContinue, loadProgress, removeEntry, type ProgressEntry } from '../../services/progress'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, SeriesItem } from '../../services/xtream'
import { CategoryChips, ContinueRail, EmptyState, Loading, PosterCard, SearchBar, TvTouchable } from '../../ui/components'
import { nextSortMode, sortCatalog, type SortMode } from '../../services/sorting'
import { colors, spacing } from '../../ui/theme'
import { SORT_KEY, t, tf } from '../../i18n/strings'

export default function SeriesTab() {
    const [series, setSeries] = useState<SeriesItem[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [continueList, setContinueList] = useState<ProgressEntry[]>([])
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [allowed, setAllowed] = useState<Set<string> | null>(null)
    const [sort, setSort] = useState<SortMode>('default')
    const [selection, setSelection] = useState<Set<string> | null>(null)

    const toggleSelected = (id: string) => {
        setSelection(current => {
            if (!current) return current
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next.size === 0 ? null : next
        })
    }

    const favoriteSelection = async () => {
        if (!selection) return
        let favs = await loadFavorites()
        for (const id of selection) {
            if (!favs.series.includes(id)) favs = await persistToggle('series', id)
        }
        setFavorites(favs)
        setSelection(null)
    }
    // Colunas pela largura: 3 no celular em pé, 5-6 deitado/tablet.
    const { width } = useWindowDimensions()
    // Densidade: automática ou fixa (3/4/5), compartilhada entre as abas.
    const [density, setDensity] = useState(0) // 0 = auto
    useEffect(() => {
        void AsyncStorage.getItem('neostream_grid_cols')
            .then(raw => setDensity(Number(raw) || 0))
            .catch(() => undefined)
    }, [])
    const cycleDensity = () => {
        const next = density === 0 ? 3 : density >= 5 ? 0 : density + 1
        setDensity(next)
        void (next === 0
            ? AsyncStorage.removeItem('neostream_grid_cols')
            : AsyncStorage.setItem('neostream_grid_cols', String(next))
        ).catch(() => undefined)
    }
    const columns = density > 0 ? density : Math.max(3, Math.min(8, Math.floor(width / 128)))

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [list, cats, favs, parental] = await Promise.all([
                cachedFetch('series', () => client.getSeries(), force),
                cachedFetch('series-cats', () => client.getSeriesCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
                loadParental(),
            ])
            setSeries(list)
            setCategories(cats)
            setFavorites(favs)
            setAllowed(await guardedCategoryIds(cats, parental.enabled))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failSeries'))
            setSeries([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    // Episódios em andamento reaparecem quando a aba volta ao foco.
    useFocusEffect(useCallback(() => {
        queueMicrotask(() => {
            void loadProgress().then(map => setContinueList(listContinue(map, 'episode')))
        })
    }, []))

    const filtered = useMemo(() => {
        if (!series) return []
        const q = query.trim().toLowerCase()
        let list = series
        if (category === 'fav') list = list.filter(s => isFavorite(favorites, 'series', String(s.series_id)))
        else if (category !== 'all') list = list.filter(s => s.category_id === category)
        if (allowed) list = list.filter(item => !item.category_id || allowed.has(item.category_id))
        if (q) list = list.filter(s => s.name.toLowerCase().includes(q))
        return sortCatalog(list, sort, s => s.last_modified)
    }, [series, query, category, favorites, allowed, sort])

    const resume = async (entry: ProgressEntry) => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: {
                url: client.seriesStreamUrl(entry.streamId, entry.container),
                title: entry.title,
                pid: entry.id,
                kind: entry.kind,
                sid: entry.streamId,
                container: entry.container,
                cover: entry.cover,
            },
        })
    }

    const confirmRemoveContinue = (entry: ProgressEntry) => {
        Alert.alert(t('removeContinueTitle'), tf('removeContinueMsg', { title: entry.title }), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('remove'),
                style: 'destructive',
                onPress: () => {
                    void removeEntry(entry.id).then(() =>
                        loadProgress().then(map => { setContinueList(listContinue(map, 'episode')) }),
                    )
                },
            },
        ])
    }

    if (series === null) return <Loading label={t('loadingSeries')} />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder={t('searchSeries')} />
            <View style={styles.filterRow}>
                <View style={{ flex: 1 }}>
                    <CategoryChips categories={allowed ? categories.filter(c => allowed.has(c.category_id)) : categories} selected={category} onSelect={setCategory} />
                </View>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setSort(nextSortMode(sort))}>
                    <Ionicons name="swap-vertical" size={14} color={sort === 'default' ? colors.textDim : colors.accent} />
                    <Text style={[styles.sortText, sort !== 'default' && { color: colors.accent }]}>{t(SORT_KEY[sort])}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sortBtn} accessibilityLabel={tf('gridDensity', { n: density || 'auto' })} onPress={cycleDensity}>
                    <Text style={[styles.sortText, density > 0 && { color: colors.accent }]}>{density > 0 ? `▦${density}` : '▦'}</Text>
                </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {selection ? (
                <View style={styles.selBar}>
                    <Text style={styles.selText}>{tf('selCount', { n: selection.size })}</Text>
                    <TouchableOpacity style={styles.selBtn} onPress={() => void favoriteSelection()}>
                        <Text style={styles.selBtnText}>{t('selFav')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.selBtn} onPress={() => setSelection(null)}>
                        <Ionicons name="close" size={18} color={colors.textDim} />
                    </TouchableOpacity>
                </View>
            ) : null}

            <FlatList
                data={filtered}
                keyExtractor={item => String(item.series_id)}
                key={`grid-${columns}`}
                numColumns={columns}
                initialNumToRender={12}
                windowSize={7}
                ListHeaderComponent={<ContinueRail entries={continueList} onPlay={entry => void resume(entry)} onRemove={confirmRemoveContinue} />}
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
                        icon="albums-outline"
                        label={category === 'fav' ? t('noFavSeries') : query ? t('noSeriesFound') : t('noSeries')}
                    />
                }
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.grid}
                renderItem={({ item, index }) => (
                    <TvTouchable
                        style={{ flex: 1 / columns }}
                        hasTVPreferredFocus={index === 0}
                        onPress={() => {
                            const id = String(item.series_id)
                            if (selection) { toggleSelected(id); return }
                            router.push({
                                pathname: '/series/[id]',
                                params: { id, name: item.name, cover: item.cover || '' },
                            })
                        }}
                        onLongPress={() => setSelection(current => current ?? new Set([String(item.series_id)]))}
                        delayLongPress={350}
                    >
                        <PosterCard
                            name={item.name}
                            cover={item.cover}
                            fav={isFavorite(favorites, 'series', String(item.series_id))}
                            selected={selection?.has(String(item.series_id))}
                        />
                    </TvTouchable>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    selBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: 10,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
    },
    selText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
    selBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
    selBtnText: { color: colors.accent, fontSize: 13, fontWeight: '700' },

    root: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.sm },
    filterRow: { flexDirection: 'row', alignItems: 'flex-start' },
    sortBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginRight: spacing.lg,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    sortText: { color: colors.textDim, fontSize: 12 },
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
    grid: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
})
