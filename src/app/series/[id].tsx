import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, SectionList, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { castAvailable, castToCurrentSession, showCastPicker } from '../../services/cast'
import { activeProgress, enqueueDownloads, listActiveDownloads, listDownloads, listQueuedIds, removeDownload, startDownload, subscribeDownloads, type DownloadRequest } from '../../services/downloads'
import { tapLight } from '../../services/haptics'
import { setEpisodeQueue } from '../../services/episodeQueue'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import {
    buildProgressId, loadProgress, loadWatched, markWatched, pickNextEpisode,
    progressPct, removeEntry, unmarkWatched, type ProgressEntry,
} from '../../services/progress'
import { getClient, resolvePlayableUrl } from '../../services/session'
import { WebView } from 'react-native-webview'
import { fetchTmdbDetails } from '../../services/tmdb'
import { hasItem, loadWatchlist, toggleWatchlist } from '../../services/watchlist'
import type { Episode } from '../../services/xtream'
import { EmptyState, Loading } from '../../ui/components'
import { colors, spacing } from '../../ui/theme'
import { currentLang, t, tf } from '../../i18n/strings'

interface Season {
    title: string
    seasonNum: string
    data: Episode[]
}

export default function SeriesDetail() {
    const { id, name, cover } = useLocalSearchParams<{ id: string; name?: string; cover?: string }>()
    const [seasons, setSeasons] = useState<Season[] | null>(null)
    const [plot, setPlot] = useState('')
    const [infoCover, setInfoCover] = useState('')
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [watched, setWatched] = useState<Set<string>>(new Set())
    const [progress, setProgress] = useState<Record<string, ProgressEntry>>({})
    const [error, setError] = useState('')
    // pids baixados/baixando (re-renderiza a cada tick de progresso).
    const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
    const [activeDl, setActiveDl] = useState<Record<string, number>>({})
    const [queued, setQueued] = useState<Set<string>>(new Set())
    const [hideSeen, setHideSeen] = useState(false)
    const [inList, setInList] = useState(false)
    const [trailer, setTrailer] = useState('')
    const [trailerOpen, setTrailerOpen] = useState(false)

    useEffect(() => {
        let alive = true
        void loadFavorites().then(favs => { if (alive) setFavorites(favs) })
        void loadWatchlist().then(list => { if (alive) setInList(hasItem(list, 'series', String(id))) })
        void (async () => {
            try {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const info = await client.getSeriesInfo(String(id))
                const episodes = info.episodes ?? {}
                const list: Season[] = Object.keys(episodes)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(season => ({ title: tf('seasonN', { n: season }), seasonNum: season, data: episodes[season] ?? [] }))
                if (alive) {
                    setSeasons(list)
                    setPlot(info.info?.plot?.trim() ?? '')
                    setInfoCover(info.info?.cover ?? '')
                }
                // TMDB (opcional): sinopse/capa quando o provedor não manda.
                const tmdb = await fetchTmdbDetails('tv', String(name ?? ''), currentLang())
                if (alive && tmdb) {
                    setPlot(current => current || tmdb.plot)
                    setInfoCover(current => current || tmdb.cover)
                    if (tmdb.trailer) setTrailer(tmdb.trailer)
                }
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : t('failSeries'))
                    setSeasons([])
                }
            }
        })()
        return () => { alive = false }
    }, [id, name])

    useEffect(() => {
        const refreshDl = () => {
            const activeMap: Record<string, number> = {}
            for (const item of listActiveDownloads()) activeMap[item.id] = Math.round(item.progress * 100)
            setActiveDl(activeMap)
            setQueued(new Set(listQueuedIds()))
            void listDownloads().then(done => setDownloaded(new Set(done.map(d => d.id))))
        }
        queueMicrotask(refreshDl)
        return subscribeDownloads(refreshDl)
    }, [])

    // ✓ e barras de progresso atualizam quando a tela volta do player.
    useFocusEffect(useCallback(() => {
        queueMicrotask(() => {
            void loadWatched().then(set => setWatched(new Set(set)))
            void loadProgress().then(map => setProgress({ ...map }))
        })
    }, []))

    const canCast = castAvailable()

    /** Manda o "Continuar" pra TV (com sessão; senão só abre o seletor). */
    const castNext = (episode: Episode, seasonNum: string) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            const container = episode.container_extension || 'mp4'
            const epTitle = episode.title || `T${seasonNum}E${episode.episode_num}`
            const url = await resolvePlayableUrl(client.seriesStreamUrl(episode.id, container))
            const sent = await castToCurrentSession(
                url, name ? `${name} · ${epTitle}` : epTitle, infoCover || cover || '', false)
            if (!sent) await showCastPicker()
        })()
    }

    // Segurar o episódio alterna visto/não visto (marcar limpa o progresso).
    const toggleWatched = (episodePid: string) => {
        tapLight()
        void (async () => {
            const set = await loadWatched()
            if (set.has(episodePid)) await unmarkWatched(episodePid)
            else {
                await markWatched(episodePid)
                await removeEntry(episodePid)
            }
            setWatched(new Set(await loadWatched()))
            setProgress({ ...(await loadProgress()) })
        })()
    }

    const play = async (episode: Episode, seasonNum: string) => {
        const client = await getClient()
        if (!client) return
        const container = episode.container_extension || 'mp4'
        const epTitle = episode.title || `T${seasonNum}E${episode.episode_num}`
        // Fila achatada da série inteira — o player emenda o próximo ao terminar.
        setEpisodeQueue((seasons ?? []).flatMap(season => season.data.map(item => {
            const itemTitle = item.title || `T${season.seasonNum}E${item.episode_num}`
            return {
                pid: buildProgressId('episode', item.id),
                sid: String(item.id),
                container: item.container_extension || 'mp4',
                title: name ? `${name} · ${itemTitle}` : itemTitle,
                cover: infoCover || cover || '',
            }
        })))
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
                cover: infoCover || cover || '',
            },
        })
    }

    // Long-press no cabeçalho: marca/desmarca a temporada inteira como vista.
    const toggleSeasonSeen = (season: Season) => {
        const pids = season.data.map(episode => buildProgressId('episode', episode.id))
        const allSeen = pids.length > 0 && pids.every(pid => watched.has(pid))
        Alert.alert(
            tf('seasonSeenTitle', { s: season.seasonNum }),
            tf(allSeen ? 'seasonUnseenMsg' : 'seasonSeenMsg', { n: pids.length }),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: allSeen ? t('unmark') : t('mark'),
                    onPress: () => {
                        void (async () => {
                            for (const pid of pids) {
                                if (allSeen) await unmarkWatched(pid)
                                else {
                                    await markWatched(pid)
                                    await removeEntry(pid)
                                }
                            }
                            setWatched(new Set(await loadWatched()))
                            setProgress({ ...(await loadProgress()) })
                        })()
                    },
                },
            ],
        )
    }

    const downloadSeason = (season: Season) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            const requests: DownloadRequest[] = season.data.map(episode => ({
                id: buildProgressId('episode', episode.id),
                url: client.seriesStreamUrl(episode.id, episode.container_extension || 'mp4'),
                title: `${name ?? ''} · ${episode.title || `T${season.seasonNum}E${episode.episode_num}`}`,
                cover: infoCover || cover || '',
                container: episode.container_extension || 'mp4',
            }))
            await enqueueDownloads(requests)
        })()
    }

    // Próximo a assistir, na ordem das temporadas (em andamento ganha).
    const flat = (seasons ?? []).flatMap(season => season.data.map(ep => ({ id: ep.id, ep, seasonNum: season.seasonNum })))
    const next = pickNextEpisode(flat, watched, progress)

    const fav = isFavorite(favorites, 'series', String(id))
    const headerCover = infoCover || cover || ''

    const header = (
        <View style={styles.header}>
            <View style={styles.hero}>
                {headerCover ? (
                    <Image source={{ uri: headerCover }} style={styles.cover} contentFit="cover" transition={120} />
                ) : (
                    <View style={[styles.cover, styles.coverFallback]}>
                        <Ionicons name="albums-outline" size={32} color={colors.textDim} />
                    </View>
                )}
                <View style={styles.heroInfo}>
                    <Text style={styles.seriesName}>{name ?? ''}</Text>
                    {plot ? <Text style={styles.plot} numberOfLines={5}>{plot}</Text> : null}
                    <View style={styles.headerBtns}>
                        <TouchableOpacity
                            style={[styles.favBtn, fav && styles.favBtnOn]}
                            onPress={() => { tapLight(); void persistToggle('series', String(id)).then(setFavorites) }}
                        >
                            <Ionicons name={fav ? 'heart' : 'heart-outline'} size={16} color={fav ? '#fff' : colors.danger} />
                            <Text style={[styles.favText, fav && styles.favTextOn]}>{fav ? t('favOn') : t('favBtn')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.seenBtn}
                            accessibilityLabel={t('a11yShare')}
                            onPress={() => {
                                const link = `neostream://series/${id}?name=${encodeURIComponent(name ?? '')}`
                                void Share.share({ message: `${tf('shareContent', { name: name ?? '' })}\n${link}` }).catch(() => undefined)
                            }}
                        >
                            <Ionicons name="share-social-outline" size={16} color={colors.textDim} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.seenBtn} onPress={() => setHideSeen(current => !current)}>
                            <Ionicons name={hideSeen ? 'eye-off' : 'eye-outline'} size={16} color={colors.textDim} />
                            <Text style={styles.seenText}>{hideSeen ? t('showSeen') : t('hideSeen')}</Text>
                        </TouchableOpacity>
                        {trailer ? (
                            <TouchableOpacity style={styles.seenBtn} accessibilityLabel={t('trailerBtn')} onPress={() => setTrailerOpen(true)}>
                                <Ionicons name="logo-youtube" size={16} color={colors.textDim} />
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                            style={styles.seenBtn}
                            accessibilityLabel={t('watchlistBtn')}
                            onPress={() => {
                                tapLight()
                                void toggleWatchlist({
                                    kind: 'series', id: String(id), name: name ?? '',
                                    cover: infoCover || cover || '', addedAt: Date.now(),
                                }).then(list => setInList(hasItem(list, 'series', String(id))))
                            }}
                        >
                            <Ionicons name={inList ? 'bookmark' : 'bookmark-outline'} size={16} color={inList ? colors.accent : colors.textDim} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            {next ? (
                <View style={styles.nextRow}>
                    <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={() => void play(next.ep, next.seasonNum)}>
                        <Ionicons name="play" size={16} color="#fff" />
                        <Text style={styles.nextText}>
                            {tf('continueEp', { s: next.seasonNum, e: next.ep.episode_num })}
                        </Text>
                    </TouchableOpacity>
                    {canCast ? (
                        <TouchableOpacity
                            style={styles.nextCast}
                            accessibilityLabel={t('a11yCast')}
                            onPress={() => castNext(next.ep, next.seasonNum)}
                        >
                            <Ionicons name="tv-outline" size={18} color={colors.text} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            ) : null}
        </View>
    )

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: name ?? 'Série' }} />
            {trailerOpen && trailer ? (
                <View style={styles.trailerModal}>
                    <WebView
                        style={{ flex: 1, backgroundColor: '#000' }}
                        source={{
                            uri: trailer.replace(/.*(?:v=|youtu\.be\/)([\w-]{6,})[^\w-]?.*/, 'https://www.youtube.com/embed/$1?autoplay=1'),
                            headers: { Referer: 'https://neostream.app/' },
                        }}
                        allowsFullscreenVideo
                        mediaPlaybackRequiresUserAction={false}
                    />
                    <TouchableOpacity style={styles.trailerClose} accessibilityLabel={t('trailerClose')} onPress={() => setTrailerOpen(false)}>
                        <Ionicons name="close-circle" size={34} color="#fff" />
                    </TouchableOpacity>
                </View>
            ) : null}
            {seasons === null ? (
                <Loading label={t('loadingEpisodes')} />
            ) : (
                <SectionList
                    sections={hideSeen
                        ? seasons
                            .map(season => ({ ...season, data: season.data.filter(ep => !watched.has(buildProgressId('episode', ep.id))) }))
                            .filter(season => season.data.length > 0)
                        : seasons}
                    keyExtractor={item => String(item.id)}
                    ListHeaderComponent={header}
                    ListEmptyComponent={<EmptyState icon="albums-outline" label={error || t('noEpisodes')} />}
                    contentContainerStyle={seasons.length === 0 ? { flexGrow: 1 } : undefined}
                    renderSectionHeader={({ section }) => (
                        <View style={styles.seasonRow}>
                            <Text
                                style={styles.season}
                                onLongPress={() => toggleSeasonSeen(section)}
                            >
                                {section.title}
                            </Text>
                            <TouchableOpacity
                                style={styles.seasonDl}
                                accessibilityLabel={t('a11yDlSeason')}
                                onPress={() => downloadSeason(section)}
                            >
                                <Ionicons name="cloud-download-outline" size={16} color={colors.accent} />
                            </TouchableOpacity>
                        </View>
                    )}
                    renderItem={({ item, section }) => {
                        const pid = buildProgressId('episode', item.id)
                        const seen = watched.has(pid)
                        const entry = progress[pid]
                        const pct = entry ? progressPct(entry.position, entry.duration) : 0
                        return (
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => void play(item, section.seasonNum)}
                                onLongPress={() => toggleWatched(pid)}
                                delayLongPress={350}
                            >
                                <View style={styles.epBadge}>
                                    <Text style={styles.epNum}>{item.episode_num}</Text>
                                </View>
                                <View style={styles.epInfo}>
                                    <Text style={[styles.epTitle, seen && styles.epTitleSeen]} numberOfLines={1}>
                                        {item.title || tf('episodeN', { n: item.episode_num })}
                                    </Text>
                                    {pct > 0 ? (
                                        <View style={styles.epTrack}>
                                            <View style={[styles.epFill, { width: `${pct}%` }]} />
                                        </View>
                                    ) : null}
                                </View>
                                <TouchableOpacity
                                    style={styles.dlBtn}
                                    accessibilityLabel={t('a11yDownload')}
                                    onPress={() => {
                                        if (downloaded.has(pid)) {
                                            Alert.alert(t('dlTitle'), t('dlEpisodeDone'), [
                                                { text: t('ok'), style: 'cancel' },
                                                { text: t('delete'), style: 'destructive', onPress: () => void removeDownload(pid) },
                                            ])
                                            return
                                        }
                                        if (activeProgress(pid) !== null) return
                                        void (async () => {
                                            const client = await getClient()
                                            if (!client) return
                                            const container = item.container_extension || 'mp4'
                                            await startDownload({
                                                id: pid,
                                                url: client.seriesStreamUrl(item.id, container),
                                                title: `${name ?? ''} · ${item.title || `T${section.seasonNum}E${item.episode_num}`}`,
                                                cover: infoCover || cover || '',
                                                container,
                                            }).catch(() => Alert.alert(t('dlTitle'), t('dlEpisodeFail')))
                                        })()
                                    }}
                                >
                                    {downloaded.has(pid) ? (
                                        <Ionicons name="cloud-done" size={16} color={colors.live} />
                                    ) : activeDl[pid] !== undefined ? (
                                        <Text style={styles.dlPct}>{activeDl[pid]}%</Text>
                                    ) : queued.has(pid) ? (
                                        <Ionicons name="hourglass-outline" size={16} color={colors.accent} />
                                    ) : (
                                        <Ionicons name="cloud-download-outline" size={16} color={colors.textDim} />
                                    )}
                                </TouchableOpacity>
                                {seen ? (
                                    <Ionicons name="checkmark-circle" size={18} color={colors.live} />
                                ) : (
                                    <Ionicons name="play" size={18} color={colors.accent} />
                                )}
                            </TouchableOpacity>
                        )
                    }}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    trailerModal: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000',
        zIndex: 20,
    },
    trailerClose: { position: 'absolute', top: 40, right: 16 },
    root: { flex: 1, backgroundColor: colors.bg },
    header: { padding: spacing.lg, gap: spacing.md },
    hero: { flexDirection: 'row', gap: spacing.lg },
    cover: { width: 96, aspectRatio: 2 / 3, borderRadius: 10, backgroundColor: colors.card },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    heroInfo: { flex: 1, gap: spacing.sm },
    seriesName: { color: colors.text, fontSize: 18, fontWeight: '700' },
    plot: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
    favBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderColor: colors.danger,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
    },
    favBtnOn: { backgroundColor: colors.danger },
    favText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    favTextOn: { color: '#fff' },
    nextRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
    nextCast: {
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 10,
        paddingVertical: 12,
    },
    nextText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    season: {
        flex: 1,
        color: colors.textDim,
        fontSize: 13,
        textTransform: 'uppercase',
        paddingVertical: spacing.sm,
    },
    seasonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.lg,
    },
    seasonDl: { padding: spacing.sm },
    headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    seenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
    },
    seenText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
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
    epInfo: { flex: 1, gap: 4 },
    epTitle: { color: colors.text, fontSize: 15 },
    epTitleSeen: { color: colors.textDim },
    epTrack: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
    dlBtn: { padding: spacing.xs, minWidth: 34, alignItems: 'center' },
    dlPct: { color: colors.accent, fontSize: 11, fontWeight: '700' },
    epFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
})
