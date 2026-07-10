import { Ionicons } from '@expo/vector-icons'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { buildProgressId } from '../../services/progress'
import { getClient } from '../../services/session'
import type { Episode } from '../../services/xtream'
import { EmptyState, Loading } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

interface Season {
    title: string
    data: Episode[]
}

export default function SeriesDetail() {
    const { id, name, cover } = useLocalSearchParams<{ id: string; name?: string; cover?: string }>()
    const [seasons, setSeasons] = useState<Season[] | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        void (async () => {
            try {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const info = await client.getSeriesInfo(String(id))
                const episodes = info.episodes ?? {}
                const list: Season[] = Object.keys(episodes)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(season => ({ title: `Temporada ${season}`, data: episodes[season] ?? [] }))
                if (alive) setSeasons(list)
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Falha ao carregar os episódios.')
                    setSeasons([])
                }
            }
        })()
        return () => { alive = false }
    }, [id])

    const play = async (episode: Episode) => {
        const client = await getClient()
        if (!client) return
        const container = episode.container_extension || 'mp4'
        const epTitle = episode.title || `Episódio ${episode.episode_num}`
        router.push({
            pathname: '/player',
            params: {
                url: client.seriesStreamUrl(episode.id, container),
                // "Série · Título do ep" pro rail do Continuar fazer sentido.
                title: name ? `${name} · ${epTitle}` : epTitle,
                pid: buildProgressId('episode', episode.id),
                kind: 'episode',
                sid: String(episode.id),
                container,
                cover: cover || '',
            },
        })
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: name ?? 'Série' }} />
            {seasons === null ? (
                <Loading label="Carregando episódios…" />
            ) : (
                <SectionList
                    sections={seasons}
                    keyExtractor={item => String(item.id)}
                    ListEmptyComponent={<EmptyState icon="albums-outline" label={error || 'Nenhum episódio.'} />}
                    contentContainerStyle={seasons.length === 0 ? { flexGrow: 1 } : undefined}
                    renderSectionHeader={({ section }) => (
                        <Text style={styles.season}>{section.title}</Text>
                    )}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.row} onPress={() => void play(item)}>
                            <View style={styles.epBadge}>
                                <Text style={styles.epNum}>{item.episode_num}</Text>
                            </View>
                            <Text style={styles.epTitle} numberOfLines={1}>
                                {item.title || `Episódio ${item.episode_num}`}
                            </Text>
                            <Ionicons name="play" size={18} color={colors.accent} />
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    season: {
        color: colors.textDim,
        fontSize: 13,
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 12,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    epBadge: {
        minWidth: 34,
        alignItems: 'center',
        backgroundColor: colors.accentSoft,
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    epNum: { color: colors.accent, fontSize: 13, fontWeight: '700' },
    epTitle: { flex: 1, color: colors.text, fontSize: 15 },
})
