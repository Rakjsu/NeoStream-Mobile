import { Ionicons } from '@expo/vector-icons'
import {
    ActivityIndicator, FlatList, Image, ScrollView, StyleSheet,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import type { ProgressEntry } from '../services/progress'
import { progressPct } from '../services/progress'
import type { Category } from '../services/xtream'
import { colors, spacing } from './theme'

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

/** Card de pôster 2:3 pras grades de Filmes/Séries (❤ = favorito). */
export function PosterCard({ name, cover, fav }: { name: string; cover?: string; fav?: boolean }) {
    return (
        <View style={styles.poster}>
            {cover ? (
                <Image source={{ uri: cover }} style={styles.posterImg} resizeMode="cover" />
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
        { id: 'all', label: 'Todos' },
        { id: 'fav', label: '❤ Favoritos' },
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
export function ContinueRail({ entries, onPlay }: {
    entries: ProgressEntry[]
    onPlay: (entry: ProgressEntry) => void
}) {
    if (entries.length === 0) return null
    return (
        <View style={styles.railWrap}>
            <Text style={styles.railTitle}>⏯ Continuar assistindo</Text>
            <FlatList
                data={entries}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: spacing.md }}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.railCard} onPress={() => onPlay(item)}>
                        {item.cover ? (
                            <Image source={{ uri: item.cover }} style={styles.railImg} resizeMode="cover" />
                        ) : (
                            <View style={[styles.railImg, styles.posterFallback]}>
                                <Ionicons name="play" size={22} color={colors.textDim} />
                            </View>
                        )}
                        <View style={styles.railBarTrack}>
                            <View style={[styles.railBarFill, { width: `${progressPct(item.position, item.duration)}%` }]} />
                        </View>
                        <Text style={styles.railName} numberOfLines={2}>{item.title}</Text>
                    </TouchableOpacity>
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
    poster: { flex: 1 / 3, padding: spacing.xs },
    posterImg: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: colors.card },
    posterFallback: { alignItems: 'center', justifyContent: 'center' },
    posterName: { color: colors.text, fontSize: 12, marginTop: 4 },
    favBadge: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        backgroundColor: 'rgba(239,68,68,0.9)',
        borderRadius: 10,
        padding: 4,
    },
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
        fontSize: 13,
        textTransform: 'uppercase',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
    },
    railCard: { width: 108, marginRight: spacing.sm },
    railImg: { width: 108, height: 72, borderRadius: 8, backgroundColor: colors.card },
    railBarTrack: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 4 },
    railBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    railName: { color: colors.text, fontSize: 11, marginTop: 4 },
})
