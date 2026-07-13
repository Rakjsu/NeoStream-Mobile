import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { loadFavorites } from '../../services/favorites'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { checkNewEpisodes } from '../../services/newEpisodes'
import { notifyNow } from '../../services/notify'
import { listRecentChannels, recordRecentChannel } from '../../services/recents'
import { checkRecurringReminders } from '../../services/recurring'
import { scheduleWeeklySummary } from '../../services/weekly'
import { checkScheduledRecordings } from '../../services/schedRec'
import { hourBucketOf, loadHabits, topHabitKeys } from '../../services/habit'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { listContinue, loadProgress, removeEntry, saveSample, type ProgressEntry } from '../../services/progress'
import { becauseYouWatched, type RecCandidate } from '../../services/recommend'
import { loadWatchlist } from '../../services/watchlist'
import { accountLabel, cachedFetch, catalogFetchedAt, getClient, loadAccount } from '../../services/session'
import { daysUntil, parseExpiry } from '../../services/xtream'
import type { Category, SeriesItem, VodMovie } from '../../services/xtream'
import { updateContinueShortcut } from '../../services/shortcuts'
import { setZapContext } from '../../services/zap'
import { dayKey, formatMinutes, loadTitleUsage, topTitles } from '../../services/usage'
import { checkForUpdate, type UpdateInfo } from '../../services/updates'
import { ChannelRail, ContinueRail, EmptyState, Loading, PosterRail, type RailItem } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'
import { t, tf } from '../../i18n/strings'

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
    const [recentChannels, setRecentChannels] = useState<{ id: string; name: string; logo: string }[]>([])
    const [newMovies, setNewMovies] = useState<RailItem[]>([])
    const [newSeries, setNewSeries] = useState<RailItem[]>([])
    const [freshEpisodes, setFreshEpisodes] = useState<RailItem[]>([])
    const [update, setUpdate] = useState<UpdateInfo | null>(null)
    const [because, setBecause] = useState<{ title: string; items: RailItem[] } | null>(null)
    const [catalogAge, setCatalogAge] = useState('')
    const [watchRail, setWatchRail] = useState<RailItem[]>([])
    // Desfazer: guarda a entrada removida por 5s antes de sumir de vez.
    const [undoEntry, setUndoEntry] = useState<ProgressEntry | null>(null)
    const [praAgora, setPraAgora] = useState<{ id: string; name: string; logo: string }[]>([])
    const [expiryDays, setExpiryDays] = useState<number | null>(null)

    const load = useCallback(async (force = false) => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [live, vod, shows, liveCats, vodCats, seriesCats, favorites, parental, progress, recents] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels(), force),
                cachedFetch('vod', () => client.getVodMovies(), force),
                cachedFetch('series', () => client.getSeries(), force),
                cachedFetch('live-cats', () => client.getLiveCategories(), force).catch(() => [] as Category[]),
                cachedFetch('vod-cats', () => client.getVodCategories(), force).catch(() => [] as Category[]),
                cachedFetch('series-cats', () => client.getSeriesCategories(), force).catch(() => [] as Category[]),
                loadFavorites(),
                loadParental(),
                loadProgress(),
                listRecentChannels(),
            ])

            const allowedLive = await guardedCategoryIds(liveCats, parental.enabled)
            const allowedVod = await guardedCategoryIds(vodCats, parental.enabled)
            const allowedSeries = await guardedCategoryIds(seriesCats, parental.enabled)
            const pass = (set: Set<string> | null, categoryId?: string) => !set || !categoryId || set.has(categoryId)

            const visibleVod = vod.filter(m => pass(allowedVod, m.category_id))
            const visibleShows = shows.filter(s => pass(allowedSeries, s.category_id))

            const continueEntries = listContinue(progress)
            setContinueList(continueEntries.slice(0, RAIL_MAX))
            // O long-press no ícone do app ganha "▶ Continuar {último}".
            const latest = continueEntries[0]
            updateContinueShortcut(latest ? {
                kind: latest.kind, streamId: latest.streamId, title: latest.title,
                container: latest.container, cover: latest.cover,
            } : null)

            const watchlist = await loadWatchlist()
            setWatchRail(watchlist.slice(0, RAIL_MAX).map(item => ({
                key: `w${item.kind === 'movie' ? 'm' : 's'}${item.id}`, kind: item.kind,
                id: item.id, name: item.name, cover: item.cover, container: item.container,
            })))

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

            // Recentes: nome/logo atualizados pela lista viva + filtro parental.
            const liveById = new Map(live.map(c => [String(c.stream_id), c]))
            setRecentChannels(recents.flatMap(recent => {
                const channel = liveById.get(recent.id)
                if (!channel || !pass(allowedLive, channel.category_id)) return []
                return [{ id: recent.id, name: channel.name, logo: channel.stream_icon || recent.logo }]
            }).slice(0, RAIL_MAX))

            // Séries favoritas com episódios novos desde a última visita.
            const fresh = await checkNewEpisodes(visibleShows, favorites.series)
            setFreshEpisodes(fresh.slice(0, RAIL_MAX).map(seriesRail))
            if (fresh.length === 1) {
                void notifyNow(t('newEpsTitle'), tf('newEpsOne', { title: fresh[0].name }), '/(tabs)/home')
            } else if (fresh.length > 1) {
                void notifyNow(t('newEpsTitle'), tf('newEpsMany', { n: fresh.length }), '/(tabs)/home')
            }

            setNewMovies([...visibleVod].sort((a, b) => epoch(b.added) - epoch(a.added)).slice(0, RAIL_MAX).map(movieRail))
            setNewSeries([...visibleShows].sort((a, b) => epoch(b.last_modified) - epoch(a.last_modified)).slice(0, RAIL_MAX).map(seriesRail))

            // Primeiro paint AGORA — o resto (recomendações, hábitos, checagens)
            // é enfeite e roda depois, sem segurar a tela em catálogo gigante.
            setReady(true)

            // Rail personalizado: top do "Seu uso" × categoria do catálogo.
            const tops = topTitles(await loadTitleUsage(), dayKey(Date.now()), ['movie', 'episode'], 5)
            const candidates: RecCandidate[] = [
                ...visibleVod.map(m => ({
                    id: String(m.stream_id), name: m.name, kind: 'movie' as const,
                    category: m.category_id ?? '', cover: m.stream_icon || '', container: m.container_extension || 'mp4',
                })),
                ...visibleShows.map(s => ({
                    id: String(s.series_id), name: s.name, kind: 'series' as const,
                    category: s.category_id ?? '', cover: s.cover || '',
                })),
            ]
            const rec = becauseYouWatched(tops, candidates, RAIL_MAX)
            setBecause(rec ? {
                title: rec.anchor,
                items: rec.items.map(c => ({
                    key: `${c.kind === 'movie' ? 'm' : 's'}${c.id}`, kind: c.kind,
                    id: c.id, name: c.name, cover: c.cover, container: c.container,
                })),
            } : null)

            void checkRecurringReminders()
            void scheduleWeeklySummary()
            void checkScheduledRecordings(t('recStartedNotif'))

            // "Pra agora": canais que você costuma ver NESTE dia/horário.
            const habitNow = new Date()
            const habitTops = topHabitKeys(await loadHabits(), habitNow.getDay(), hourBucketOf(habitNow.getHours()))
            const liveByName = new Map(live.map(c => [c.name.toLowerCase(), c]))
            setPraAgora(habitTops
                .filter(key => key.startsWith('live|'))
                .flatMap(key => {
                    const channel = liveByName.get(key.slice(5).toLowerCase())
                    return channel && pass(allowedLive, channel.category_id)
                        ? [{ id: String(channel.stream_id), name: channel.name, logo: channel.stream_icon || '' }]
                        : []
                })
                .slice(0, RAIL_MAX))

            // "Atualizado há Xh" — o pull-to-refresh força a rede.
            const fetchedMs = catalogFetchedAt('live') ?? catalogFetchedAt('vod') ?? catalogFetchedAt('series')
            if (fetchedMs) {
                const ageMin = Math.floor((Date.now() - fetchedMs) / 60_000)
                setCatalogAge(ageMin < 1 ? t('catalogAgeNow') : tf('catalogAge', { age: formatMinutes(ageMin) }))
            }
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failHome'))
        } finally {
            setReady(true)
        }
    }, [])

    // Checagem de versão nova (1x/dia, cache no aparelho) — sem loja, é o
    // único jeito de quem instalou o APK ficar sabendo de update.
    useEffect(() => {
        queueMicrotask(() => {
            void checkForUpdate(Constants.expoConfig?.version ?? '0.0.0')
                .then(setUpdate)
                .catch(() => undefined)
        })
    }, [])

    // Conta perto de vencer: banner + notificação (1x por dia).
    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const account = await loadAccount()
                if (!account) return
                const days = daysUntil(parseExpiry(account.userInfo?.exp_date), Date.now())
                if (days === null || days > 7 || days < 0) { setExpiryDays(null); return }
                setExpiryDays(days)
                const flag = `neostream_expiry_notified_${account.id}_${dayKey(Date.now())}`
                const seen = await AsyncStorage.getItem(flag).catch(() => '1')
                if (seen) return
                await AsyncStorage.setItem(flag, '1').catch(() => undefined)
                void notifyNow(
                    days === 0 ? t('expiryToday') : tf('expiryBanner', { n: days }),
                    accountLabel(account),
                    '/(tabs)/settings',
                )
            })()
        })
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

    const playChannel = async (channel: { id: string; name: string; logo?: string }, context: { id: string; name: string }[]) => {
        const client = await getClient()
        if (!client) return
        setZapContext(context.map(c => ({ id: c.id, name: c.name })), channel.id)
        void recordRecentChannel({ id: channel.id, name: channel.name, logo: channel.logo ?? '' })
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.id), title: channel.name, live: '1' },
        })
    }

    // Remove direto e oferece DESFAZER por 5s (em vez de Alert de confirmação).
    const confirmRemoveContinue = (entry: ProgressEntry) => {
        void removeEntry(entry.id).then(() =>
            loadProgress().then(map => { setContinueList(listContinue(map).slice(0, RAIL_MAX)) }),
        )
        setUndoEntry(entry)
    }

    useEffect(() => {
        if (!undoEntry) return
        const timer = setTimeout(() => setUndoEntry(null), 5000)
        return () => clearTimeout(timer)
    }, [undoEntry])

    const undoRemove = () => {
        const entry = undoEntry
        if (!entry) return
        setUndoEntry(null)
        void saveSample(entry).then(() =>
            loadProgress().then(map => { setContinueList(listContinue(map).slice(0, RAIL_MAX)) }),
        )
    }

    if (!ready) return <Loading label={t('loadingHome')} />

    const empty = continueList.length === 0 && favPosters.length === 0 && favChannels.length === 0 && recentChannels.length === 0
        && newMovies.length === 0 && newSeries.length === 0 && freshEpisodes.length === 0 && watchRail.length === 0

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
            {update ? (
                <TouchableOpacity style={styles.updateBanner} onPress={() => void Linking.openURL(update.url)}>
                    <Ionicons name="arrow-up-circle" size={18} color={colors.accent} />
                    <Text style={styles.updateText}>{tf('updateBanner', { version: update.version })}</Text>
                </TouchableOpacity>
            ) : null}
            {expiryDays !== null ? (
                <View style={[styles.updateBanner, { borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.updateText}>
                        {expiryDays === 0 ? t('expiryToday') : tf('expiryBanner', { n: expiryDays })}
                    </Text>
                </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {catalogAge ? <Text style={styles.ageText}>{catalogAge}</Text> : null}
            {empty ? (
                <EmptyState icon="home-outline" label={t('homeEmpty')} />
            ) : (
                <View style={{ gap: spacing.md }}>
                    <ContinueRail entries={continueList} onPlay={entry => void resume(entry)} onRemove={confirmRemoveContinue} />
                    <PosterRail title={t('watchlistRail')} items={watchRail} onPress={openRailItem} />
                    <PosterRail title={t('newEpisodesRail')} items={freshEpisodes} onPress={openRailItem} />
                    <PosterRail title={t('favRail')} items={favPosters} onPress={openRailItem} />
                    {because ? (
                        <PosterRail title={tf('becauseRail', { title: because.title })} items={because.items} onPress={openRailItem} />
                    ) : null}
                    <ChannelRail title={t('praAgoraRail')} items={praAgora} onPress={item => void playChannel(item, praAgora)} />
                    <ChannelRail title={t('recentChannelsRail')} items={recentChannels} onPress={item => void playChannel(item, recentChannels)} />
                    <ChannelRail title={t('favChannelsRail')} items={favChannels} onPress={item => void playChannel(item, favChannels)} />
                    <PosterRail title={t('newMoviesRail')} items={newMovies} onPress={openRailItem} />
                    <PosterRail title={t('newSeriesRail')} items={newSeries} onPress={openRailItem} />
                </View>
            )}
            {undoEntry ? (
                <View style={styles.snackbar}>
                    <Text style={styles.snackText} numberOfLines={1}>{t('removedToast')}: {undoEntry.title}</Text>
                    <TouchableOpacity onPress={undoRemove}>
                        <Text style={styles.snackAction}>{t('undoBtn')}</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginVertical: spacing.sm },
    ageText: { color: colors.textDim, fontSize: 11, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
    updateBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accentSoft,
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: 10,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
    },
    updateText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
    snackbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        marginHorizontal: spacing.lg,
        marginVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
    },
    snackText: { flex: 1, color: colors.text, fontSize: 13 },
    snackAction: { color: colors.accent, fontSize: 13, fontWeight: '700' },
})
