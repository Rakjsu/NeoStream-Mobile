import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Stack, router } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { loadFavorites } from '../services/favorites'
import { hiddenIdSet } from '../services/hidden'
import { loadParental } from '../services/parental'
import { guardedCategoryIds } from '../services/kids'
import { listRecentChannels } from '../services/recents'
import { cachedFetch, getClient } from '../services/session'
import { tapLight } from '../services/haptics'
import type { Category, LiveChannel } from '../services/xtream'
import { rankChannels } from '../services/zap'
import { EmptyState, Loading, SearchBar, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

// Mutação de propriedade do player fora do componente (regra immutability).
function applyVolume(target: { volume: number; muted: boolean }, on: boolean) {
    target.volume = on ? 1 : 0
    target.muted = !on
}

interface Slot {
    url: string
    name: string
}

const EMPTY_SLOT: Slot = { url: '', name: '' }
const SAVE_KEY = 'neostream_multiview'
type Layout = '2x2' | '1x2'

/**
 * Multi-view 2×2 (tablet/TV): até 4 canais ao vivo lado a lado. Toque num
 * quadrante vazio escolhe o canal; toque num cheio leva o ÁUDIO pra ele;
 * long-press troca o canal do quadrante.
 */
export default function MultiView() {
    const [slots, setSlots] = useState<Slot[]>([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT])
    const [layout, setLayout] = useState<Layout>('2x2')
    const [active, setActive] = useState(0)
    const [picking, setPicking] = useState<number | null>(null)

    // Mosaico lembrado: reabrir o multi-view volta com os mesmos canais.
    useEffect(() => {
        queueMicrotask(() => {
            void AsyncStorage.getItem(SAVE_KEY).then(raw => {
                const saved = raw ? (JSON.parse(raw) as { slots?: Slot[]; layout?: Layout }) : null
                if (saved?.slots?.some(slot => slot.url)) {
                    setSlots(saved.slots.slice(0, 4))
                    if (saved.layout) setLayout(saved.layout)
                } else {
                    setPicking(0) // primeira vez: já abre escolhendo o 1º canal
                }
            }).catch(() => setPicking(0))
        })
    }, [])

    const persist = (nextSlots: Slot[], nextLayout: Layout) => {
        void AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ slots: nextSlots, layout: nextLayout })).catch(() => undefined)
    }
    const [channels, setChannels] = useState<LiveChannel[] | null>(null)
    const [query, setQuery] = useState('')

    // 4 players fixos (hooks não podem variar) — slot vazio fica com fonte ''.
    const player0 = useVideoPlayer(slots[0].url, p => { p.play() })
    const player1 = useVideoPlayer(slots[1].url, p => { p.play() })
    const player2 = useVideoPlayer(slots[2].url, p => { p.play() })
    const player3 = useVideoPlayer(slots[3].url, p => { p.play() })
    const players = [player0, player1, player2, player3]

    // Só o quadrante ativo tem áudio (re-aplica quando um player renasce).
    useEffect(() => {
        players.forEach((player, index) => {
            try { applyVolume(player, index === active) } catch { /* player já liberado */ }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, slots])

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const [live, liveCats, parental, favorites, recents, hidden] = await Promise.all([
                    cachedFetch('live', () => client.getLiveChannels()),
                    cachedFetch('live-cats', () => client.getLiveCategories()).catch(() => [] as Category[]),
                    loadParental(),
                    loadFavorites(),
                    listRecentChannels(),
                    hiddenIdSet(),
                ])
                const allowed = await guardedCategoryIds(liveCats, parental.enabled)
                const visible = live.filter(channel =>
                    !hidden.has(String(channel.stream_id))
                    && (!allowed || !channel.category_id || allowed.has(channel.category_id)))
                const ranked = rankChannels(
                    visible.map(channel => ({ id: String(channel.stream_id), name: channel.name })),
                    new Set(favorites.live),
                    recents.map(recent => recent.id),
                )
                const byId = new Map(visible.map(channel => [String(channel.stream_id), channel]))
                setChannels(ranked.flatMap(entry => byId.get(entry.id) ?? []))
            })()
        })
    }, [])

    const pick = (channel: LiveChannel) => {
        void (async () => {
            const client = await getClient()
            if (!client || picking === null) return
            const url = client.liveStreamUrl(channel.stream_id)
            setSlots(current => {
                const next = current.map((slot, index) =>
                    index === picking ? { url, name: channel.name } : slot)
                persist(next, layout)
                return next
            })
            setActive(picking)
            setPicking(null)
            setQuery('')
        })()
    }

    const pressSlot = (index: number) => {
        if (!slots[index].url) { setPicking(index); return }
        tapLight()
        setActive(index)
    }

    const filtered = (channels ?? []).filter(channel =>
        !query.trim() || channel.name.toLowerCase().includes(query.trim().toLowerCase()))

    return (
        <View style={styles.root}>
            <Stack.Screen
                options={{
                    title: t('multiviewTitle'),
                    headerRight: () => (
                        <TvTouchable
                            style={{ paddingHorizontal: 14 }}
                            accessibilityLabel={t('multiviewLayout')}
                            onPress={() => {
                                const next: Layout = layout === '2x2' ? '1x2' : '2x2'
                                setLayout(next)
                                persist(slots, next)
                            }}
                        >
                            <Ionicons name={layout === '2x2' ? 'grid-outline' : 'tablet-landscape-outline'} size={20} color={colors.text} />
                        </TvTouchable>
                    ),
                }}
            />
            <View style={styles.grid}>
                {slots.slice(0, layout === '1x2' ? 2 : 4).map((slot, index) => (
                    <TvTouchable
                        key={index}
                        style={[styles.cell, layout === '1x2' && styles.cellHalf,
                            index === active && slot.url ? styles.cellActive : null]}
                        onPress={() => pressSlot(index)}
                        onLongPress={() => setPicking(index)}
                        delayLongPress={350}
                    >
                        {slot.url ? (
                            <>
                                <VideoView player={players[index]} style={styles.video} contentFit="contain" nativeControls={false} />
                                <View style={styles.cellLabel} pointerEvents="none">
                                    {index === active ? <Ionicons name="volume-high" size={12} color={colors.accent} /> : null}
                                    <Text style={styles.cellName} numberOfLines={1}>{slot.name}</Text>
                                </View>
                            </>
                        ) : (
                            <View style={styles.cellEmpty}>
                                <Ionicons name="add-circle-outline" size={30} color={colors.textDim} />
                                <Text style={styles.cellHint}>{t('multiviewAdd')}</Text>
                            </View>
                        )}
                    </TvTouchable>
                ))}
            </View>

            {picking !== null ? (
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerBox}>
                        <View style={styles.pickerHeader}>
                            <View style={{ flex: 1 }}>
                                <SearchBar value={query} onChange={setQuery} placeholder={t('searchChannel')} />
                            </View>
                            <TvTouchable accessibilityLabel={t('cancel')} onPress={() => { setPicking(null); setQuery('') }}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TvTouchable>
                        </View>
                        {channels === null ? (
                            <Loading label={t('loadingChannels')} />
                        ) : (
                            <FlatList
                                data={filtered}
                                keyExtractor={item => String(item.stream_id)}
                                keyboardShouldPersistTaps="handled"
                                ListEmptyComponent={<EmptyState icon="tv-outline" label={t('nowEmpty')} />}
                                renderItem={({ item }) => (
                                    <TvTouchable style={styles.pickRow} onPress={() => pick(item)}>
                                        {item.stream_icon ? (
                                            <Image source={{ uri: item.stream_icon }} style={styles.pickLogo} contentFit="contain" transition={120} />
                                        ) : (
                                            <View style={styles.pickLogo} />
                                        )}
                                        <Text style={styles.pickName} numberOfLines={1}>{item.name}</Text>
                                    </TvTouchable>
                                )}
                            />
                        )}
                    </View>
                </View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
        width: '50%',
        height: '50%',
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
    },
    cellActive: { borderColor: colors.accent, borderWidth: 2 },
    cellHalf: { width: '50%', height: '100%' },
    video: { flex: 1 },
    cellLabel: {
        position: 'absolute',
        left: 6,
        bottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        maxWidth: '80%',
    },
    cellName: { color: colors.text, fontSize: 11, fontWeight: '600' },
    cellEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    cellHint: { color: colors.textDim, fontSize: 12 },
    pickerOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    pickerBox: {
        maxHeight: '80%',
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingBottom: spacing.sm,
    },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, gap: spacing.sm },
    pickRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 9,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pickLogo: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.card },
    pickName: { flex: 1, color: colors.text, fontSize: 14 },
})
