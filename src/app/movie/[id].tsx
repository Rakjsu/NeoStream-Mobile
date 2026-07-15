import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import { Image } from 'expo-image'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { castAvailable, castToCurrentSession, onCastSessionStarted, showCastPicker } from '../../services/cast'
import { activeProgress, getDownload, removeDownload, startDownload, subscribeDownloads } from '../../services/downloads'
import { tapLight } from '../../services/haptics'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { listCollections, toggleInCollection } from '../../services/collections'
import { buildProgressId, getEntry, progressPct, resumePosition } from '../../services/progress'
import { getClient, resolvePlayableUrl , cachedFetch } from '../../services/session'
import type { VodMovie , VodDetails } from '../../services/xtream'
import { findMovieVersions, type MovieVersion } from '../../services/movieVersions'
import { emptyVodDetails, fetchTmdbDetails, mergeDetails } from '../../services/tmdb'
import { hasItem, loadWatchlist, toggleWatchlist } from '../../services/watchlist'
import { colors, spacing } from '../../ui/theme'
import { tvSize } from '../../ui/tv'
import { currentLang, t, tf } from '../../i18n/strings'

/** Ficha do filme: capa, sinopse e metadados antes de dar o play. */
export default function MovieDetail() {
    const { id, name, cover, container } = useLocalSearchParams<{
        id: string
        name?: string
        cover?: string
        container?: string
    }>()
    const [details, setDetails] = useState<VodDetails | null>(null)
    const [favorites, setFavorites] = useState<Favorites>(emptyFavorites())
    const [resumePct, setResumePct] = useState(0)
    const [dlState, setDlState] = useState<'none' | 'active' | 'done'>('none')
    const [dlPct, setDlPct] = useState(0)
    const [inList, setInList] = useState(false)
    const [versions, setVersions] = useState<MovieVersion<VodMovie>[]>([])
    const [trailerOpen, setTrailerOpen] = useState(false)

    const pid = buildProgressId('movie', String(id))
    const canCast = castAvailable()
    // Sem sessão: guarda o pedido, abre o seletor e manda ao conectar.
    const pendingCastRef = useRef<{ url: string; startAt: number } | null>(null)

    const castNow = async (): Promise<void> => {
        const client = await getClient()
        if (!client) return
        const url = await resolvePlayableUrl(client.vodStreamUrl(String(id), String(container || 'mp4')))
        const entry = await getEntry(pid)
        const startAt = entry ? resumePosition(entry) : 0
        const sent = await castToCurrentSession(url, name ?? '', details?.cover || cover || '', false, startAt)
        if (!sent) {
            pendingCastRef.current = { url, startAt }
            await showCastPicker()
        }
    }

    useEffect(() => {
        if (!canCast) return
        return onCastSessionStarted(() => {
            const pending = pendingCastRef.current
            if (!pending) return
            pendingCastRef.current = null
            void castToCurrentSession(pending.url, name ?? '', details?.cover || cover || '', false, pending.startAt)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCast, details])

    useEffect(() => {
        const refreshDl = () => {
            const progress = activeProgress(pid)
            if (progress !== null) { setDlState('active'); setDlPct(Math.round(progress * 100)); return }
            void getDownload(pid).then(item => setDlState(item ? 'done' : 'none'))
        }
        queueMicrotask(refreshDl)
        return subscribeDownloads(refreshDl)
    }, [pid])

    useEffect(() => {
        let alive = true
        void loadFavorites().then(favs => { if (alive) setFavorites(favs) })
        void getEntry(pid).then(entry => {
            if (alive && entry && resumePosition(entry) > 0) {
                setResumePct(progressPct(entry.position, entry.duration))
            }
        })
        void loadWatchlist().then(list => { if (alive) setInList(hasItem(list, 'movie', String(id))) })
        void (async () => {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const info = await client.getVodDetails(String(id)).catch(() => null)
            if (alive && info) setDetails(info)
            // Outras versões do mesmo filme (4K/Legendado…) pro seletor.
            const all = await cachedFetch('vod', () => client.getVodMovies()).catch(() => [] as VodMovie[])
            const found = findMovieVersions({ stream_id: String(id), name: String(name ?? '') }, all
                .map(movie => ({ ...movie, stream_id: String(movie.stream_id), name: movie.name })))
            if (alive && found.length > 1) setVersions(found as MovieVersion<VodMovie>[])

            // TMDB (opcional): preenche o que o provedor deixou em branco.
            const tmdb = await fetchTmdbDetails('movie', String(name ?? ''), currentLang())
            if (alive && tmdb) setDetails(current => mergeDetails(current ?? info ?? emptyVodDetails(), tmdb))
        })()
        return () => { alive = false }
    }, [id, pid, name])

    const play = async () => {
        const client = await getClient()
        if (!client) return
        router.push({
            pathname: '/player',
            params: {
                url: client.vodStreamUrl(String(id), String(container || 'mp4')),
                title: name ?? '',
                pid,
                kind: 'movie',
                sid: String(id),
                container: String(container || 'mp4'),
                cover: details?.cover || cover || '',
            },
        })
    }

    const fav = isFavorite(favorites, 'movie', String(id))

    // 📁 Entra/sai de uma pasta (as pastas nascem em Ajustes → Início).
    const addToCollection = () => {
        void listCollections().then(collections => {
            if (collections.length === 0) { Alert.alert(t('colNone')); return }
            Alert.alert(t('colPickTitle'), '', [
                { text: t('cancel'), style: 'cancel' },
                ...collections.map(collection => ({
                    text: `📁 ${collection.name}`,
                    onPress: () => {
                        void toggleInCollection(collection.id, {
                            kind: 'movie', id: String(id), name: name ?? '',
                            cover: String(cover ?? ''), container: String(container || 'mp4'),
                        }).then(added => Alert.alert(added ? tf('colAdded', { name: collection.name }) : tf('colRemoved', { name: collection.name })))
                    },
                })),
            ])
        })
    }
    const coverUri = details?.cover || cover || ''
    const year = details?.releaseDate ? details.releaseDate.slice(0, 4) : ''
    const meta = [year, details?.genre, details?.duration, details?.rating ? `★ ${details.rating}` : '']
        .filter(Boolean)
        .join('  ·  ')

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Stack.Screen options={{ title: '' }} />
            <View style={styles.hero}>
                {coverUri ? (
                    <Image source={{ uri: coverUri }} style={styles.cover} contentFit="cover" transition={120} />
                ) : (
                    <View style={[styles.cover, styles.coverFallback]}>
                        <Ionicons name="film-outline" size={40} color={colors.textDim} />
                    </View>
                )}
                <View style={styles.heroInfo}>
                    <Text style={styles.title}>{name ?? ''}</Text>
                    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                    {resumePct > 0 ? (
                        <View style={styles.resumeTrack}>
                            <View style={[styles.resumeFill, { width: `${resumePct}%` }]} />
                        </View>
                    ) : null}
                </View>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity style={styles.playBtn} onPress={() => void play()}>
                    <Ionicons name="play" size={18} color="#fff" />
                    <Text style={styles.playText}>{resumePct > 0 ? tf('resumeAt', { pct: resumePct }) : t('watch')}</Text>
                </TouchableOpacity>
                {canCast ? (
                    <TouchableOpacity style={styles.favBtn} accessibilityLabel={t('a11yCast')} onPress={() => void castNow()}>
                        <Ionicons name="tv-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                    style={styles.favBtn}
                    accessibilityLabel={t('a11yShare')}
                    onPress={() => {
                        const link = `neostream://movie/${id}?name=${encodeURIComponent(name ?? '')}&container=${encodeURIComponent(String(container || 'mp4'))}`
                        void Share.share({ message: `${tf('shareContent', { name: name ?? '' })}\n${link}` }).catch(() => undefined)
                    }}
                >
                    <Ionicons name="share-social-outline" size={20} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.favBtn, fav && styles.favBtnOn]}
                    accessibilityLabel={t('a11yFav')}
                    onPress={() => { tapLight(); void persistToggle('movie', String(id)).then(setFavorites) }}
                >
                    <Ionicons name={fav ? 'heart' : 'heart-outline'} size={20} color={fav ? '#fff' : colors.danger} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.favBtn}
                    accessibilityLabel={t('colPickTitle')}
                    onPress={addToCollection}
                >
                    <Ionicons name="folder-outline" size={20} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.listBtn, inList && styles.listBtnOn]}
                    accessibilityLabel={t('watchlistBtn')}
                    onPress={() => {
                        tapLight()
                        void toggleWatchlist({
                            kind: 'movie', id: String(id), name: name ?? '',
                            cover: details?.cover || cover || '', container: String(container || 'mp4'),
                            addedAt: Date.now(),
                        }).then(list => setInList(hasItem(list, 'movie', String(id))))
                    }}
                >
                    <Ionicons name={inList ? 'bookmark' : 'bookmark-outline'} size={20} color={inList ? '#fff' : colors.accent} />
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.trailerBtn}
                onPress={() => {
                    if (dlState === 'none') {
                        void (async () => {
                            const client = await getClient()
                            if (!client) return
                            await startDownload({
                                id: pid,
                                url: client.vodStreamUrl(String(id), String(container || 'mp4')),
                                title: name ?? '',
                                cover: details?.cover || cover || '',
                                container: String(container || 'mp4'),
                            }).catch(() => Alert.alert(t('dlTitle'), t('dlMovieFail')))
                        })()
                    } else if (dlState === 'done') {
                        Alert.alert(t('dlTitle'), t('dlMovieDone'), [
                            { text: t('ok'), style: 'cancel' },
                            { text: t('dlDelete'), style: 'destructive', onPress: () => void removeDownload(pid) },
                        ])
                    }
                }}
            >
                <Ionicons
                    name={dlState === 'done' ? 'checkmark-circle' : 'cloud-download-outline'}
                    size={18}
                    color={dlState === 'done' ? colors.live : colors.text}
                />
                <Text style={styles.trailerText}>
                    {dlState === 'done' ? t('downloadedBtn') : dlState === 'active' ? tf('downloadingPct', { pct: dlPct }) : t('download')}
                </Text>
            </TouchableOpacity>

            {versions.length > 1 ? (
                <View style={styles.versionRow}>
                    <Text style={styles.versionLabel}>{t('versionsLabel')}</Text>
                    {versions.map(version => {
                        const active = String(version.movie.stream_id) === String(id)
                        return (
                            <TouchableOpacity
                                key={String(version.movie.stream_id)}
                                style={[styles.versionChip, active && styles.versionChipOn]}
                                disabled={active}
                                onPress={() => {
                                    router.replace({
                                        pathname: '/movie/[id]',
                                        params: {
                                            id: String(version.movie.stream_id), name: version.movie.name,
                                            cover: version.movie.stream_icon || cover || '',
                                            container: version.movie.container_extension || 'mp4',
                                        },
                                    })
                                }}
                            >
                                <Text style={[styles.versionText, active && styles.versionTextOn]}>{version.label}</Text>
                            </TouchableOpacity>
                        )
                    })}
                </View>
            ) : null}

            {details?.trailer ? (
                <TouchableOpacity
                    style={styles.trailerBtn}
                    onPress={() => setTrailerOpen(true)}
                    onLongPress={() => void Linking.openURL(details.trailer)}
                    delayLongPress={400}
                >
                    <Ionicons name="logo-youtube" size={18} color={colors.text} />
                    <Text style={styles.trailerText}>{t('trailerBtn')}</Text>
                </TouchableOpacity>
            ) : null}

            {trailerOpen && details?.trailer ? (
                <View style={styles.trailerModal}>
                    <WebView
                        style={styles.trailerWeb}
                        // Truque do desktop: referer PRÓPRIO (nunca youtube.com) evita o erro 153.
                        source={{
                            uri: details.trailer.replace(/.*(?:v=|youtu\.be\/)([\w-]{6,})[^\w-]?.*/, 'https://www.youtube.com/embed/$1?autoplay=1'),
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

            {details === null ? (
                <Text style={styles.plotDim}>{t('loadingDetails')}</Text>
            ) : details.plot ? (
                <Text style={styles.plot}>{details.plot}</Text>
            ) : (
                <Text style={styles.plotDim}>{t('noPlot')}</Text>
            )}

            {details?.cast ? <Text style={styles.credits}><Text style={styles.creditsLabel}>{t('castLabel')}</Text>{details.cast}</Text> : null}
            {details?.director ? <Text style={styles.credits}><Text style={styles.creditsLabel}>{t('directorLabel')}</Text>{details.director}</Text> : null}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, gap: spacing.lg },
    hero: { flexDirection: 'row', gap: spacing.lg },
    cover: { width: 130, aspectRatio: 2 / 3, borderRadius: 12, backgroundColor: colors.card },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    heroInfo: { flex: 1, justifyContent: 'flex-end', gap: spacing.sm },
    title: { color: colors.text, fontSize: tvSize(20), fontWeight: '700' },
    meta: { color: colors.textDim, fontSize: tvSize(13) },
    resumeTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
    resumeFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    actions: { flexDirection: 'row', gap: spacing.md },
    playBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 10,
        paddingVertical: 13,
    },
    playText: { color: '#fff', fontSize: tvSize(16), fontWeight: '600' },
    favBtn: {
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.danger,
    },
    favBtnOn: { backgroundColor: colors.danger },
    listBtn: {
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    listBtnOn: { backgroundColor: colors.accent },
    plot: { color: colors.text, fontSize: tvSize(14), lineHeight: 21 },
    plotDim: { color: colors.textDim, fontSize: tvSize(14) },
    trailerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 11,
    },
    trailerText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    versionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    versionLabel: { color: colors.textDim, fontSize: 13 },
    versionChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
    },
    versionChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    versionText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
    versionTextOn: { color: colors.accent },
    trailerModal: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000',
        zIndex: 20,
    },
    trailerWeb: { flex: 1, backgroundColor: '#000' },
    trailerClose: { position: 'absolute', top: 40, right: 16 },
    credits: { color: colors.textDim, fontSize: tvSize(13), lineHeight: 19 },
    creditsLabel: { color: colors.text, fontWeight: '600' },
})
