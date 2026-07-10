import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { loadFavorites } from '../../services/favorites'
import { allowedCategoryIds, loadParental } from '../../services/parental'
import { listContinue, loadProgress, type ProgressEntry } from '../../services/progress'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, SeriesItem, VodMovie } from '../../services/xtream'
import { setZapContext } from '../../services/zap'
import { ChannelRail, ContinueRail, EmptyState, Loading, PosterRail, type RailItem } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'

const RAIL_MAX = 15

/** Epoch (s) em string → número pra ordenar por mais novo. */
const epoch = (value?: string) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

export default function HomeTab() {
    const [ready, setReady] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [continueList, setContinueList] = useState<ProgressEntry[]>([])
    const [favPosters, setFavPosters] = useState<RailItem[]>([])
    const [favChannels, setFavChannels] = useState<{ id: string; name: string; logo: string }[]>([])
    const [newMovies, setNewMovies] = useState<RailItem[]>([])
    const [newSeries, setNewSeries] = useState<RailItem[]>([])

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [live, vod, shows, liveCats, vodCats, seriesCats, favorites, parental, progress] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels(), force),
                cachedFetch('vod', () => client.getVodMovies(), force),
                cachedFetch('series', () => client.getSeries(), force),
                cachedFetch('live-cats', () => client.getLiveCategories(), force).catch(() => [] as Category[]),
                cachedFetch('vod-cats', () => client.getVodCategories(), force).catch(() => [] as Category[]),
                cachedFetch('series-cats', () => client.getSeriesCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
                loadParental(),
                loadProgress(),
            ])

            const allowedLive = allowedCategoryIds(liveCats, parental.enabled)
            const allowedVod = allowedCategoryIds(vodCats, parental.enabled)
            const allowedSeries = allowedCategoryIds(seriesCats, parental.enabled)
            const pass = (set: Set<string> | null, categoryId?: string) => !set || !categoryId || set.has(categoryId)

            const visibleVod = vod.filter(m => pass(allowedVod, m.category_id))
            const visibleShows = shows.filter(s => pass(allowedSeries, s.category_id))

            setContinueList(listContinue(progress).slice(0, RAIL_MAX))

            const movieRail = (movie: VodMovie): RailItem => ({
                key: `m${movie.stream_id}`, kind: 'movie', id: String(movie.stream_id),
                name: movie.name, cover: movie.stream_icon || '', container: movie.container_extension || 'mp4',
            })
            const seriesRail = (show: SeriesItem): RailItem => ({
                key: `s${show.series_id}`, kind: 'series', id: String(show.series_id),
                name: show.name, cover: show.cover || '',
            })

            setFavPosters([
                ...visibleVod.filter(m => favorites.movie.includes(String(m.stream_id))).map(movieRail),
                ...visibleShows.filter(s => favorites.series.includes(String(s.series_id))).map(seriesRail),
            ].slice(0, RAIL_MAX))

            setFavChannels(
                live.filter(c => favorites.live.includes(String(c.stream_id)) && pass(allowedLive, c.category_id))
                    .slice(0, RAIL_MAX)
                    .map(c => ({ id: String(c.stream_id), name: c.name, logo: c.stream_icon || '' })),
            )

            setNewMovies([...visibleVod].sort((a, b) => epoch(b.added) - epoch(a.added)).slice(0, RAIL_MAX).map(movieRail))
            setNewSeries([...visibleShows].sort((a, b) => epoch(b.last_modified) - epoch(a.last_modified)).slice(0, RAIL_MAX).map(seriesRail))
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar a Home.')
        } finally {
            setReady(true)
        }
    }, [])

    // A Home reflete favoritos/progresso feitos em outras telas → recarrega no foco.
    useFocusEffect(useCallback(() => { queueMicrotask(() => { void load() }) }, [load]))

    const openRailItem = (item: RailItem) => {
        if (item.kind === 'movie') {
            router.push({
                pathname: '/movie/[id]',
                params: { id: item.id, name: item.name, cover: item.cover, container: item.container || 'mp4' },
            })
        } else {
            router.push({ pathname: '/series/[id]', params: { id: item.id, name: item.name, cover: item.cover } })
        }
    }

    const resume = async (entry: ProgressEntry) => {
        const client = await getClient()
        if (!client) return
        const url = entry.kind === 'movie'
            ? client.vodStreamUrl(entry.streamId, entry.container)
            : client.seriesStreamUrl(entry.streamId, entry.container)
        router.push({
            pathname: '/player',
            params: {
                url, title: entry.title, pid: entry.id, kind: entry.kind,
                sid: entry.streamId, container: entry.container, cover: entry.cover,
            },
        })
    }

    const playChannel = async (channel: { id: string; name: string }) => {
        const client = await getClient()
        if (!client) return
        setZapContext(favChannels.map(c => ({ id: c.id, name: c.name })), channel.id)
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.id), title: channel.name, live: '1' },
        })
    }

    if (!ready) return <Loading label="Preparando a Home…" />

    const empty = continueList.length === 0 && favPosters.length === 0 && favChannels.length === 0
        && newMovies.length === 0 && newSeries.length === 0

    return (
        <ScrollView
            style={styles.root}
            contentContainerStyle={empty ? { flexGrow: 1 } : { paddingVertical: spacing.sm }}
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
        >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {empty ? (
                <EmptyState icon="home-outline" label="Assista e favorite pra Home ganhar vida." />
            ) : (
                <View style={{ gap: spacing.md }}>
                    <ContinueRail entries={continueList} onPlay={entry => void resume(entry)} />
                    <PosterRail title="❤ Favoritos" items={favPosters} onPress={openRailItem} />
                    <ChannelRail title="📺 Canais favoritos" items={favChannels} onPress={item => void playChannel(item)} />
                    <PosterRail title="🆕 Filmes adicionados" items={newMovies} onPress={openRailItem} />
                    <PosterRail title="🆕 Séries atualizadas" items={newSeries} onPress={openRailItem} />
                </View>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginVertical: spacing.sm },
})
