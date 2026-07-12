import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { formatMinutes, loadMonthUsage, yearSummary, type YearSummary } from '../services/usage'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

/** Retrospectiva anual: os agregados mensais viram o "Wrapped" de dezembro. */
export default function Wrapped() {
    const year = new Date().getFullYear()
    const [summary, setSummary] = useState<YearSummary | null>(null)

    useEffect(() => {
        queueMicrotask(() => {
            void loadMonthUsage().then(map => setSummary(yearSummary(map, year)))
        })
    }, [year])

    const rows: [string, number][] = summary
        ? [
            [t('tabLive'), summary.totals.live],
            [t('tabMovies'), summary.totals.movie],
            [t('tabSeries'), summary.totals.episode],
        ]
        : []

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <TouchableOpacity style={styles.close} accessibilityLabel={t('a11yBack')} onPress={() => router.back()}>
                <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>

            <Text style={styles.emoji}>🎁</Text>
            <Text style={styles.title}>{tf('wrappedTitle', { year })}</Text>
            <Text style={styles.total}>{summary ? formatMinutes(summary.totalMinutes) : '…'}</Text>

            <View style={styles.card}>
                {rows.map(([label, minutes]) => (
                    <View key={label} style={styles.row}>
                        <Text style={styles.rowLabel}>{label}</Text>
                        <Text style={styles.rowValue}>{formatMinutes(minutes)}</Text>
                    </View>
                ))}
                {summary?.topMonth ? (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>{t('wrappedTopMonth')}</Text>
                        <Text style={styles.rowValue}>
                            {summary.topMonth.month.slice(5)}/{summary.topMonth.month.slice(0, 4)} · {formatMinutes(summary.topMonth.minutes)}
                        </Text>
                    </View>
                ) : null}
            </View>

            <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => {
                    if (!summary) return
                    void Share.share({
                        message: tf('wrappedShare', { year, total: formatMinutes(summary.totalMinutes) }),
                    }).catch(() => undefined)
                }}
            >
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={styles.shareText}>{t('shareUsageBtn')}</Text>
            </TouchableOpacity>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, alignItems: 'center', gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
    close: { position: 'absolute', top: 48, right: spacing.lg, padding: spacing.sm },
    emoji: { fontSize: 56 },
    title: { color: colors.text, fontSize: 24, fontWeight: '800' },
    total: { color: colors.accent, fontSize: 40, fontWeight: '800' },
    card: {
        alignSelf: 'stretch',
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: spacing.lg,
        gap: spacing.md,
        marginTop: spacing.md,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { color: colors.textDim, fontSize: 14 },
    rowValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingHorizontal: spacing.xl,
        paddingVertical: 12,
        marginTop: spacing.lg,
    },
    shareText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
