import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { listErrors, type LoggedError } from '../services/errorLog'
import { loadSpeedHistory, runSpeedTest, saveSpeedSample, type SpeedSample, type SpeedVerdict } from '../services/speedtest'
import { accountLabel, cachedFetch, getClient, loadAccount, type StoredAccount } from '../services/session'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { tvSize } from '../ui/tv'
import { t, tf } from '../i18n/strings'

interface DiagRow { label: string; ok: boolean; ms: number; extra?: string }

/**
 * 🩺 Saúde da conexão: diagnóstico do provedor + velocímetro (com histórico) +
 * relatório compartilhável, unificados numa tela só — antes eram blocos soltos
 * na seção "Conta ativa" dos Ajustes.
 */
export default function Health() {
    const [diag, setDiag] = useState<DiagRow[] | 'running' | null>(null)
    const [speedMsg, setSpeedMsg] = useState('')
    const [speedHist, setSpeedHist] = useState<SpeedSample[]>([])
    const [errorList, setErrorList] = useState<LoggedError[]>([])
    const [active, setActive] = useState<StoredAccount | null>(null)

    useEffect(() => {
        void loadSpeedHistory().then(setSpeedHist)
        void listErrors().then(setErrorList)
        void loadAccount().then(setActive)
    }, [])

    const testConnection = () => {
        setDiag('running')
        void (async () => {
            const rows: DiagRow[] = []
            const client = await getClient()
            if (!client) { setDiag([]); return }
            const timed = async (label: string, run: () => Promise<string>) => {
                const startedAt = Date.now()
                try {
                    const extra = await run()
                    rows.push({ label, ok: true, ms: Date.now() - startedAt, extra })
                } catch {
                    rows.push({ label, ok: false, ms: Date.now() - startedAt })
                }
            }
            await timed(t('connAuth'), async () => {
                await client.authenticate()
                return ''
            })
            let firstChannel = ''
            await timed(t('connChannels'), async () => {
                const channels = await client.getLiveChannels()
                firstChannel = channels[0] ? String(channels[0].stream_id) : ''
                return tf('connItems', { n: channels.length })
            })
            await timed(t('connVod'), async () => {
                const movies = await client.getVodMovies()
                return tf('connItems', { n: movies.length })
            })
            if (firstChannel) {
                await timed(t('connEpg'), async () => {
                    const nowNext = await client.getShortEpg(firstChannel)
                    return nowNext.now?.title ?? '—'
                })
            }
            setDiag(rows)
        })()
    }

    const runSpeed = () => {
        setSpeedMsg(t('speedRunning'))
        void (async () => {
            const client = await getClient()
            const first = client ? (await cachedFetch('live', () => client.getLiveChannels()))[0] : undefined
            if (!client || !first) { setSpeedMsg(t('speedFail')); return }
            const result = await runSpeedTest(client.liveStreamUrl(first.stream_id))
            if (!result) { setSpeedMsg(t('speedFail')); return }
            const verdictKey: Record<SpeedVerdict, 'speed4k' | 'speedHd' | 'speedSd' | 'speedSlow'> = {
                '4k': 'speed4k', hd: 'speedHd', sd: 'speedSd', slow: 'speedSlow',
            }
            setSpeedMsg(tf('speedResult', { mbps: result.mbps, verdict: t(verdictKey[result.verdict]) }))
            await saveSpeedSample({ at: Date.now(), mbps: result.mbps, verdict: result.verdict })
            setSpeedHist(await loadSpeedHistory())
        })()
    }

    const shareReport = () => {
        const lines = [
            `NeoStream Mobile v${Constants.expoConfig?.version ?? '?'}`,
            `Conta: ${active ? accountLabel(active).replace(/^[^@]+@/, '***@') : '—'} (${active?.type ?? 'xtream'})`,
            '',
            'Velocímetro:',
            ...speedHist.slice(0, 5).map(sample =>
                `  ${new Date(sample.at).toLocaleString()} — ${sample.mbps} Mbps (${sample.verdict})`),
            '',
            'Últimos erros:',
            ...errorList.slice(0, 5).map(entry => `  ${new Date(entry.at).toLocaleString()} — ${entry.message}`),
        ]
        void Share.share({ message: lines.join('\n') }).catch(() => undefined)
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Stack.Screen options={{ title: t('healthTitle') }} />

            <TvTouchable style={styles.btn} disabled={diag === 'running'} onPress={testConnection}>
                <Ionicons name="pulse-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>{diag === 'running' ? t('testing') : t('testConn')}</Text>
            </TvTouchable>

            {Array.isArray(diag) ? diag.map(row => (
                <View key={row.label} style={styles.diagRow}>
                    <Ionicons
                        name={row.ok ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={row.ok ? colors.live : colors.danger}
                    />
                    <Text style={styles.diagLabel}>{row.label}</Text>
                    <Text style={styles.diagMeta}>
                        {row.ms >= 1000 ? `${(row.ms / 1000).toFixed(1)}s` : `${row.ms}ms`}
                        {row.extra ? ` · ${row.extra}` : ''}
                    </Text>
                </View>
            )) : null}

            <TvTouchable style={styles.btn} disabled={speedMsg === t('speedRunning')} onPress={runSpeed}>
                <Ionicons name="speedometer-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>{speedMsg || t('speedBtn')}</Text>
            </TvTouchable>

            {speedHist.length > 0 ? (
                <View style={{ gap: 4 }}>
                    <Text style={styles.hint}>{t('speedHistTitle')}</Text>
                    {speedHist.map(sample => (
                        <View key={sample.at} style={styles.diagRow}>
                            <Ionicons name="speedometer-outline" size={14} color={colors.textDim} />
                            <Text style={styles.diagLabel}>
                                {new Date(sample.at).toLocaleDateString()} {new Date(sample.at).toLocaleTimeString().slice(0, 5)}
                            </Text>
                            <Text style={styles.diagMeta}>{sample.mbps} Mbps</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            <TvTouchable style={[styles.btn, styles.btnAlt]} onPress={shareReport}>
                <Ionicons name="document-text-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>{t('diagCopyBtn')}</Text>
            </TvTouchable>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, gap: spacing.md },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 8,
        paddingVertical: 10,
    },
    btnAlt: { backgroundColor: colors.danger },
    btnText: { color: '#fff', fontSize: tvSize(14), fontWeight: '600' },
    hint: { color: colors.textDim, fontSize: tvSize(13), lineHeight: 18 },
    diagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    diagLabel: { flex: 1, color: colors.text, fontSize: tvSize(14) },
    diagMeta: { color: colors.textDim, fontSize: tvSize(13) },
})
