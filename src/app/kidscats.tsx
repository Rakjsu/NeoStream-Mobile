import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { listKidsCategories, toggleKidsCategory } from '../services/kids'
import { cachedFetch, getClient } from '../services/session'
import type { Category } from '../services/xtream'
import { EmptyState, Loading, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

/**
 * Categorias liberadas do modo infantil: união (por nome) das categorias de
 * TV, filmes e séries com checkbox. Nada marcado = só o filtro do parental.
 */
export default function KidsCategories() {
    const [names, setNames] = useState<string[] | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (!client) { router.replace('/login'); return }
                const [liveCats, vodCats, seriesCats, current] = await Promise.all([
                    cachedFetch('live-cats', () => client.getLiveCategories()).catch(() => [] as Category[]),
                    cachedFetch('vod-cats', () => client.getVodCategories()).catch(() => [] as Category[]),
                    cachedFetch('series-cats', () => client.getSeriesCategories()).catch(() => [] as Category[]),
                    listKidsCategories(),
                ])
                const seen = new Set<string>()
                const union: string[] = []
                for (const category of [...liveCats, ...vodCats, ...seriesCats]) {
                    const key = category.category_name.toLowerCase()
                    if (seen.has(key)) continue
                    seen.add(key)
                    union.push(category.category_name)
                }
                union.sort((a, b) => a.localeCompare(b))
                setNames(union)
                setSelected(new Set(current.map(name => name.toLowerCase())))
            })()
        })
    }, [])

    if (names === null) return <Loading label={t('loadingCatalog')} />

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('kidsCatsTitle') }} />
            <Text style={styles.hint}>{t('kidsCatsHint')}</Text>
            <FlatList
                data={names}
                keyExtractor={name => name}
                ListEmptyComponent={<EmptyState icon="albums-outline" label={t('searchNothing')} />}
                contentContainerStyle={names.length === 0 ? { flexGrow: 1 } : undefined}
                renderItem={({ item }) => {
                    const on = selected.has(item.toLowerCase())
                    return (
                        <TvTouchable
                            style={styles.row}
                            onPress={() => {
                                void toggleKidsCategory(item).then(list =>
                                    setSelected(new Set(list.map(name => name.toLowerCase()))))
                            }}
                        >
                            <Ionicons
                                name={on ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={on ? colors.accent : colors.textDim}
                            />
                            <Text style={[styles.name, on && { color: colors.accent }]} numberOfLines={1}>{item}</Text>
                        </TvTouchable>
                    )
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    hint: { color: colors.textDim, fontSize: 12, padding: spacing.lg, paddingBottom: spacing.sm },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 11,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { flex: 1, color: colors.text, fontSize: 14 },
})
