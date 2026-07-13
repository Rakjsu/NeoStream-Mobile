import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { setEpgOverride } from '../services/epgMap'
import { M3uClient } from '../services/m3u'
import { getClient, invalidateCatalog } from '../services/session'
import { EmptyState, Loading, SearchBar, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

/** Corrigir EPG: escolher na mão o canal XMLTV certo pra um canal M3U. */
export default function EpgFix() {
    const { channel, name } = useLocalSearchParams<{ channel: string; name?: string }>()
    const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null)
    const [query, setQuery] = useState('')

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (client instanceof M3uClient) setOptions(await client.listGuideChannels())
                else setOptions([])
            })()
        })
    }, [])

    const pick = (guideId: string) => {
        void (async () => {
            await setEpgOverride(String(channel), guideId)
            const client = await getClient()
            if (client instanceof M3uClient) {
                client.applyEpgOverrides({ ...(await import('../services/epgMap').then(m => m.loadEpgOverrides())) })
            }
            invalidateCatalog() // limpa epg:/day: em memória — a grade nova entra
            Alert.alert(t('epgFixDone'))
            router.back()
        })()
    }

    if (options === null) return <Loading label={t('loadingChannels')} />

    const filtered = options.filter(option =>
        !query.trim() || option.name.toLowerCase().includes(query.trim().toLowerCase()))

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('epgFixTitle') }} />
            <Text style={styles.hint}>{tf('epgFixHint', { name: String(name ?? '') })}</Text>
            <SearchBar value={query} onChange={setQuery} placeholder={t('searchChannel')} />
            <FlatList
                data={filtered}
                keyExtractor={option => option.id + option.name}
                ListEmptyComponent={<EmptyState icon="tv-outline" label={t('scheduleEmpty')} />}
                contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => (
                    <TvTouchable style={styles.row} onPress={() => pick(item.id)}>
                        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.id} numberOfLines={1}>{item.id}</Text>
                    </TvTouchable>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    hint: { color: colors.textDim, fontSize: 12, padding: spacing.lg, paddingBottom: spacing.sm },
    row: {
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { color: colors.text, fontSize: 14 },
    id: { color: colors.textDim, fontSize: 11 },
})
