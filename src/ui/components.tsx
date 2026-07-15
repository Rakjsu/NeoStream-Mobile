import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { ProgressEntry } from '../services/progress'
import { progressPct } from '../services/progress'
import type { Category } from '../services/xtream'
import { t } from '../i18n/strings'
import { useRef, useState } from 'react'
import { useNetworkState } from 'expo-network'
import { skipImages } from '../services/dataSaver'
import { colors, spacing } from './theme'
import { isTV, tvSize } from './tv'

/** Faixa discreta quando o aparelho está sem rede (some sozinha ao voltar). */
export function OfflineBanner() {
    const network = useNetworkState()
    if (network.isConnected !== false) return null
    return (
        <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>{t('offlineBanner')}</Text>
        </View>
    )
}

export function SearchBar({ value, onChange, placeholder }: {
    value: string
    onChange: (text: string) => void
    placeholder: string
}) {
    return (
        <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textDim} />
            <TextInput
                style={styles.searchInput}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                autoCorrect={false}
                autoCapitalize="none"
            />
        </View>
    )
}

export function Center({ children }: { children: React.ReactNode }) {
    return <View style={styles.center}>{children}</View>
}

export function Loading({ label }: { label?: string }) {
    return (
        <Center>
            <ActivityIndicator color={colors.accent} size="large" />
            {label ? <Text style={styles.dim}>{label}</Text> : null}
        </Center>
    )
}

export function EmptyState({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
    return (
        <Center>
            <Ionicons name={icon} size={40} color={colors.textDim} />
            <Text style={styles.dim}>{label}</Text>
        </Center>
    )
}

/**
 * TouchableOpacity com foco visível de D-pad (Android TV): a borda acende
 * quando o controle chega no item. No touch, nada muda.
 */
export function TvTouchable({ focusStyle, style, children, onFocus, onBlur, ...props }: React.ComponentProps<typeof TouchableOpacity> & { focusStyle?: object }) {
    const [focused, setFocused] = useState(false)
    return (
        <TouchableOpacity
            accessibilityRole="button"
            {...props}
            style={[style, focused && (focusStyle ?? styles.tvFocus)]}
            onFocus={event => { setFocused(true); onFocus?.(event) }}
            onBlur={event => { setFocused(false); onBlur?.(event) }}
        >
            {children}
        </TouchableOpacity>
    )
}

/** Card de pôster 2:3 pras grades de Filmes/Séries (❤ = favorito; ✓ = seleção em lote). */
export function PosterCard({ name, cover, fav, selected, badge }: { name: string; cover?: string; fav?: boolean; selected?: boolean; badge?: string }) {
    return (
        <View style={[styles.poster, selected && styles.posterSelected]}>
            {selected ? (
                <View style={styles.selBadge}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
            ) : null}
            {cover && !skipImages() ? (
                <Image source={{ uri: cover }} style={styles.posterImg} contentFit="cover" transition={120} />
            ) : (
                <View style={[styles.posterImg, styles.posterFallback]}>
                    <Ionicons name="film-outline" size={28} color={colors.textDim} />
                </View>
            )}
            {fav ? (
                <View style={styles.favBadge}>
                    <Ionicons name="heart" size={12} color="#fff" />
                </View>
            ) : null}
            {badge && !selected ? (
                <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>{badge}</Text>
                </View>
            ) : null}
            <Text style={styles.posterName} numberOfLines={2}>{name}</Text>
        </View>
    )
}

/**
 * Chips horizontais de filtro: Todos → ⭐ Favoritos → categorias do provedor.
 * `selected`: 'all' | 'fav' | category_id.
 */
export function CategoryChips({ categories, selected, onSelect }: {
    categories: Category[]
    selected: string
    onSelect: (id: string) => void
}) {
    const chips = [
        { id: 'all', label: t('all') },
        { id: 'fav', label: t('favoritesChip') },
        ...categories.map(c => ({ id: c.category_id, label: c.category_name })),
    ]
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
        >
            {chips.map(chip => {
                const active = selected === chip.id
                return (
                    <TouchableOpacity
                        key={chip.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => onSelect(chip.id)}
                    >
                        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                            {chip.label}
                        </Text>
                    </TouchableOpacity>
                )
            })}
        </ScrollView>
    )
}

/** Rail horizontal "Continuar assistindo" com barra de progresso. */
export function ContinueRail({ entries, onPlay, onRemove }: {
    entries: ProgressEntry[]
    onPlay: (entry: ProgressEntry) => void
    /** Segurar um card remove do rail (com confirmação de quem chama). */
    onRemove?: (entry: ProgressEntry) => void
}) {
    // Hook ANTES do early-return (regra de hooks) — o card focado rola pra vista.
    const listRef = useRef<FlatList<ProgressEntry>>(null)
    if (entries.length === 0) return null
    const cardSpan = tvSize(108) + spacing.sm
    return (
        <View style={styles.railWrap}>
            <Text style={styles.railTitle}>{t('continueRail')}</Text>
            <FlatList
                ref={listRef}
                data={entries}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: spacing.md }}
                getItemLayout={(_, index) => ({ length: cardSpan, offset: cardSpan * index, index })}
                renderItem={({ item, index }) => (
                    <TvTouchable
                        style={styles.railCard}
                        onPress={() => onPlay(item)}
                        onLongPress={onRemove ? () => onRemove(item) : undefined}
                        delayLongPress={350}
                        onFocus={isTV ? () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }) : undefined}
                    >
                        {item.cover && !skipImages() ? (
                            <Image source={{ uri: item.cover }} style={styles.railImg} contentFit="cover" transition={120} />
                        ) : (
                            <View style={[styles.railImg, styles.posterFallback]}>
                                <Ionicons name="play" size={22} color={colors.textDim} />
                            </View>
                        )}
                        <View style={styles.railBarTrack}>
                            <View style={[styles.railBarFill, { width: `${progressPct(item.position, item.duration)}%` }]} />
                        </View>
                        <Text style={styles.railName} numberOfLines={2}>{item.title}</Text>
                    </TvTouchable>
                )}
            />
        </View>
    )
}

/** Item genérico das fileiras da Home (filme ou série). */
export interface RailItem {
    key: string
    kind: 'movie' | 'series'
    id: string
    name: string
    cover: string
    /** Extras pro tap (container do filme, por ex.). */
    container?: string
}

/** Fileira horizontal de pôsteres (Home: favoritos, recentes…). */
export function PosterRail({ title, items, onPress }: {
    title: string
    items: RailItem[]
    onPress: (item: RailItem) => void
}) {
    // Hook ANTES do early-return (regra de hooks) — o card focado rola pra vista.
    const listRef = useRef<FlatList<RailItem>>(null)
    if (items.length === 0) return null
    const cardSpan = tvSize(96) + spacing.sm
    return (
        <View style={styles.railWrap}>
            <Text style={styles.railTitle}>{title}</Text>
            <FlatList
                ref={listRef}
                data={items}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.key}
                contentContainerStyle={{ paddingHorizontal: spacing.md }}
                getItemLayout={(_, index) => ({ length: cardSpan, offset: cardSpan * index, index })}
                renderItem={({ item, index }) => (
                    <TvTouchable
                        style={styles.posterRailCard}
                        onPress={() => onPress(item)}
                        onFocus={isTV ? () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }) : undefined}
                    >
                        {item.cover && !skipImages() ? (
                            <Image source={{ uri: item.cover }} style={styles.posterRailImg} contentFit="cover" transition={120} />
                        ) : (
                            <View style={[styles.posterRailImg, styles.posterFallback]}>
                                <Ionicons name={item.kind === 'series' ? 'albums-outline' : 'film-outline'} size={22} color={colors.textDim} />
                            </View>
                        )}
                        <Text style={styles.railName} numberOfLines={2}>{item.name}</Text>
                    </TvTouchable>
                )}
            />
        </View>
    )
}

/** Fileira horizontal de canais (logo redondo + nome). */
export function ChannelRail({ title, items, onPress }: {
    title: string
    items: { id: string; name: string; logo: string }[]
    onPress: (item: { id: string; name: string; logo: string }) => void
}) {
    // Hook ANTES do early-return (regra de hooks) — o card focado rola pra vista.
    const listRef = useRef<FlatList<{ id: string; name: string; logo: string }>>(null)
    if (items.length === 0) return null
    const cardSpan = tvSize(72) + spacing.sm
    return (
        <View style={styles.railWrap}>
            <Text style={styles.railTitle}>{title}</Text>
            <FlatList
                ref={listRef}
                data={items}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: spacing.md }}
                getItemLayout={(_, index) => ({ length: cardSpan, offset: cardSpan * index, index })}
                renderItem={({ item, index }) => (
                    <TvTouchable
                        style={styles.chRailCard}
                        onPress={() => onPress(item)}
                        onFocus={isTV ? () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }) : undefined}
                    >
                        {item.logo && !skipImages() ? (
                            <Image source={{ uri: item.logo }} style={styles.chRailLogo} contentFit="contain" transition={120} />
                        ) : (
                            <View style={[styles.chRailLogo, styles.posterFallback]}>
                                <Ionicons name="tv-outline" size={20} color={colors.textDim} />
                            </View>
                        )}
                        <Text style={styles.railName} numberOfLines={1}>{item.name}</Text>
                    </TvTouchable>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: spacing.md,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
    },
    searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    dim: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
    poster: { flex: 1, padding: spacing.xs },
    posterImg: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: colors.card },
    posterSelected: { opacity: 0.85, borderColor: colors.accent, borderWidth: 2, borderRadius: 10 },
    // Na TV o foco precisa GRITAR (borda + zoom); no touch, só o fundo suave.
    tvFocus: isTV
        ? { backgroundColor: colors.accentSoft, borderRadius: 10, borderWidth: 2, borderColor: colors.accent, transform: [{ scale: 1.05 }] }
        : { backgroundColor: colors.accentSoft, borderRadius: 10 },
    offlineBanner: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 5 },
    offlineText: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
    selBadge: {
        position: 'absolute',
        top: 6,
        left: 6,
        zIndex: 1,
        backgroundColor: colors.accent,
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    posterFallback: { alignItems: 'center', justifyContent: 'center' },
    posterName: { color: colors.text, fontSize: tvSize(12), marginTop: 4 },
    favBadge: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        backgroundColor: 'rgba(239,68,68,0.9)',
        borderRadius: 10,
        padding: 4,
    },
    newBadge: {
        position: 'absolute',
        top: 6,
        left: 6,
        zIndex: 1,
        backgroundColor: colors.accent,
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    chipsScroll: { flexGrow: 0, marginBottom: spacing.sm },
    chipsRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    chip: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        maxWidth: 200,
    },
    chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    chipText: { color: colors.textDim, fontSize: 13 },
    chipTextActive: { color: colors.accent, fontWeight: '600' },
    railWrap: { marginBottom: spacing.sm },
    railTitle: {
        color: colors.textDim,
        fontSize: tvSize(13),
        textTransform: 'uppercase',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
    },
    railCard: { width: tvSize(108), marginRight: spacing.sm },
    railImg: { width: tvSize(108), height: tvSize(72), borderRadius: 8, backgroundColor: colors.card },
    railBarTrack: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 4 },
    railBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    railName: { color: colors.text, fontSize: tvSize(11), marginTop: 4 },
    posterRailCard: { width: tvSize(96), marginRight: spacing.sm },
    posterRailImg: { width: tvSize(96), aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: colors.card },
    chRailCard: { width: tvSize(72), marginRight: spacing.sm, alignItems: 'center' },
    chRailLogo: { width: tvSize(56), height: tvSize(56), borderRadius: tvSize(28), backgroundColor: colors.card },
})

/** Esqueleto do Início: caixas na cor do card enquanto o catálogo carrega. */
export function HomeSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.xl }}>
            {[0, 1, 2].map(row => (
                <View key={row} style={{ gap: spacing.sm }}>
                    <View style={skeleton.title} />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        {[0, 1, 2, 3].map(box => <View key={box} style={skeleton.poster} />)}
                    </View>
                </View>
            ))}
        </View>
    )
}

const skeleton = StyleSheet.create({
    title: { width: 150, height: 14, borderRadius: 7, backgroundColor: colors.card },
    poster: { width: tvSize(96), height: tvSize(144), borderRadius: 10, backgroundColor: colors.card },
})
