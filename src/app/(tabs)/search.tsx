import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { allowedCategoryIds, loadParental } from '../../services/parental'
import { recordRecentChannel } from '../../services/recents'
import { clearSearchTerms, listSearchTerms, recordSearchTerm } from '../../services/searchHistory'
import { cachedFetch, getClient } from '../../services/session'
import type { Category, LiveChannel, SeriesItem, VodMovie } from '../../services/xtream'
import { setZapContext } from '../../services/zap'
import { EmptyState, Loading, SearchBar } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'
import { t } from '../../i18n/strings'

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
            setAllowed({
                live: allowedCategoryIds(liveCats, parental.enabled),
                vod: allowedCategoryIds(vodCats, parental.enabled),
                series: allowedCategoryIds(seriesCats, parental.enabled),
            })
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('failCatalog'))
            setChannels([])
        }
    }, [])

    useEffect(() => { queueMicrotask(() => { void load(); void listSearchTerms().then(setHistory) }) }, [load])

    const q = query.trim().toLowerCase()
    const results = useMemo(() => {
        if (!q || !channels) return { channels: [], movies: [], series: [] }
        const inSet = (set: Set<string> | null, categoryId?: string) =>
            !set || !categoryId || set.has(categoryId)
        return {
            channels: !kinds.channels ? [] : channels
                .filter(c => c.name.toLowerCase().includes(q) && inSet(allowed.live, c.category_id))
                .slice(0, MAX_PER_SECTION),
            movies: !kinds.movies ? [] : movies
                .filter(m => m.name.toLowerCase().includes(q) && inSet(allowed.vod, m.category_id))
                .slice(0, MAX_PER_SECTION),
            series: !kinds.series ? [] : series
                .filter(s => s.name.toLowerCase().includes(q) && inSet(allowed.series, s.category_id))
                .slice(0, MAX_PER_SECTION),
        }
    }, [q, channels, movies, series, allowed, kinds])

    const remember = () => {
        void recordSearchTerm(query).then(listSearchTerms).then(setHistory)
    }

    const playChannel = async (channel: LiveChannel) => {
        const client = await getClient()
        if (!client) return
        remember()
        setZapContext(results.channels.map(c => ({ id: String(c.stream_id), name: c.name })), String(channel.stream_id))
        void recordRecentChannel({ id: String(channel.stream_id), name: channel.name, logo: channel.stream_icon || '' })
        router.push({
            pathname: '/player',
            params: { url: client.liveStreamUrl(channel.stream_id), title: channel.name, live: '1' },
        })
    }

    if (channels === null) return <Loading label={t('loadingCatalog')} />

    const total = results.channels.length + results.movies.length + results.series.length

    return (
        <View style={styles.root}>
            <SearchBar value={query} onChange={setQuery} placeholder={t('searchAll')} />
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
    historyBox: { paddingBottom: spacing.lg },
    kindRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
