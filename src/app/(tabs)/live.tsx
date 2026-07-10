import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { cachedFetch, getClient } from '../../services/session'
import type { LiveChannel } from '../../services/xtream'
import { EmptyState, Loading, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

export default function LiveTab() {
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [query, setQuery] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const list = await cachedFetch('live', () => client.getLiveChannels(), force)
            setChannels(list)
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar os canais.')
            setChannels([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!channels) return []
        return q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels
    }, [channels, query])

    const play = async (channel: LiveChannel) => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
        })
    }

    if (channels === null) return <Loading label="Carregando canais…" />

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar canal…" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <FlatList
                data={filtered}
                keyExtractor={item => String(item.stream_id)}
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
                ListEmptyComponent={<EmptyState icon="tv-outline" label={query ? 'Nenhum canal encontrado.' : 'Nenhum canal na lista.'} />}
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.row} onPress={() => void play(item)}>
                        {item.stream_icon ? (
                            <Image source={{ uri: item.stream_icon }} style={styles.logo} resizeMode="contain" />
                        ) : (
                            <View style={[styles.logo, styles.logoFallback]}>
                                <Ionicons name="tv-outline" size={18} color={colors.textDim} />
                            </View>
                        )}
                        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                        <Ionicons name="play" size={18} color={colors.accent} />
                    </TouchableOpacity>
                )}
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
    name: { flex: 1, color: colors.text, fontSize: 15 },
})
