import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native'
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

/** Card de pôster 2:3 pras grades de Filmes/Séries. */
export function PosterCard({ name, cover }: { name: string; cover?: string }) {
    return (
        <View style={styles.poster}>
            {cover ? (
                <Image source={{ uri: cover }} style={styles.posterImg} resizeMode="cover" />
            ) : (
                <View style={[styles.posterImg, styles.posterFallback]}>
                    <Ionicons name="film-outline" size={28} color={colors.textDim} />
                </View>
            )}
            <Text style={styles.posterName} numberOfLines={2}>{name}</Text>
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
})
