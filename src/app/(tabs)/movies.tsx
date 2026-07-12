import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { listContinue, loadProgress, removeEntry, type ProgressEntry } from '../../services/progress'
import { allowedCategoryIds, loadParental } from '../../services/parental'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, VodMovie } from '../../services/xtream'
import { CategoryChips, ContinueRail, EmptyState, Loading, PosterCard, SearchBar } from '../../ui/components'
import { nextSortMode, sortCatalog, type SortMode } from '../../services/sorting'
import { colors, spacing } from '../../ui/theme'
import { SORT_KEY, t, tf } from '../../i18n/strings'

export default function MoviesTab() {
    const [movies, setMovies] = useState<VodMovie[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [continueList, setContinueList] = useState<ProgressEntry[]>([])
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [allowed, setAllowed] = useState<Set<string> | null>(null)
    const [sort, setSort] = useState<SortMode>('default')
    // Colunas pela largura: 3 no celular em pé, 5-6 deitado/tablet.
    const { width } = useWindowDimensions()
    const columns = Math.max(3, Math.min(8, Math.floor(width / 128)))

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [list, cats, favs, parental] = await Promise.all([
                cachedFetch('vod', () => client.getVodMovies(), force),
                cachedFetch('vod-cats', () => client.getVodCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
                loadParental(),
            ])
            setMovies(list)
            setCategories(cats)
            setFavorites(favs)
            setAllowed(allowedCategoryIds(cats, parental.enabled))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failMovies'))
            setMovies([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    // Rail atualiza sempre que a aba volta ao foco (voltou do player).
    useFocusEffect(useCallback(() => {
        queueMicrotask(() => {
            void loadProgress().then(map => setContinueList(listContinue(map, 'movie')))
        })
    }, []))

    const filtered = useMemo(() => {
        if (!movies) return []
        const q = query.trim().toLowerCase()
        let list = movies
        if (category === 'fav') list = list.filter(m => isFavorite(favorites, 'movie', String(m.stream_id)))
        else if (category !== 'all') list = list.filter(m => m.category_id === category)
        if (allowed) list = list.filter(item => !item.category_id || allowed.has(item.category_id))
        if (q) list = list.filter(m => m.name.toLowerCase().includes(q))
        return sortCatalog(list, sort, m => m.added)
    }, [movies, query, category, favorites, allowed, sort])

    // Tocar abre a FICHA (sinopse + play); o rail continua indo direto pro player.
    const openDetails = (movie: VodMovie) => {
        router.push({
            pathname: '/movie/[id]',
            params: {
                id: String(movie.stream_id),
                name: movie.name,
                cover: movie.stream_icon || '',
                container: movie.container_extension || 'mp4',
            },
        })
    }

    const resume = async (entry: ProgressEntry) => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: {
                url: client.vodStreamUrl(entry.streamId, entry.container),
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
                        loadProgress().then(map => { setContinueList(listContinue(map, 'movie')) }),
                    )
                },
            },
        ])
    }

    if (movies === null) return <Loading label={t('loadingMovies')} />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder={t('searchMovie')} />
            <View style={styles.filterRow}>
                <View style={{ flex: 1 }}>
                    <CategoryChips categories={allowed ? categories.filter(c => allowed.has(c.category_id)) : categories} selected={category} onSelect={setCategory} />
                </View>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setSort(nextSortMode(sort))}>
                    <Ionicons name="swap-vertical" size={14} color={sort === 'default' ? colors.textDim : colors.accent} />
                    <Text style={[styles.sortText, sort !== 'default' && { color: colors.accent }]}>{t(SORT_KEY[sort])}</Text>
                </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
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
                        icon="film-outline"
                        label={category === 'fav' ? t('noFavMovies') : query ? t('noMovieFound') : t('noMovies')}
                    />
                }
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.grid}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={{ flex: 1 / columns }}
                        onPress={() => openDetails(item)}
                        onLongPress={() => void persistToggle('movie', String(item.stream_id)).then(setFavorites)}
                        delayLongPress={350}
                    >
                        <PosterCard
                            name={item.name}
                            cover={item.stream_icon}
                            fav={isFavorite(favorites, 'movie', String(item.stream_id))}
                        />
                    </TouchableOpacity>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
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
