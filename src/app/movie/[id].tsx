import { Ionicons } from '@expo/vector-icons'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Image, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { castAvailable, castToCurrentSession, onCastSessionStarted, showCastPicker } from '../../services/cast'
import { activeProgress, getDownload, removeDownload, startDownload, subscribeDownloads } from '../../services/downloads'
import { tapLight } from '../../services/haptics'
import { emptyFavorites, isFavorite, loadFavorites, persistToggle, type Favorites } from '../../services/favorites'
import { buildProgressId, getEntry, progressPct, resumePosition } from '../../services/progress'
import { getClient, resolvePlayableUrl } from '../../services/session'
import type { VodDetails } from '../../services/xtream'
import { colors, spacing } from '../../ui/theme'
import { t, tf } from '../../i18n/strings'

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
        void (async () => {
            const client = await getClient()
            if (!client) { router.replace('/login'); return }
            const info = await client.getVodDetails(String(id)).catch(() => null)
            if (alive && info) setDetails(info)
        })()
        return () => { alive = false }
    }, [id, pid])

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
                    <Image source={{ uri: coverUri }} style={styles.cover} resizeMode="cover" />
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

            {details?.trailer ? (
                <TouchableOpacity style={styles.trailerBtn} onPress={() => void Linking.openURL(details.trailer)}>
                    <Ionicons name="logo-youtube" size={18} color={colors.text} />
                    <Text style={styles.trailerText}>{t('trailerBtn')}</Text>
                </TouchableOpacity>
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
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    meta: { color: colors.textDim, fontSize: 13 },
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
    playText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    favBtn: {
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.danger,
    },
    favBtnOn: { backgroundColor: colors.danger },
    plot: { color: colors.text, fontSize: 14, lineHeight: 21 },
    plotDim: { color: colors.textDim, fontSize: 14 },
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
    credits: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
    creditsLabel: { color: colors.text, fontWeight: '600' },
})
