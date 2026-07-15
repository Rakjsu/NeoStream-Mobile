import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'
import { guardedCategoryIds } from '../services/kids'
import { loadParental } from '../services/parental'
import { cachedFetch, getClient } from '../services/session'
import type { Category } from '../services/xtream'
import { EmptyState, Loading, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { tvSize } from '../ui/tv'
import { t } from '../i18n/strings'

interface ReleaseItem {
    key: string
    kind: 'movie' | 'series'
    id: string
    name: string
    cover: string
    container?: string
    addedMs: number
}

const WINDOW_DAYS = 14

/**
 * 🗓 Lançamentos: o que entrou no catálogo nos últimos 14 dias, agrupado por
 * dia (filmes pelo `added`, séries pelo `last_modified` — epochs do provedor).
 */
export default function Calendar() {
    const [sections, setSections] = useState<{ title: string; data: ReleaseItem[] }[] | null>(null)

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const [vod, shows, vodCats, seriesCats, parental] = await Promise.all([
                    cachedFetch('vod', () => client.getVodMovies()),
                    cachedFetch('series', () => client.getSeries()),
                    cachedFetch('vod-cats', () => client.getVodCategories()).catch(() => [] as Category[]),
                    cachedFetch('series-cats', () => client.getSeriesCategories()).catch(() => [] as Category[]),
                    loadParental(),
                ])
                const allowedVod = await guardedCategoryIds(vodCats, parental.enabled)
                const allowedSeries = await guardedCategoryIds(seriesCats, parental.enabled)
                const pass = (set: Set<string> | null, categoryId?: string) => !set || !categoryId || set.has(categoryId)
                const nowMs = Date.now()
                const cutoff = nowMs - WINDOW_DAYS * 86_400_000
                const inWindow = (ms: number) => Number.isFinite(ms) && ms >= cutoff && ms <= nowMs + 86_400_000
                const releases: ReleaseItem[] = [
                    ...vod.filter(movie => pass(allowedVod, movie.category_id)).flatMap(movie => {
                        const addedMs = Number(movie.added) * 1000
                        return inWindow(addedMs) ? [{
                            key: `m${movie.stream_id}`, kind: 'movie' as const, id: String(movie.stream_id),
                            name: movie.name, cover: movie.stream_icon || '', container: movie.container_extension || 'mp4', addedMs,
                        }] : []
                    }),
                    ...shows.filter(show => pass(allowedSeries, show.category_id)).flatMap(show => {
                        const addedMs = Number(show.last_modified) * 1000
                        return inWindow(addedMs) ? [{
                            key: `s${show.series_id}`, kind: 'series' as const, id: String(show.series_id),
                            name: show.name, cover: show.cover || '', addedMs,
                        }] : []
                    }),
                ].sort((a, b) => b.addedMs - a.addedMs)

                const byDay = new Map<string, ReleaseItem[]>()
                for (const item of releases) {
                    const label = new Date(item.addedMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
                    const list = byDay.get(label) ?? []
                    list.push(item)
                    byDay.set(label, list)
                }
                // Dia com avalanche de itens não engole a tela: 40 por dia basta.
                setSections([...byDay.entries()].map(([title, data]) => ({ title, data: data.slice(0, 40) })))
            })()
        })
    }, [])

    const open = (item: ReleaseItem) => {
        if (item.kind === 'movie') {
            router.push({
                pathname: '/movie/[id]',
                params: { id: item.id, name: item.name, cover: item.cover, container: item.container || 'mp4' },
            })
        } else {
            router.push({ pathname: '/series/[id]', params: { id: item.id, name: item.name, cover: item.cover } })
        }
    }

    if (!sections) return <Loading label={t('loadingHome')} />

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('calendarTitle') }} />
            <SectionList
                sections={sections}
                keyExtractor={item => item.key}
                stickySectionHeadersEnabled
                ListEmptyComponent={<EmptyState icon="calendar-outline" label={t('calendarEmpty')} />}
                contentContainerStyle={sections.length === 0 ? { flexGrow: 1 } : undefined}
                renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
                renderItem={({ item }) => (
                    <TvTouchable style={styles.row} onPress={() => open(item)}>
                        <Ionicons name={item.kind === 'movie' ? 'film-outline' : 'tv-outline'} size={16} color={colors.accent} />
                        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    </TvTouchable>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    day: {
        color: colors.textDim,
        fontSize: tvSize(12),
        fontWeight: '700',
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xs,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { flex: 1, color: colors.text, fontSize: tvSize(14) },
})
