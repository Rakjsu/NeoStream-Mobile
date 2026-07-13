import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Stack, router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
    cancelDownload, discardInterrupted, groupDownloads, listActiveDownloads,
    listDownloads, listInterrupted, pauseDownload, removeDownload, resumeDownload,
    startDownload, subscribeDownloads, type DownloadItem, type DownloadRequest,
} from '../services/downloads'
import { colors, spacing } from '../ui/theme'
import { EmptyState } from '../ui/components'
import { t, tf } from '../i18n/strings'

function formatMb(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1048576))} MB`
}

/** Baixados (tocam offline) + downloads em andamento com barra e cancelar. */
export default function Downloads() {
    const [items, setItems] = useState<DownloadItem[]>([])
    const [activeList, setActiveList] = useState<{ id: string; progress: number; paused: boolean }[]>([])
    const [interrupted, setInterrupted] = useState<DownloadRequest[]>([])

    const refresh = useCallback(() => {
        void listDownloads().then(setItems)
        setActiveList(listActiveDownloads())
        void listInterrupted().then(setInterrupted)
    }, [])

    useEffect(() => {
        queueMicrotask(refresh)
        return subscribeDownloads(refresh)
    }, [refresh])

    const play = (item: DownloadItem) => {
        const [kind, sid] = item.id.split(':')
        router.push({
            pathname: '/player',
            params: {
                url: item.fileUri,
                title: item.title,
                pid: item.id,
                kind,
                sid: sid ?? '',
                container: item.container,
                cover: item.cover,
            },
        })
    }

    const confirmRemove = (item: DownloadItem) => {
        Alert.alert(t('dlDelete'), tf('dlDeleteMsg', { title: item.title }), [
            { text: t('cancel'), style: 'cancel' },
            { text: t('delete'), style: 'destructive', onPress: () => void removeDownload(item.id) },
        ])
    }

    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)
    const sections = groupDownloads(items, t('secMovies'))

    const confirmRemoveGroup = (title: string, data: DownloadItem[]) => {
        Alert.alert(t('delGroupTitle'), tf('delGroupMsg', { n: data.length, title }), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('delete'),
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        for (const item of data) await removeDownload(item.id)
                    })()
                },
            },
        ])
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('downloadsTitle') }} />
            {activeList.map(activeItem => (
                <View key={activeItem.id} style={styles.activeRow}>
                    <Ionicons
                        name={activeItem.paused ? 'pause-circle' : 'cloud-download'}
                        size={18}
                        color={activeItem.paused ? colors.textDim : colors.accent}
                    />
                    <View style={styles.activeInfo}>
                        <Text style={styles.activeText}>
                            {activeItem.paused
                                ? tf('dlPaused', { pct: Math.round(activeItem.progress * 100) })
                                : tf('downloadingPct', { pct: Math.round(activeItem.progress * 100) })}
                        </Text>
                        <View style={styles.track}>
                            <View style={[styles.fill, { width: `${Math.round(activeItem.progress * 100)}%` },
                                activeItem.paused && { backgroundColor: colors.textDim }]} />
                        </View>
                    </View>
                    <TouchableOpacity
                        accessibilityLabel={activeItem.paused ? t('a11yResume') : t('a11yPause')}
                        onPress={() => {
                            if (activeItem.paused) resumeDownload(activeItem.id)
                            else void pauseDownload(activeItem.id)
                        }}
                        style={styles.iconBtn}
                    >
                        <Ionicons name={activeItem.paused ? 'play-circle-outline' : 'pause-circle-outline'} size={20} color={colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityLabel={t('cancel')} onPress={() => void cancelDownload(activeItem.id)} style={styles.iconBtn}>
                        <Ionicons name="close-circle" size={20} color={colors.danger} />
                    </TouchableOpacity>
                </View>
            ))}
            {interrupted.length > 0 ? (
                <View style={styles.interruptedBox}>
                    <Text style={styles.total}>{t('dlInterrupted')}</Text>
                    {interrupted.map(request => (
                        <View key={request.id} style={styles.activeRow}>
                            <Ionicons name="cloud-offline-outline" size={18} color={colors.textDim} />
                            <Text style={[styles.activeText, { flex: 1 }]} numberOfLines={1}>{request.title}</Text>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                accessibilityLabel={t('a11yRetry')}
                                onPress={() => { void startDownload(request).catch(() => undefined) }}
                            >
                                <Ionicons name="refresh" size={18} color={colors.accent} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                accessibilityLabel={t('a11yDelete')}
                                onPress={() => void discardInterrupted(request.id)}
                            >
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            ) : null}
            <SectionList
                sections={sections}
                keyExtractor={item => item.id}
                renderSectionHeader={({ section }) => (
                    <Text
                        style={styles.groupHeader}
                        onLongPress={() => confirmRemoveGroup(section.title, section.data)}
                    >
                        {section.title} · {formatMb(section.bytes)}
                    </Text>
                )}
                ListHeaderComponent={
                    items.length > 0
                        ? <Text style={styles.total}>{tf('itemsSize', { n: items.length, mb: Math.max(1, Math.round(totalBytes / 1048576)) })}</Text>
                        : null
                }
                ListEmptyComponent={
                    activeList.length === 0
                        ? <EmptyState icon="cloud-download-outline" label={t('dlEmpty')} />
                        : null
                }
                contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.row} onPress={() => play(item)}>
                        {item.cover ? (
                            <Image source={{ uri: item.cover }} style={styles.cover} contentFit="cover" transition={120} />
                        ) : (
                            <View style={[styles.cover, styles.coverFallback]}>
                                <Ionicons name="film-outline" size={18} color={colors.textDim} />
                            </View>
                        )}
                        <View style={styles.info}>
                            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                            <Text style={styles.meta}>{formatMb(item.sizeBytes)} · {t('offline')}</Text>
                        </View>
                        <TouchableOpacity accessibilityLabel={t('a11yDelete')} onPress={() => confirmRemove(item)} style={styles.iconBtn}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                        <Ionicons name="play" size={18} color={colors.accent} />
                    </TouchableOpacity>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    activeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: spacing.md,
    },
    activeInfo: { flex: 1, gap: 6 },
    activeText: { color: colors.text, fontSize: 13 },
    track: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
    fill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    total: { color: colors.textDim, fontSize: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    interruptedBox: { paddingTop: spacing.sm },
    groupHeader: {
        color: colors.textDim,
        fontSize: 13,
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
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
    info: { flex: 1, gap: 2 },
    title: { color: colors.text, fontSize: 14 },
    meta: { color: colors.textDim, fontSize: 12 },
    iconBtn: { padding: spacing.xs },
})
