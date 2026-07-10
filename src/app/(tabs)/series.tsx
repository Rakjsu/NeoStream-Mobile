import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { cachedFetch, getClient } from '../../services/session'
import type { SeriesItem } from '../../services/xtream'
import { EmptyState, Loading, PosterCard, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

export default function SeriesTab() {
    const [series, setSeries] = useState<SeriesItem[] | null>(null)
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            setSeries(await cachedFetch('series', () => client.getSeries(), force))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar as séries.')
            setSeries([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!series) return []
        return q ? series.filter(s => s.name.toLowerCase().includes(q)) : series
    }, [series, query])

    if (series === null) return <Loading label="Carregando séries…" />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar série…" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.series_id)}
                numColumns={3}
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
                ListEmptyComponent={<EmptyState icon="albums-outline" label={query ? 'Nenhuma série encontrada.' : 'Nenhuma série na lista.'} />}
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.grid}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.cell}
                        onPress={() => router.push({
                            pathname: '/series/[id]',
                            params: { id: String(item.series_id), name: item.name },
                        })}
                    >
                        <PosterCard name={item.name} cover={item.cover} />
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
