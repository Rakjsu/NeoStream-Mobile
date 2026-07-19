// 📱 Item 39: rota do deep link neostream://open-content — o QR do player do
// desktop cai aqui; resolvemos a URL do stream com a conta DESTE aparelho e
// abrimos o player no mesmo ponto (startAt).
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { getClient } from '../services/session'
import { handoffToPlayerParams } from '../services/handoff'
import { t } from '../i18n/strings'

export default function OpenContent() {
    const raw = useLocalSearchParams<{ kind?: string; sid?: string; container?: string; name?: string; pos?: string }>()

    useEffect(() => {
        void (async () => {
            const parsed = handoffToPlayerParams(raw)
            const client = parsed ? await getClient() : null
            if (!parsed || !client) {
                router.replace('/(tabs)/home')
                return
            }
            const url = parsed.kind === 'episode'
                ? client.seriesStreamUrl(parsed.sid, parsed.container)
                : client.vodStreamUrl(parsed.sid, parsed.container)
            router.replace({
                pathname: '/player',
                params: {
                    url,
                    title: parsed.title,
                    pid: parsed.pid,
                    kind: parsed.kind,
                    sid: parsed.sid,
                    container: parsed.container,
                    startAt: String(parsed.startAt),
                },
            })
        })()
        // Deep link: roda uma vez com os params de entrada.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <View style={styles.root}>
            <ActivityIndicator size="large" color="#7c3aed" />
            <Text style={styles.text}>{t('handoffOpening')}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0f0f1e', alignItems: 'center', justifyContent: 'center', gap: 14 },
    text: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
})
