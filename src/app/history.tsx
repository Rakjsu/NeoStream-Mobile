import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Stack, router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { clearHistory, isFinished, loadProgress, progressPct, removeEntry, type ProgressEntry } from '../services/progress'
import { getClient, resolvePlayableUrl } from '../services/session'
import { EmptyState, SearchBar } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

/** "12/07 21:35" no fuso local. */
function formatWhen(ms: number): string {
    const date = new Date(ms)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${day}/${month} ${hour}:${minute}`
}

/** Tudo que passou pelo player, do mais recente pro mais antigo. */
export default function History() {
    const [entries, setEntries] = useState<ProgressEntry[]>([])
    const [query, setQuery] = useState('')

    useFocusEffect(useCallback(() => {
        queueMicrotask(() => {
            void loadProgress().then(map => {
                setEntries(Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt))
            })
        })
    }, []))

    const resume = (entry: ProgressEntry) => {
        void (async () => {
            const client = await getClient()
            if (!client) return
            const raw = entry.kind === 'movie'
                ? client.vodStreamUrl(entry.streamId, entry.container)
                : client.seriesStreamUrl(entry.streamId, entry.container)
            const url = await resolvePlayableUrl(raw)
            router.push({
                pathname: '/player',
                params: {
                    url, title: entry.title, pid: entry.id, kind: entry.kind,
                    sid: entry.streamId, container: entry.container, cover: entry.cover,
                },
            })
        })()
    }

    const remove = (entry: ProgressEntry) => {
        void removeEntry(entry.id).then(() =>
            loadProgress().then(map => setEntries(Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt))))
    }

    const filtered = query.trim()
        ? entries.filter(entry => entry.title.toLowerCase().includes(query.trim().toLowerCase()))
        : entries

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('historyTitle') }} />
            <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                    <SearchBar value={query} onChange={setQuery} placeholder={t('historySearchPh')} />
                </View>
                {entries.length > 0 ? (
                    <TouchableOpacity
                        style={styles.clearBtn}
                        accessibilityLabel={t('historyClearBtn')}
                        onPress={() => {
                            Alert.alert(t('historyClearBtn'), t('historyClearMsg'), [
                                { text: t('cancel'), style: 'cancel' },
                                {
                                    text: t('remove'),
                                    style: 'destructive',
                                    onPress: () => { void clearHistory().then(() => setEntries([])) },
                                },
                            ])
                        }}
                    >
                        <Ionicons name="trash-bin-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                ) : null}
            </View>
            <FlatList
                data={filtered}
                keyExtractor={entry => entry.id}
                ListEmptyComponent={<EmptyState icon="time-outline" label={query.trim() ? t('searchNothing') : t('historyEmpty')} />}
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => {
                    const done = isFinished(item.position, item.duration)
                    const pct = progressPct(item.position, item.duration)
                    return (
                        <TouchableOpacity style={styles.row} onPress={() => resume(item)}>
                            {item.cover ? (
                                <Image source={{ uri: item.cover }} style={styles.cover} contentFit="cover" transition={120} />
                            ) : (
                                <View style={[styles.cover, styles.coverFallback]}>
                                    <Ionicons name="film-outline" size={16} color={colors.textDim} />
                                </View>
                            )}
                            <View style={styles.info}>
                                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                                <Text style={styles.meta}>
                                    {formatWhen(item.updatedAt)}{done ? ' · ✓' : pct > 0 ? ` · ${pct}%` : ''}
                                </Text>
                                {!done && pct > 0 ? (
                                    <View style={styles.track}>
                                        <View style={[styles.fill, { width: `${pct}%` }]} />
                                    </View>
                                ) : null}
                            </View>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                accessibilityLabel={t('a11yDelete')}
                                onPress={() => remove(item)}
                            >
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    topRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
    clearBtn: { padding: spacing.sm },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cover: { width: 44, height: 62, borderRadius: 6, backgroundColor: colors.card },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, gap: 4 },
    title: { color: colors.text, fontSize: 14 },
    meta: { color: colors.textDim, fontSize: 12 },
    track: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
    fill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    iconBtn: { padding: spacing.xs },
})
