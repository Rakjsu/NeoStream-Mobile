import { Ionicons } from '@expo/vector-icons'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { loadFavorites } from '../../services/favorites'
import { enqueueDownloads } from '../../services/downloads'
import { M3uClient } from '../../services/m3u'
import { notifyAt } from '../../services/notify'
import { hasCatchup } from '../../services/xtream'
import { loadWatchlist, type WatchItem } from '../../services/watchlist'
import { loadParental } from '../../services/parental'
import { guardedCategoryIds } from '../../services/kids'
import { recordRecentChannel } from '../../services/recents'
import { clearSearchTerms, listSearchTerms, recordSearchTerm } from '../../services/searchHistory'
import { cachedFetch, getClient, resolvePlayableUrl } from '../../services/session'
import type { Category, EpgProgram, LiveChannel, SeriesItem, VodMovie } from '../../services/xtream'
import { setZapContext } from '../../services/zap'
import { EmptyState, Loading, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'
import { currentLang, t, tf } from '../../i18n/strings'

const MAX_PER_SECTION = 10

/** Busca global: uma consulta cruza canais, filmes e séries de uma vez. */
export default function SearchTab() {
    const [query, setQuery] = useState('')
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [movies, setMovies] = useState<VodMovie[]>([])
    const [series, setSeries] = useState<SeriesItem[]>([])
    const [allowed, setAllowed] = useState<{ live: Set<string> | null; vod: Set<string> | null; series: Set<string> | null }>({
        live: null, vod: null, series: null,
    })
    const [error, setError] = useState('')
    const [history, setHistory] = useState<string[]>([])
    const [watchlist, setWatchlist] = useState<WatchItem[]>([])
    const [favLive, setFavLive] = useState<string[]>([])
    const [guideHits, setGuideHits] = useState<{ channel: LiveChannel; program: EpgProgram }[]>([])
    // Relógio congelado por render (regra react-hooks/purity).
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])
    // 🎤 Busca por voz: transcrição parcial já vai preenchendo o campo.
    const [listening, setListening] = useState(false)
    useSpeechRecognitionEvent('result', event => {
        const transcript = event.results?.[0]?.transcript ?? ''
        if (transcript) setQuery(transcript)
    })
    useSpeechRecognitionEvent('end', () => setListening(false))
    useSpeechRecognitionEvent('error', () => setListening(false))
    const startVoice = () => {
        void (async () => {
            const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
            if (!permission.granted) return
            setListening(true)
            ExpoSpeechRecognitionModule.start({
                lang: currentLang() === 'pt' ? 'pt-BR' : currentLang() === 'es' ? 'es-ES' : 'en-US',
                interimResults: true,
            })
        })()
    }

    // Filtros por tipo: todos ligados por padrão; um toque foca.
    const [kinds, setKinds] = useState({ channels: true, movies: true, series: true })
    const toggleKind = (key: keyof typeof kinds) => {
        setKinds(current => ({ ...current, [key]: !current[key] }))
    }

    const load = useCallback(async () => {
        try {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const [live, vod, shows, liveCats, vodCats, seriesCats, parental] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels()),
                cachedFetch('vod', () => client.getVodMovies()),
                cachedFetch('series', () => client.getSeries()),
                cachedFetch('live-cats', () => client.getLiveCategories()).catch(() => [] as Category[]),
                cachedFetch('vod-cats', () => client.getVodCategories()).catch(() => [] as Category[]),
                cachedFetch('series-cats', () => client.getSeriesCategories()).catch(() => [] as Category[]),
                loadParental(),
            ])
            setChannels(live)
            setMovies(vod)
            setSeries(shows)
            setWatchlist(await loadWatchlist())
            setFavLive((await loadFavorites()).live)
            setAllowed({
                live: await guardedCategoryIds(liveCats, parental.enabled),
                vod: await guardedCategoryIds(vodCats, parental.enabled),
                series: await guardedCategoryIds(seriesCats, parental.enabled),
            })
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failCatalog'))
            setChannels([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load(); void listSearchTerms().then(setHistory) }) }, [load])

    const q = query.trim().toLowerCase()

    // "No guia hoje": procura o termo na grade dos canais FAVORITOS (até 8),
    // com debounce — cada grade vem do cache SWR (day:<id>).
    useEffect(() => {
        if (q.length < 3 || !channels) { queueMicrotask(() => setGuideHits([])); return }
        const timer = setTimeout(() => {
            void (async () => {
                const client = await getClient()
                // M3U: o XMLTV inteiro já está em memória — procura em TODOS os canais.
                if (client instanceof M3uClient) {
                    const hits = await client.searchGuide(q, 10).catch(() => [])
                    const byId = new Map(channels.map(c => [String(c.stream_id), c]))
                    setGuideHits(hits.flatMap(hit => {
                        const channel = byId.get(hit.channelId)
                        return channel ? [{ channel, program: hit.program }] : []
                    }))
                    return
                }
                if (!client?.getDaySchedule || favLive.length === 0) { setGuideHits([]); return }
                const targets = channels.filter(c => favLive.includes(String(c.stream_id))).slice(0, 8)
                const perChannel = await Promise.all(targets.map(async channel => {
                    const id = String(channel.stream_id)
                    const programs = await cachedFetch(`day:${id}`, async () => await client.getDaySchedule?.(id) ?? [])
                        .catch(() => [] as EpgProgram[])
                    return programs
                        .filter(program => program.title.toLowerCase().includes(q))
                        .map(program => ({ channel, program }))
                }))
                setGuideHits(perChannel.flat().slice(0, 10))
            })()
        }, 500)
        return () => clearTimeout(timer)
    }, [q, channels, favLive])

    const pressGuideHit = (channel: LiveChannel, program: EpgProgram) => {
        const now = nowMs
        if (program.startMs <= now && now < program.endMs) { void playChannel(channel); return }
        if (program.endMs <= now) {
            void (async () => {
                const client = await getClient()
                if (!client?.catchupUrl || !hasCatchup(channel)) return
                const durationMin = Math.max(1, Math.round((program.endMs - program.startMs) / 60_000))
                const url = client.catchupUrl(String(channel.stream_id), program.startMs, durationMin, program.id)
                if (!url) return
                Alert.alert(`⏪ ${program.title}`, channel.name, [
                    { text: t('cancel'), style: 'cancel' },
                    ...(url.includes('.m3u8') ? [] : [{
                        text: t('catchupDlBtn'),
                        onPress: () => {
                            void (async () => {
                                await enqueueDownloads([{
                                    id: `rec:catchup:${channel.stream_id}:${program.startMs}`,
                                    url: await resolvePlayableUrl(url),
                                    title: `⏪ ${program.title}`,
                                    cover: channel.stream_icon || '',
                                    container: 'ts',
                                }])
                                Alert.alert(t('catchupDlQueued'))
                            })()
                        },
                    }]),
                    { text: t('catchupPlayBtn'), onPress: () => router.push({ pathname: '/player', params: { url, title: `⏪ ${program.title}` } }) },
                ])
            })()
            return
        }
        void notifyAt(tf('remindNotif', { title: program.title }), channel.name, '/(tabs)/search', program.startMs)
            .then(ok => { if (ok) Alert.alert(t('remindSet')) })
    }
    const results = useMemo(() => {
        if (!q || !channels) return { channels: [], movies: [], series: [], watchlist: [] as WatchItem[] }
        const inSet = (set: Set<string> | null, categoryId?: string) =>
            !set || !categoryId || set.has(categoryId)
        return {
            channels: !kinds.channels ? [] : channels
                .filter(c => c.name.toLowerCase().includes(q) && inSet(allowed.live, c.category_id))
                .slice(0, MAX_PER_SECTION),
            watchlist: watchlist
                .filter(item => item.name.toLowerCase().includes(q)
                    && ((item.kind === 'movie' && kinds.movies) || (item.kind === 'series' && kinds.series)))
                .slice(0, MAX_PER_SECTION),
            movies: !kinds.movies ? [] : movies
                .filter(m => m.name.toLowerCase().includes(q) && inSet(allowed.vod, m.category_id))
                .slice(0, MAX_PER_SECTION),
            series: !kinds.series ? [] : series
                .filter(s => s.name.toLowerCase().includes(q) && inSet(allowed.series, s.category_id))
                .slice(0, MAX_PER_SECTION),
        }
    }, [q, channels, movies, series, allowed, kinds, watchlist])

    const remember = () => {
        void recordSearchTerm(query).then(listSearchTerms).then(setHistory)
    }

    const playChannel = async (channel: LiveChannel) => {
        const client = await getClient()
        if (!client) return
        remember()
        setZapContext(results.channels.map(c => ({ id: String(c.stream_id), name: c.name, num: c.num })), String(channel.stream_id))
        void recordRecentChannel({ id: String(channel.stream_id), name: channel.name, logo: channel.stream_icon || '' })
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
        })
    }

    if (channels === null) return <Loading label={t('loadingCatalog')} />

    const total = results.channels.length + results.movies.length + results.series.length
        + results.watchlist.length + guideHits.length

    return (
        <View style={styles.root}>
            <View style={styles.searchRow}>
                <View style={{ flex: 1 }}>
                    <SearchBar value={query} onChange={setQuery} placeholder={t('searchAll')} />
                </View>
                <TouchableOpacity
                    style={[styles.micBtn, listening && styles.micBtnOn]}
                    accessibilityLabel={t('voiceSearch')}
                    onPress={startVoice}
                >
                    <Ionicons name={listening ? 'mic' : 'mic-outline'} size={20} color={listening ? '#fff' : colors.textDim} />
                </TouchableOpacity>
            </View>
            <View style={styles.kindRow}>
                {([
                    ['channels', t('secChannels')],
                    ['movies', t('secMovies')],
                    ['series', t('secSeries')],
                ] as const).map(([key, label]) => (
                    <TouchableOpacity
                        key={key}
                        style={[styles.kindChip, kinds[key] && styles.kindChipOn]}
                        onPress={() => toggleKind(key)}
                    >
                        <Text style={[styles.kindText, kinds[key] && styles.kindTextOn]}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={total === 0 ? { flexGrow: 1 } : undefined}>
                {!q ? (
                    history.length > 0 ? (
                        <View style={styles.historyBox}>
                            <View style={styles.historyHeader}>
                                <Text style={styles.section}>{t('recentSearches')}</Text>
                                <TouchableOpacity
                                    style={styles.historyClear}
                                    accessibilityLabel={t('a11yClear')}
                                    onPress={() => { void clearSearchTerms(); setHistory([]) }}
                                >
                                    <Ionicons name="close-circle-outline" size={18} color={colors.textDim} />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.historyChips}>
                                {history.map(term => (
                                    <TouchableOpacity key={term} style={styles.historyChip} onPress={() => setQuery(term)}>
                                        <Text style={styles.historyChipText}>{term}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <EmptyState icon="search" label={t('searchPrompt')} />
                    )
                ) : total === 0 ? (
                    <EmptyState icon="search" label={t('searchNothing')} />
                ) : (
                    <>
                        {results.channels.length > 0 ? <Text style={styles.section}>{t('secChannels')}</Text> : null}
                        {results.channels.map(channel => (
                            <TouchableOpacity key={`c${channel.stream_id}`} style={styles.row} onPress={() => void playChannel(channel)}>
                                {channel.stream_icon ? (
                                    <Image source={{ uri: channel.stream_icon }} style={styles.thumb} contentFit="contain" transition={120} />
                                ) : (
                                    <View style={[styles.thumb, styles.thumbFallback]}>
                                        <Ionicons name="tv-outline" size={16} color={colors.textDim} />
                                    </View>
                                )}
                                <Text style={styles.name} numberOfLines={1}>{channel.name}</Text>
                                <Ionicons name="play" size={16} color={colors.accent} />
                            </TouchableOpacity>
                        ))}

                        {results.watchlist.length > 0 ? <Text style={styles.section}>{t('watchlistRail')}</Text> : null}
                        {results.watchlist.map(item => (
                            <TouchableOpacity
                                key={`w${item.kind}${item.id}`}
                                style={styles.row}
                                onPress={() => {
                                    remember()
                                    if (item.kind === 'movie') {
                                        router.push({
                                            pathname: '/movie/[id]',
                                            params: { id: item.id, name: item.name, cover: item.cover, container: item.container || 'mp4' },
                                        })
                                    } else {
                                        router.push({ pathname: '/series/[id]', params: { id: item.id, name: item.name, cover: item.cover } })
                                    }
                                }}
                            >
                                <Ionicons name="bookmark" size={16} color={colors.accent} />
                                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                            </TouchableOpacity>
                        ))}

                        {guideHits.length > 0 ? <Text style={styles.section}>{t('secGuideHits')}</Text> : null}
                        {guideHits.map(({ channel, program }) => {
                            const time = new Date(program.startMs)
                            const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
                            const liveNow = program.startMs <= nowMs && nowMs < program.endMs
                            return (
                                <TouchableOpacity
                                    key={`g${channel.stream_id}${program.startMs}`}
                                    style={styles.row}
                                    onPress={() => pressGuideHit(channel, program)}
                                >
                                    <Ionicons
                                        name={liveNow ? 'radio-outline' : program.endMs <= nowMs ? 'play-back-circle-outline' : 'alarm-outline'}
                                        size={16}
                                        color={liveNow ? colors.accent : colors.textDim}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.name} numberOfLines={1}>{program.title}</Text>
                                        <Text style={styles.guideMeta} numberOfLines={1}>{hhmm} · {channel.name}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                                </TouchableOpacity>
                            )
                        })}

                        {results.movies.length > 0 ? <Text style={styles.section}>{t('secMovies')}</Text> : null}
                        {results.movies.map(movie => (
                            <TouchableOpacity
                                key={`m${movie.stream_id}`}
                                style={styles.row}
                                onPress={() => {
                                    remember()
                                    router.push({
                                    pathname: '/movie/[id]',
                                    params: {
                                        id: String(movie.stream_id), name: movie.name,
                                        cover: movie.stream_icon || '', container: movie.container_extension || 'mp4',
                                    },
                                    })
                                }}
                            >
                                {movie.stream_icon ? (
                                    <Image source={{ uri: movie.stream_icon }} style={styles.poster} contentFit="cover" transition={120} />
                                ) : (
                                    <View style={[styles.poster, styles.thumbFallback]}>
                                        <Ionicons name="film-outline" size={16} color={colors.textDim} />
                                    </View>
                                )}
                                <Text style={styles.name} numberOfLines={1}>{movie.name}</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                            </TouchableOpacity>
                        ))}

                        {results.series.length > 0 ? <Text style={styles.section}>{t('secSeries')}</Text> : null}
                        {results.series.map(show => (
                            <TouchableOpacity
                                key={`s${show.series_id}`}
                                style={styles.row}
                                onPress={() => {
                                    remember()
                                    router.push({
                                        pathname: '/series/[id]',
                                        params: { id: String(show.series_id), name: show.name, cover: show.cover || '' },
                                    })
                                }}
                            >
                                {show.cover ? (
                                    <Image source={{ uri: show.cover }} style={styles.poster} contentFit="cover" transition={120} />
                                ) : (
                                    <View style={[styles.poster, styles.thumbFallback]}>
                                        <Ionicons name="albums-outline" size={16} color={colors.textDim} />
                                    </View>
                                )}
                                <Text style={styles.name} numberOfLines={1}>{show.name}</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                            </TouchableOpacity>
                        ))}
                    </>
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.sm },
    error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
    section: {
        color: colors.textDim,
        fontSize: 13,
        textTransform: 'uppercase',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 8,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    thumb: { width: 36, height: 36, borderRadius: 6, backgroundColor: colors.card },
    poster: { width: 30, height: 45, borderRadius: 4, backgroundColor: colors.card },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    name: { flex: 1, color: colors.text, fontSize: 14 },
    guideMeta: { color: colors.textDim, fontSize: 12 },
    historyBox: { paddingBottom: spacing.lg },
    kindRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.lg, gap: spacing.sm },
    micBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    micBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    kindChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
    },
    kindChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    kindText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
    kindTextOn: { color: colors.accent },
    historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.md },
    historyClear: { padding: spacing.sm },
    historyChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
    },
    historyChip: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
    },
    historyChipText: { color: colors.text, fontSize: 13 },
})
