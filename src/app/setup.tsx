import { Ionicons } from '@expo/vector-icons'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { setDataSaver } from '../services/dataSaver'
import { setDownloadLimitGb } from '../services/downloads'
import { restoreAccounts } from '../services/session'
import { parseSetupParam, type SetupPayload } from '../services/setupLink'
import { setTmdbKey } from '../services/tmdb'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

/** Destino do link neostream://setup?d=… — confirma e aplica contas + prefs. */
export default function Setup() {
    const { d } = useLocalSearchParams<{ d?: string }>()
    const [payload, setPayload] = useState<SetupPayload | null | 'invalid'>(null)
    const [applying, setApplying] = useState(false)

    useEffect(() => {
        queueMicrotask(() => {
            setPayload(d ? parseSetupParam(String(d)) ?? 'invalid' : 'invalid')
        })
    }, [d])

    const apply = () => {
        if (!payload || payload === 'invalid' || applying) return
        setApplying(true)
        void (async () => {
            await restoreAccounts(payload.accounts, payload.activeId)
            if (payload.tmdbKey) await setTmdbKey(payload.tmdbKey)
            if (payload.prefs) {
                await setDownloadLimitGb(payload.prefs.downloadLimitGb ?? 0)
                await setDataSaver(payload.prefs.dataSaver === true)
            }
            router.replace('/(tabs)/home')
        })()
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('setupTitle') }} />
            <Ionicons
                name={payload === 'invalid' ? 'alert-circle-outline' : 'gift-outline'}
                size={44}
                color={payload === 'invalid' ? colors.danger : colors.accent}
            />
            {payload === 'invalid' ? (
                <Text style={styles.text}>{t('setupInvalid')}</Text>
            ) : payload ? (
                <>
                    <Text style={styles.title}>{t('setupTitle')}</Text>
                    <Text style={styles.text}>{tf('setupMsg', { n: payload.accounts.length })}</Text>
                    <TvTouchable style={styles.applyBtn} onPress={apply} disabled={applying}>
                        <Text style={styles.applyText}>{applying ? '…' : t('setupApply')}</Text>
                    </TvTouchable>
                    <TvTouchable onPress={() => router.replace('/')}>
                        <Text style={styles.cancelText}>{t('cancel')}</Text>
                    </TvTouchable>
                </>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xl,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    text: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
    applyBtn: {
        backgroundColor: colors.accent,
        borderRadius: 10,
        paddingHorizontal: spacing.xl,
        paddingVertical: 12,
        marginTop: spacing.sm,
    },
    applyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    cancelText: { color: colors.textDim, fontSize: 14, padding: spacing.sm },
})
