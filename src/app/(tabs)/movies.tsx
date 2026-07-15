import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { listContinue, loadProgress, removeEntry, type ProgressEntry } from '../../services/progress'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { enqueueDownloads, type DownloadRequest } from '../../services/downloads'
import { buildProgressId } from '../../services/progress'
import { cachedFetch, getClient, resolvePlayableUrl } from '../../services/session'
import type { Category, VodMovie } from '../../services/xtream'
import { CategoryChips, ContinueRail, EmptyState, Loading, PosterCard, SearchBar, TvTouchable } from '../../ui/components'
import { isRecentlyAdded, nextSortMode, sortCatalog, type SortMode } from '../../services/sorting'
import { colors, spacing } from '../../ui/theme'
import { SORT_KEY, t, tf } from '../../i18n/strings'
import { isTV } from '../../ui/tv'

/** Ano no fim do nome — "Filme (2026)" → 2026 (PURO, null sem ano). */
const yearOf = (name: string) => {
    const match = /\((19|20)\d{2}\)/.exec(name)
    return match ? Number(match[0].slice(1, -1)) : null
}

export default function MoviesTab() {
    const [movies, setMovies] = useState<VodMovie[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [continueList, setContinueList] = useState<ProgressEntry[]>([])
    const [query, setQuery] = useState('')
    const [minRating, setMinRating] = useState(false)
    const [yearFilter, setYearFilter] = useState(0)
    const [thisYear] = useState(() => new Date().getFullYear())
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [allowed, setAllowed] = useState<Set<string> | null>(null)
    const [sort, setSort] = useState<SortMode>('default')
    // Relógio congelado por render (regra react-hooks/purity) — badge NOVO.
    const [nowMs] = useState(() => Date.now())
    // Seleção em lote: long-press entra; toque marca; barra age em todos.
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
            if (!favs.movie.includes(id)) favs = await persistToggle('movie', id)
        }
        setFavorites(favs)
        setSelection(null)
    }

    // Baixar UM filme (menu de contexto da TV) — mesmo request da seleção.
    const downloadOne = async (movie: VodMovie) => {
        const client = await getClient()
        if (!client) return
        const container = movie.container_extension || 'mp4'
        await enqueueDownloads([{
            id: buildProgressId('movie', String(movie.stream_id)),
            url: await resolvePlayableUrl(client.vodStreamUrl(String(movie.stream_id), container)),
            title: movie.name,
            cover: movie.stream_icon || '',
            container,
        }])
    }

    const downloadSelection = async () => {
        if (!selection || !movies) return
        const client = await getClient()
        if (!client) return
        const requests: DownloadRequest[] = []
        for (const movie of movies.filter(m => selection.has(String(m.stream_id)))) {
            const container = movie.container_extension || 'mp4'
            requests.push({
                id: buildProgressId('movie', String(movie.stream_id)),
                url: await resolvePlayableUrl(client.vodStreamUrl(String(movie.stream_id), container)),
                title: movie.name,
                cover: movie.stream_icon || '',
                container,
            })
        }
        await enqueueDownloads(requests)
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
    // Na TV o card precisa ser legível do sofá — divisor maior = menos colunas.
    const columns = density > 0 ? density : Math.max(3, Math.min(8, Math.floor(width / (isTV ? 190 : 128))))

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
            setAllowed(await guardedCategoryIds(cats, parental.enabled))
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
        // Filtros rápidos: nota do provedor ≥ 7 e ano no nome "(2026)".
        if (minRating) list = list.filter(m => Number(m.rating) >= 7)
        if (yearFilter > 0) list = list.filter(m => yearOf(m.name) === yearFilter)
        return sortCatalog(list, sort, m => m.added)
    }, [movies, query, category, favorites, allowed, sort, minRating, yearFilter])

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
                    <View style={styles.qfRow}>
                        <TouchableOpacity
                            style={[styles.qfChip, minRating && styles.qfChipOn]}
                            onPress={() => setMinRating(current => !current)}
                        >
                            <Text style={[styles.qfText, minRating && styles.qfTextOn]}>⭐ 7+</Text>
                        </TouchableOpacity>
                        {[thisYear, thisYear - 1].map(year => (
                            <TouchableOpacity
                                key={year}
                                style={[styles.qfChip, yearFilter === year && styles.qfChipOn]}
                                onPress={() => setYearFilter(current => (current === year ? 0 : year))}
                            >
                                <Text style={[styles.qfText, yearFilter === year && styles.qfTextOn]}>{year}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
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
                    <TouchableOpacity style={styles.selBtn} onPress={() => void downloadSelection()}>
                        <Text style={styles.selBtnText}>{t('selDownload')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selBtn} onPress={() => setSelection(null)}>
                        <Ionicons name="close" size={18} color={colors.textDim} />
                    </TouchableOpacity>
                </View>
            ) : null}

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
                renderItem={({ item, index }) => {
                    const id = String(item.stream_id)
                    return (
                        <TvTouchable
                            style={{ flex: 1 / columns }}
                            hasTVPreferredFocus={index === 0}
                            onPress={() => (selection ? toggleSelected(id) : openDetails(item))}
                            onLongPress={() => {
                                // Na TV o OK longo abre o menu de contexto (padrão leanback);
                                // no touch continua entrando na seleção em lote.
                                if (isTV) {
                                    Alert.alert(item.name, '', [
                                        { text: t('cancel'), style: 'cancel' },
                                        { text: t('ctxOpen'), onPress: () => openDetails(item) },
                                        { text: t('selFav'), onPress: () => { void persistToggle('movie', id).then(setFavorites) } },
                                        { text: t('selDownload'), onPress: () => { void downloadOne(item) } },
                                    ])
                                    return
                                }
                                setSelection(current => current ?? new Set([id]))
                            }}
                            delayLongPress={350}
                        >
                            <PosterCard
                                name={item.name}
                                cover={item.stream_icon}
                                fav={isFavorite(favorites, 'movie', id)}
                                selected={selection?.has(id)}
                                badge={isRecentlyAdded(item.added, nowMs) ? t('newBadge') : undefined}
                            />
                        </TvTouchable>
                    )
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    qfRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
    qfChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
    },
    qfChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    qfText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
    qfTextOn: { color: colors.accent },
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
