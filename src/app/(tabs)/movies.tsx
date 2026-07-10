import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { buildProgressId, listContinue, loadProgress, type ProgressEntry } from '../../services/progress'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, VodMovie } from '../../services/xtream'
import { CategoryChips, ContinueRail, EmptyState, Loading, PosterCard, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

export default function MoviesTab() {
    const [movies, setMovies] = useState<VodMovie[] | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [category, setCategory] = useState('all')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [continueList, setContinueList] = useState<ProgressEntry[]>([])
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [list, cats, favs] = await Promise.all([
                cachedFetch('vod', () => client.getVodMovies(), force),
                cachedFetch('vod-cats', () => client.getVodCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
            ])
            setMovies(list)
            setCategories(cats)
            setFavorites(favs)
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar os filmes.')
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
        return q ? list.filter(m => m.name.toLowerCase().includes(q)) : list
    }, [movies, query, category, favorites])

    const play = async (movie: VodMovie) => {
        const client = await getClient()
        if (!client) return
        const container = movie.container_extension || 'mp4'
        router.push({
            pathname: '/player',
            params: {
                url: client.vodStreamUrl(movie.stream_id, container),
                title: movie.name,
                pid: buildProgressId('movie', movie.stream_id),
                kind: 'movie',
                sid: String(movie.stream_id),
                container,
                cover: movie.stream_icon || '',
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

    if (movies === null) return <Loading label="Carregando filmes…" />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar filme…" />
            <CategoryChips categories={categories} selected={category} onSelect={setCategory} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
                numColumns={3}
                initialNumToRender={12}
                windowSize={7}
                ListHeaderComponent={<ContinueRail entries={continueList} onPlay={entry => void resume(entry)} />}
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
                        label={category === 'fav' ? 'Nenhum filme favorito ainda — segure um pôster pra favoritar.' : query ? 'Nenhum filme encontrado.' : 'Nenhum filme na lista.'}
                    />
                }
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.grid}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.cell}
                        onPress={() => void play(item)}
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
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
    grid: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
    cell: { flex: 1 / 3 },
})
