import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { cachedFetch, getClient } from '../../services/session'
import type { VodMovie } from '../../services/xtream'
import { EmptyState, Loading, PosterCard, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

export default function MoviesTab() {
    const [movies, setMovies] = useState<VodMovie[] | null>(null)
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            setMovies(await cachedFetch('vod', () => client.getVodMovies(), force))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar os filmes.')
            setMovies([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!movies) return []
        return q ? movies.filter(m => m.name.toLowerCase().includes(q)) : movies
    }, [movies, query])

    const play = async (movie: VodMovie) => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: {
                url: client.vodStreamUrl(movie.stream_id, movie.container_extension || 'mp4'),
                title: movie.name,
            },
        })
    }

    if (movies === null) return <Loading label="Carregando filmes…" />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar filme…" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
                numColumns={3}
                columnWrapperStyle={styles.rowWrap}
                initialNumToRender={12}
                windowSize={7}
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
                ListEmptyComponent={<EmptyState icon="film-outline" label={query ? 'Nenhum filme encontrado.' : 'Nenhum filme na lista.'} />}
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.grid}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.cell} onPress={() => void play(item)}>
                        <PosterCard name={item.name} cover={item.stream_icon} />
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
    rowWrap: { gap: 0 },
    cell: { flex: 1 / 3 },
})
