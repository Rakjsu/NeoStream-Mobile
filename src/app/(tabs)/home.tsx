import Constants from 'expo-constants'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { loadFavorites } from '../../services/favorites'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { checkNewEpisodes } from '../../services/newEpisodes'
import { listDownloads, type DownloadItem } from '../../services/downloads'
import { notifyNow } from '../../services/notify'
import { listRecentChannels, recordRecentChannel } from '../../services/recents'
import { checkRecurringReminders } from '../../services/recurring'
import { maybeMonthlySummary, scheduleWeeklySummary } from '../../services/weekly'
import { hourBucketOf, loadHabits, topHabitKeys } from '../../services/habit'
import { GUEST_PROFILE_ID, activeProfileId, listProfiles } from '../../services/profiles'
import { defaultRailPrefs, loadRailPrefs, orderedRails, type RailPrefs } from '../../services/homeRails'
import { listCollections, type Collection } from '../../services/collections'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { getEntry, listContinue, loadProgress, removeEntry, saveSample, type ProgressEntry } from '../../services/progress'
import { becauseYouWatched, type RecCandidate } from '../../services/recommend'
import { loadWatchlist } from '../../services/watchlist'
import { accountLabel, cachedFetch, catalogFetchedAt, getClient, loadAccount, resolvePlayableUrl } from '../../services/session'
import { daysUntil, parseExpiry } from '../../services/xtream'
import type { Category, SeriesItem, VodMovie } from '../../services/xtream'
import { updateContinueShortcut } from '../../services/shortcuts'
import { setZapContext } from '../../services/zap'
import { dayKey, formatMinutes, loadTitleUsage, topTitles } from '../../services/usage'
import { checkForUpdate, type UpdateInfo } from '../../services/updates'
import { downloadAndInstall } from '../../services/updater'
import { checkWhatsNew } from '../../services/whatsnew'
import { probeAll } from '../../services/probe'
import { fetchTraktPlayback, fetchTraktWatchlist } from '../../services/trakt'
import { autoTraktSync, traktWins } from '../../services/traktSync'
import { getCloudBackupDir } from '../../services/autoBackup'
import { ChannelRail, ContinueRail, EmptyState, HomeSkeleton, PosterRail, TvTouchable, type RailItem } from '../../ui/components'
import { isTV, tvSize } from '../../ui/tv'
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
    const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null)
    const [cloudNudge, setCloudNudge] = useState(false)
    const [praAgora, setPraAgora] = useState<{ id: string; name: string; logo: string }[]>([])
    const [expiryDays, setExpiryDays] = useState<number | null>(null)
    const [greeting, setGreeting] = useState('')
    const [dlItems, setDlItems] = useState<DownloadItem[]>([])
    const [dlRail, setDlRail] = useState<RailItem[]>([])
    const [railPrefs, setRailPrefs] = useState<RailPrefs>(defaultRailPrefs())
    const [collections, setCollections] = useState<Collection[]>([])

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

            setRailPrefs(await loadRailPrefs())
            setCollections(await listCollections())
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

            // 📥 Baixados: rail offline-first (gravações + filmes/eps locais).
            const dl = await listDownloads()
            setDlItems(dl)
            setDlRail(dl.slice(0, RAIL_MAX).map(item => ({
                key: `dl${item.id}`, kind: 'movie' as const, id: item.id,
                name: item.title, cover: item.cover, container: item.container,
            })))

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

            // Minha lista ganha (só leitura) a watchlist do Trakt — casada por
            // nome no catálogo; o que não existe no provedor fica de fora.
            void cachedFetch('trakt-watchlist', () => fetchTraktWatchlist()).then(traktItems => {
                if (traktItems.length === 0) return
                const have = new Set(watchlist.map(item => item.name.toLowerCase()))
                const extra: RailItem[] = []
                for (const item of traktItems) {
                    const wanted = item.title.toLowerCase()
                    if (have.has(wanted)) continue
                    if (item.kind === 'movie') {
                        const movie = visibleVod.find(m => m.name.toLowerCase().includes(wanted))
                        if (movie) extra.push({ ...movieRail(movie), key: `tw${movie.stream_id}` })
                    } else {
                        const show = visibleShows.find(s => s.name.toLowerCase().includes(wanted))
                        if (show) extra.push({ ...seriesRail(show), key: `tws${show.series_id}` })
                    }
                }
                if (extra.length > 0) setWatchRail(current => [...current, ...extra].slice(0, RAIL_MAX))
            }).catch(() => undefined)

            // Filme pausado no Trakt (Kodi/PC) vira card de "continuar assistindo"
            // — o % é convertido em segundos pelo player quando a duração chegar.
            void cachedFetch('trakt-playback', () => fetchTraktPlayback()).then(async paused => {
                let added = false
                for (const item of paused) {
                    const wanted = item.title.toLowerCase()
                    if (item.kind === 'movie') {
                        const movie = visibleVod.find(m => m.name.toLowerCase().includes(wanted))
                        if (!movie) continue
                        const progressId = `movie:${movie.stream_id}`
                        // 🔄 Maior progresso vence: o % do Trakt só sobrescreve se for maior.
                        if (!traktWins(await getEntry(progressId) ?? undefined, item.progress)) continue
                        await saveSample({
                            id: progressId,
                            kind: 'movie',
                            streamId: String(movie.stream_id),
                            container: movie.container_extension || 'mp4',
                            title: movie.name,
                            cover: movie.stream_icon || '',
                            position: item.progress,
                            duration: 100,
                            updatedAt: item.pausedAtMs,
                            fromTraktPct: true,
                        })
                        added = true
                        continue
                    }
                    // Episódio: casa a série por nome e resolve o id na ficha.
                    const show = visibleShows.find(s => s.name.toLowerCase().includes(wanted))
                    if (!show || !item.season || !item.episode) continue
                    try {
                        const info = await client.getSeriesInfo(String(show.series_id))
                        const episodes = info.episodes?.[String(item.season)] ?? []
                        const found = episodes.find(ep => Number(ep.episode_num) === item.episode)
                        if (!found) continue
                        const progressId = `episode:${found.id}`
                        if (!traktWins(await getEntry(progressId) ?? undefined, item.progress)) continue
                        const pad = (n: number) => String(n).padStart(2, '0')
                        await saveSample({
                            id: progressId,
                            kind: 'episode',
                            streamId: String(found.id),
                            container: found.container_extension || 'mp4',
                            title: `${show.name} · S${pad(item.season)}E${pad(item.episode)}`,
                            cover: show.cover || '',
                            position: item.progress,
                            duration: 100,
                            updatedAt: item.pausedAtMs,
                            fromTraktPct: true,
                        })
                        added = true
                    } catch { /* ficha indisponível — fica pra próxima */ }
                }
                if (added) {
                    const map = await loadProgress()
                    setContinueList(listContinue(map).slice(0, RAIL_MAX))
                }
            }).catch(() => undefined)

            // 🩺 1×/semana: sonda os favoritos e avisa se houver canal morto.
            void (async () => {
                const CHECK_KEY = 'neostream_favcheck_at'
                const last = Number(await AsyncStorage.getItem(CHECK_KEY)) || 0
                if (Date.now() - last < 7 * 24 * 3600_000 || favorites.live.length === 0) return
                await AsyncStorage.setItem(CHECK_KEY, String(Date.now()))
                const targets = live.filter(c => favorites.live.includes(String(c.stream_id))).slice(0, 30)
                const withUrls = await Promise.all(targets.map(async channel => ({
                    channel,
                    streamUrl: await resolvePlayableUrl(client.liveStreamUrl(String(channel.stream_id))).catch(() => ''),
                })))
                const results = await probeAll(withUrls, entry => entry.streamUrl)
                const deadCount = results.filter(r => r.item.streamUrl.startsWith('http') && !r.alive).length
                if (deadCount > 0) {
                    void notifyNow(tf('favCheckNotif', { n: deadCount }), '', '/(tabs)/settings')
                }
            })().catch(() => undefined)

            setFavPosters([
                ...visibleVod.filter(m => favorites.movie.includes(String(m.stream_id))).map(movieRail),
                ...visibleShows.filter(s => favorites.series.includes(String(s.series_id))).map(seriesRail),
            ].slice(0, RAIL_MAX))

            // Rail de favoritos respeita a ORDEM personalizada (setas ↑/↓ na aba TV).
            const liveByIdFav = new Map(live.map(c => [String(c.stream_id), c]))
            setFavChannels(
                favorites.live
                    .flatMap(id => {
                        const channel = liveByIdFav.get(id)
                        return channel && pass(allowedLive, channel.category_id) ? [channel] : []
                    })
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

            // Séries favoritas OU da Minha lista com episódios novos.
            const followedSeries = [...new Set([
                ...favorites.series,
                ...watchlist.filter(item => item.kind === 'series').map(item => item.id),
            ])]
            const fresh = await checkNewEpisodes(visibleShows, followedSeries)
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
            void maybeMonthlySummary()

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

    // 👋 Saudação pela hora + perfil ativo ("Boa noite, Sala 🦖").
    useEffect(() => {
        queueMicrotask(() => {
            void listProfiles().then(profiles => {
                const active = profiles.find(profile => profile.id === activeProfileId())
                const hour = new Date().getHours()
                const key = hour >= 6 && hour < 12 ? 'greetMorning' : hour >= 12 && hour < 18 ? 'greetAfternoon' : 'greetEvening'
                const name = active?.id === GUEST_PROFILE_ID ? t('profileGuest') : active?.name ?? ''
                const icon = active?.icon ? ` ${active.icon}` : ''
                setGreeting(`${t(key)}${name ? `, ${name}` : ''}${icon}`)
            }).catch(() => undefined)
        })
    }, [])

    // Checagem de versão nova (1x/dia, cache no aparelho) — sem loja, é o
    // único jeito de quem instalou o APK ficar sabendo de update.
    useEffect(() => {
        queueMicrotask(() => {
            void checkForUpdate(Constants.expoConfig?.version ?? '0.0.0')
                .then(setUpdate)
                .catch(() => undefined)
            void checkWhatsNew(Constants.expoConfig?.version ?? '')
                .then(setWhatsNew)
                .catch(() => undefined)
            // 7 dias de uso sem pasta na nuvem → um empurrão (uma vez só).
            void (async () => {
                if (await AsyncStorage.getItem('neostream_cloud_nudged')) return
                const firstRaw = await AsyncStorage.getItem('neostream_first_use')
                if (!firstRaw) { await AsyncStorage.setItem('neostream_first_use', String(Date.now())); return }
                if (Date.now() - Number(firstRaw) < 7 * 24 * 3600_000) return
                if (await getCloudBackupDir()) return
                setCloudNudge(true)
            })().catch(() => undefined)
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
    // 🔄 Trakt: sync automático no boot (1x/12h) — cobre quem já estava
    // conectado antes do sync inicial existir.
    useEffect(() => { void autoTraktSync() }, [])

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

    // Toca o arquivo local direto (mesmos params da tela de Downloads).
    const openDownload = (railItem: RailItem) => {
        const item = dlItems.find(entry => `dl${entry.id}` === railItem.key)
        if (!item) return
        const rawKind = item.id.split(':')[0]
        router.push({
            pathname: '/player',
            params: {
                url: item.fileUri,
                title: item.title,
                pid: item.id,
                kind: rawKind === 'rec' ? 'movie' : rawKind,
                sid: item.id.split(':')[1] ?? '',
                container: item.container,
                cover: item.cover,
            },
        })
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

    if (!ready) return <HomeSkeleton />

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
                <TouchableOpacity
                    style={styles.updateBanner}
                    onPress={() => {
                        if (!update.apkUrl) { void Linking.openURL(update.url); return }
                        Alert.alert(tf('updateBanner', { version: update.version }), '', [
                            { text: t('cancel'), style: 'cancel' },
                            { text: t('updateBrowser'), onPress: () => void Linking.openURL(update.url) },
                            {
                                text: t('updateInstall'),
                                onPress: () => {
                                    setCatalogAge(t('updateDownloading'))
                                    void downloadAndInstall(update.apkUrl!, update.version).then(ok => {
                                        if (!ok) void Linking.openURL(update.url)
                                    })
                                },
                            },
                        ])
                    }}
                >
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
            {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {catalogAge ? <Text style={styles.ageText}>{catalogAge}</Text> : null}
            {empty ? (
                <EmptyState icon="home-outline" label={t('homeEmpty')} />
            ) : (
                <View style={{ gap: spacing.md }}>
                    {isTV && (continueList[0] || newMovies[0]) ? (
                        <TvTouchable
                            style={styles.hero}
                            hasTVPreferredFocus
                            accessibilityLabel={t('watchNow')}
                            onPress={() => {
                                const entry = continueList[0]
                                if (entry) { void resume(entry); return }
                                openRailItem(newMovies[0])
                            }}
                        >
                            <Image
                                source={{ uri: continueList[0]?.cover || newMovies[0]?.cover || '' }}
                                style={styles.heroImg}
                                contentFit="cover"
                                transition={200}
                            />
                            <View style={styles.heroShade} />
                            <View style={styles.heroBody}>
                                <Text style={styles.heroKicker}>{continueList[0] ? t('heroContinue') : t('newMoviesRail')}</Text>
                                <Text style={styles.heroTitle} numberOfLines={2}>
                                    {continueList[0]?.title ?? newMovies[0]?.name ?? ''}
                                </Text>
                                <View style={styles.heroBtn}>
                                    <Ionicons name="play" size={18} color="#fff" />
                                    <Text style={styles.heroBtnText}>{t('watchNow')}</Text>
                                </View>
                            </View>
                        </TvTouchable>
                    ) : null}
                    <ContinueRail entries={continueList} onPlay={entry => void resume(entry)} onRemove={confirmRemoveContinue} />
                    {orderedRails(railPrefs).map(key => {
                        switch (key) {
                            case 'watchlist': return <PosterRail key={key} title={t('watchlistRail')} items={watchRail} onPress={openRailItem} />
                            case 'freshEpisodes': return <PosterRail key={key} title={t('newEpisodesRail')} items={freshEpisodes} onPress={openRailItem} />
                            case 'favPosters': return <PosterRail key={key} title={t('favRail')} items={favPosters} onPress={openRailItem} />
                            case 'because': return because
                                ? <PosterRail key={key} title={tf('becauseRail', { title: because.title })} items={because.items} onPress={openRailItem} />
                                : null
                            case 'praAgora': return <ChannelRail key={key} title={t('praAgoraRail')} items={praAgora} onPress={item => void playChannel(item, praAgora)} />
                            case 'recentChannels': return <ChannelRail key={key} title={t('recentChannelsRail')} items={recentChannels} onPress={item => void playChannel(item, recentChannels)} />
                            case 'favChannels': return <ChannelRail key={key} title={t('favChannelsRail')} items={favChannels} onPress={item => void playChannel(item, favChannels)} />
                            case 'downloads': return dlRail.length > 0
                                ? <PosterRail key={key} title={t('downloadsRail')} items={dlRail} onPress={openDownload} />
                                : null
                            case 'newMovies': return <PosterRail key={key} title={t('newMoviesRail')} items={newMovies} onPress={openRailItem} />
                            case 'newSeries': return <PosterRail key={key} title={t('newSeriesRail')} items={newSeries} onPress={openRailItem} />
                        }
                    })}
                    {collections.filter(collection => collection.items.length > 0).map(collection => (
                        <PosterRail
                            key={`col${collection.id}`}
                            title={`📁 ${collection.name}`}
                            items={collection.items.slice(0, RAIL_MAX).map(item => ({
                                key: `${item.kind}${item.id}`, kind: item.kind, id: item.id,
                                name: item.name, cover: item.cover, container: item.container,
                            }))}
                            onPress={openRailItem}
                        />
                    ))}
                </View>
            )}
            {cloudNudge ? (
                <TouchableOpacity
                    style={styles.updateBanner}
                    onPress={() => {
                        setCloudNudge(false)
                        void AsyncStorage.setItem('neostream_cloud_nudged', '1').catch(() => undefined)
                        router.push('/(tabs)/settings')
                    }}
                >
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
                    <Text style={styles.updateText}>{t('cloudNudge')} <Text style={{ color: colors.accent }}>{t('cloudNudgeBtn')}</Text></Text>
                </TouchableOpacity>
            ) : null}
            {whatsNew ? (
                <View style={styles.whatsNewBox}>
                    <View style={styles.whatsNewHeader}>
                        <Text style={styles.whatsNewTitle}>{tf('whatsNewTitle', { version: whatsNew.version })}</Text>
                        <TouchableOpacity accessibilityLabel={t('cancel')} onPress={() => setWhatsNew(null)}>
                            <Ionicons name="close" size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.whatsNewBody}>{whatsNew.notes.slice(0, 900)}</Text>
                </View>
            ) : null}
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
    greeting: { color: colors.text, fontSize: tvSize(20), fontWeight: '800', marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.sm },
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
    updateText: { flex: 1, color: colors.text, fontSize: tvSize(13), fontWeight: '600' },
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
    whatsNewBox: {
        backgroundColor: colors.card,
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: 12,
        marginHorizontal: spacing.lg,
        marginVertical: spacing.sm,
        padding: spacing.md,
        gap: spacing.sm,
    },
    whatsNewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hero: { height: 300, marginHorizontal: spacing.lg, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card },
    heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    heroShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
    heroBody: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.xs },
    heroKicker: { color: colors.accent, fontSize: tvSize(12), fontWeight: '800', textTransform: 'uppercase' },
    heroTitle: { color: colors.text, fontSize: tvSize(24), fontWeight: '800' },
    heroBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        backgroundColor: colors.accent,
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        marginTop: spacing.xs,
    },
    heroBtnText: { color: '#fff', fontSize: tvSize(14), fontWeight: '700' },
    whatsNewTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    whatsNewBody: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
})
