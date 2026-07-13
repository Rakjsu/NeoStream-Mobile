import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, Linking, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { disableAppLock, enableAppLock, loadAppLock } from '../../services/appLock'
import { applyCapturePolicy } from '../../services/privacy'
import { isDataSaverEnabled, setDataSaver } from '../../services/dataSaver'
import { getDownloadLimitGb, isSmartDownloads, isWifiOnly, listDownloads, setDownloadLimitGb, setSmartDownloads, setWifiOnly , listFreeable, removeDownload as removeDl } from '../../services/downloads'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { chooseCloudBackupDir, clearCloudBackupDir, getCloudBackupDir, listAutoBackups, readAutoBackup, type AutoBackupFile } from '../../services/autoBackup'
import { listErrors, type LoggedError } from '../../services/errorLog'
import { cancelScheduled, listScheduled, type ScheduledReminder } from '../../services/notify'
import { listRecurring, removeRecurring, type RecurringReminder } from '../../services/recurring'
import { buildSetupLink } from '../../services/setupLink'
import { getTmdbKey, setTmdbKey } from '../../services/tmdb'
import { listHiddenChannels, unhideChannel, type HiddenChannel } from '../../services/hidden'
import { applyBackup, collectBackup, parseBackup, serializeBackup } from '../../services/backup'
import { disableParental, enableParental, isValidPin, listBlockedCategories, loadParental } from '../../services/parental'
import { isKidsMode, listKidsCategories, setKidsMode } from '../../services/kids'
import { loadSpeedHistory, runSpeedTest, saveSpeedSample, type SpeedSample, type SpeedVerdict } from '../../services/speedtest'
import { clearHistory } from '../../services/progress'
import { checkForUpdate } from '../../services/updates'
import {
    accountLabel, cachedFetch, clearCatalogCache, getClient, listAccounts, loadAccount, removeAccount, renameAccount, switchAccount,
    type StoredAccount,
} from '../../services/session'
import { currentStreak, dayKey, formatMinutes, lastDays, lastMonths, loadMonthUsage, loadTitleUsage, loadUsage, monthKey, summarize, topTitles, usageCsv, type TopTitle, type UsageSummary } from '../../services/usage'
import { parseExpiry } from '../../services/xtream'
import { TvTouchable } from '../../ui/components'
import { colors, setThemeVariant, spacing, themeVariant } from '../../ui/theme'
import { t, tf } from '../../i18n/strings'

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
        </View>
    )
}

export default function SettingsTab() {
    const [accounts, setAccounts] = useState<StoredAccount[]>([])
    const [active, setActive] = useState<StoredAccount | null>(null)
    const [parentalOn, setParentalOn] = useState(false)
    const [pin, setPin] = useState('')
    const [pinError, setPinError] = useState('')
    const [lockOn, setLockOn] = useState(false)
    const [lockPin, setLockPin] = useState('')
    const [lockError, setLockError] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [dlLimit, setDlLimit] = useState(0)
    const [dlBytes, setDlBytes] = useState(0)
    const [dataSaver, setDataSaverState] = useState(false)
    const [updateMsg, setUpdateMsg] = useState('')
    const [usage, setUsage] = useState<UsageSummary>({ totals: { live: 0, movie: 0, episode: 0 }, totalMinutes: 0 })
    const [usageDays, setUsageDays] = useState<{ day: string; minutes: number }[]>([])
    const [usageMonths, setUsageMonths] = useState<{ month: string; minutes: number }[]>([])
    const [streak, setStreak] = useState(0)
    const [topLive, setTopLive] = useState<TopTitle[]>([])
    const [topShows, setTopShows] = useState<TopTitle[]>([])
    const usageShotRef = useRef<View>(null)
    const [aliasDraft, setAliasDraft] = useState('')
    const [importText, setImportText] = useState('')
    const [backupMsg, setBackupMsg] = useState('')
    const [autoCopies, setAutoCopies] = useState<AutoBackupFile[]>([])
    const [hiddenList, setHiddenList] = useState<HiddenChannel[]>([])
    const [errorList, setErrorList] = useState<LoggedError[]>([])
    const [reminders, setReminders] = useState<ScheduledReminder[]>([])
    const [recurring, setRecurring] = useState<RecurringReminder[]>([])
    // Modo infantil: kidsGate cobre a tela até o PIN do parental liberar.
    const [kidsOn, setKidsOn] = useState(false)
    const [kidsGate, setKidsGate] = useState(false)
    const [gatePin, setGatePin] = useState('')
    const [gateError, setGateError] = useState('')
    const [tmdbDraft, setTmdbDraft] = useState('')
    const [speedMsg, setSpeedMsg] = useState('')
    const [wifiOnly, setWifiOnlyState] = useState(false)
    const [smartDl, setSmartDlState] = useState(false)
    const [cloudDir, setCloudDir] = useState('')
    const [speedHist, setSpeedHist] = useState<SpeedSample[]>([])
    const [bootLive, setBootLive] = useState(false)
    const [freeMsg, setFreeMsg] = useState('')
    const [kidsCatCount, setKidsCatCount] = useState(0)
    const [blockedCount, setBlockedCount] = useState(0)
    const [amoled, setAmoled] = useState(themeVariant() === 'amoled')

    const refreshStorage = useCallback(() => {
        void listDownloads().then(items => setDlBytes(items.reduce((sum, item) => sum + item.sizeBytes, 0)))
    }, [])

    const refresh = useCallback(() => {
        void listAccounts().then(setAccounts)
        void loadAccount().then(setActive)
        void loadParental().then(state => setParentalOn(state.enabled))
        void isKidsMode().then(on => { setKidsOn(on); setKidsGate(on) })
        void listKidsCategories().then(list => setKidsCatCount(list.length))
        void listBlockedCategories().then(list => setBlockedCount(list.length))
        void getTmdbKey().then(setTmdbDraft)
        void loadAppLock().then(state => setLockOn(state.enabled))
        void listAutoBackups().then(setAutoCopies)
        void listHiddenChannels().then(setHiddenList)
        void listErrors().then(setErrorList)
        void listScheduled().then(setReminders)
        void listRecurring().then(setRecurring)
        void getDownloadLimitGb().then(setDlLimit)
        void isDataSaverEnabled().then(setDataSaverState)
        void isWifiOnly().then(setWifiOnlyState)
        void isSmartDownloads().then(setSmartDlState)
        void getCloudBackupDir().then(setCloudDir)
        void loadSpeedHistory().then(setSpeedHist)
        void AsyncStorage.getItem('neostream_boot_tab').then(v => setBootLive(v === 'live')).catch(() => undefined)
        refreshStorage()
        void loadUsage().then(map => {
            const today = dayKey(Date.now())
            setUsage(summarize(map, today))
            setUsageDays(lastDays(map, today))
            setStreak(currentStreak(map, today))
        })
        void loadMonthUsage().then(map => setUsageMonths(lastMonths(map, monthKey(Date.now()))))
        void loadTitleUsage().then(titles => {
            const today = dayKey(Date.now())
            setTopLive(topTitles(titles, today, ['live']))
            setTopShows(topTitles(titles, today, ['episode', 'movie']))
        })
    }, [refreshStorage])

    useFocusEffect(useCallback(() => { queueMicrotask(refresh) }, [refresh]))

    const activate = (account: StoredAccount) => {
        if (account.id === active?.id) return
        void switchAccount(account.id).then(() => {
            // Passa pelo index pra remontar as abas já na conta nova.
            router.replace('/')
        })
    }

    const confirmRemove = (account: StoredAccount) => {
        Alert.alert(t('removeAccountTitle'), tf('removeAccountMsg', { label: accountLabel(account) }), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('remove'),
                style: 'destructive',
                onPress: () => {
                    void removeAccount(account.id).then(nextActive => {
                        if (!nextActive) router.replace('/login')
                        else if (account.id === active?.id) router.replace('/')
                        else refresh()
                    })
                },
            },
        ])
    }


    interface DiagRow { label: string; ok: boolean; ms: number; extra?: string }
    const [diag, setDiag] = useState<DiagRow[] | 'running' | null>(null)

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

    const expiry = parseExpiry(active?.userInfo?.exp_date)

    if (kidsGate) {
        return (
            <View style={styles.gateRoot}>
                <Ionicons name="lock-closed" size={44} color={colors.accent} />
                <Text style={styles.gateTitle}>{t('kidsGateTitle')}</Text>
                <Text style={styles.parentalHint}>{t('kidsGateHint')}</Text>
                <TextInput
                    style={[styles.pinInput, { alignSelf: 'stretch' }]}
                    value={gatePin}
                    onChangeText={text => { setGatePin(text.replace(/[^0-9]/g, '')); setGateError('') }}
                    placeholder={t('pinPh')}
                    placeholderTextColor={colors.textDim}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                />
                <TvTouchable
                    style={styles.parentalBtn}
                    onPress={() => {
                        void loadParental().then(state => {
                            if (state.pin && gatePin === state.pin) {
                                setKidsGate(false)
                                setGatePin('')
                            } else {
                                setGateError(t('pinWrong'))
                            }
                        })
                    }}
                >
                    <Text style={styles.parentalBtnText}>{t('enable')}</Text>
                </TvTouchable>
                {gateError ? <Text style={styles.pinError}>{gateError}</Text> : null}
            </View>
        )
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.section}>{t('secAccounts')}</Text>
            <View style={styles.card}>
                {accounts.map(account => {
                    const isActive = account.id === active?.id
                    if (editingId === account.id) {
                        return (
                            <View key={account.id} style={styles.accountRow}>
                                <TextInput
                                    style={styles.aliasInput}
                                    value={aliasDraft}
                                    onChangeText={setAliasDraft}
                                    placeholder={t('aliasPh')}
                                    placeholderTextColor={colors.textDim}
                                    autoFocus
                                    maxLength={24}
                                />
                                <TvTouchable
                                    style={styles.trash}
                                    accessibilityLabel={t('a11yConfirm')}
                                    onPress={() => {
                                        void renameAccount(account.id, aliasDraft).then(() => {
                                            setEditingId(null)
                                            refresh()
                                        })
                                    }}
                                >
                                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                                </TvTouchable>
                            </View>
                        )
                    }
                    return (
                        <View key={account.id} style={styles.accountRow}>
                            <TvTouchable style={styles.accountMain} onPress={() => activate(account)}>
                                <Ionicons
                                    name={isActive ? 'radio-button-on' : 'radio-button-off'}
                                    size={18}
                                    color={isActive ? colors.accent : colors.textDim}
                                />
                                <Text style={[styles.accountName, isActive && styles.accountNameActive]} numberOfLines={1}>
                                    {accountLabel(account)}
                                </Text>
                            </TvTouchable>
                            <TvTouchable
                                style={styles.trash}
                                accessibilityLabel={t('a11yEdit')}
                                onPress={() => { setEditingId(account.id); setAliasDraft(account.alias ?? '') }}
                            >
                                <Ionicons name="pencil-outline" size={16} color={colors.textDim} />
                            </TvTouchable>
                            <TvTouchable style={styles.trash} accessibilityLabel={t('a11yDelete')} onPress={() => confirmRemove(account)}>
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TvTouchable>
                        </View>
                    )
                })}
                <TvTouchable style={styles.addRow} onPress={() => router.push('/login')}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                    <Text style={styles.addText}>{t('addAccount')}</Text>
                </TvTouchable>
            </View>

            <Text style={styles.section}>{t('secActiveAccount')}</Text>
            <View style={styles.card}>
                <InfoRow label={t('serverRow')} value={active?.url ?? '—'} />
                <InfoRow label={t('userRow')} value={active?.username ?? '—'} />
                <InfoRow label={t('statusRow')} value={active?.userInfo?.status ?? '—'} />
                <InfoRow
                    label={t('expiresRow')}
                    value={expiry ? expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : t('noExpiry')}
                />
                <InfoRow
                    label={t('connectionsRow')}
                    value={tf('connOf', { a: active?.userInfo?.active_cons ?? '?', b: active?.userInfo?.max_connections ?? '?' })}
                />
                <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
                    <TvTouchable
                        style={styles.backupBtn}
                        disabled={diag === 'running'}
                        onPress={testConnection}
                    >
                        <Ionicons name="pulse-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{diag === 'running' ? t('testing') : t('testConn')}</Text>
                    </TvTouchable>
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn]}
                        onPress={() => {
                            void clearCatalogCache().then(() => {
                                setBackupMsg('')
                                router.replace('/')
                            })
                        }}
                    >
                        <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{t('clearCacheBtn')}</Text>
                    </TvTouchable>
                    <TvTouchable
                        style={styles.backupBtn}
                        disabled={speedMsg === t('speedRunning')}
                        onPress={() => {
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
                        }}
                    >
                        <Ionicons name="speedometer-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{speedMsg || t('speedBtn')}</Text>
                    </TvTouchable>
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn]}
                        onPress={() => {
                            const lines = [
                                `NeoStream Mobile v${Constants.expoConfig?.version ?? '?'}`,
                                `Conta: ${active ? accountLabel(active).replace(/^[^@]+@/, '***@') : '—'} (${active?.type ?? 'xtream'})`,
                                '',
                                'Velocímetro:',
                                ...speedHist.slice(0, 5).map(s =>
                                    `  ${new Date(s.at).toLocaleString()} — ${s.mbps} Mbps (${s.verdict})`),
                                '',
                                'Últimos erros:',
                                ...errorList.slice(0, 5).map(e => `  ${new Date(e.at).toLocaleString()} — ${e.message}`),
                            ]
                            void Share.share({ message: lines.join('\n') }).catch(() => undefined)
                        }}
                    >
                        <Ionicons name="document-text-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{t('diagCopyBtn')}</Text>
                    </TvTouchable>
                    {speedHist.length > 0 ? (
                        <View style={{ gap: 4 }}>
                            <Text style={styles.parentalHint}>{t('speedHistTitle')}</Text>
                            {speedHist.slice(0, 5).map(sample => (
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
                </View>
            </View>

            <Text style={styles.section}>{t('secParental')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>
                    {parentalOn ? t('parentalOnHint') : t('parentalOffHint')}
                </Text>
                <View style={styles.pinRow}>
                    <TextInput
                        style={styles.pinInput}
                        value={pin}
                        onChangeText={text => { setPin(text.replace(/[^0-9]/g, '')); setPinError('') }}
                        placeholder={t('pinPh')}
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                    />
                    <TvTouchable
                        style={[styles.parentalBtn, parentalOn && styles.parentalBtnOff]}
                        onPress={() => {
                            void (async () => {
                                if (!isValidPin(pin)) { setPinError(t('pinLen')); return }
                                const ok = parentalOn ? await disableParental(pin) : await enableParental(pin)
                                if (!ok) { setPinError(t('pinWrong')); return }
                                setPin('')
                                // Recarrega as abas já com (ou sem) o filtro.
                                router.replace('/')
                            })()
                        }}
                    >
                        <Text style={styles.parentalBtnText}>{parentalOn ? t('disable') : t('enable')}</Text>
                    </TvTouchable>
                </View>
                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        void (async () => {
                            if (kidsOn) {
                                // Já passou pelo PIN pra chegar aqui — desliga direto.
                                await setKidsMode(false)
                                setKidsOn(false)
                                return
                            }
                            const state = await loadParental()
                            if (!state.enabled) { Alert.alert(t('kidsNeedsParental')); return }
                            await setKidsMode(true)
                            setKidsOn(true)
                            Alert.alert(t('kidsOnMsg'))
                        })()
                    }}
                >
                    <Ionicons name={kidsOn ? 'happy' : 'happy-outline'} size={18} color={kidsOn ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, kidsOn && { color: colors.accent }]}>
                        {kidsOn ? t('kidsOn') : t('kidsOff')}
                    </Text>
                </TvTouchable>
                {parentalOn ? (
                    <TvTouchable style={styles.kidsRow} onPress={() => router.push('/blockedcats')}>
                        <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
                        <Text style={styles.kidsText}>{tf('blockedCatsBtn', { n: blockedCount })}</Text>
                    </TvTouchable>
                ) : null}
                <TvTouchable style={styles.kidsRow} onPress={() => router.push('/kidscats')}>
                    <Ionicons name="albums-outline" size={18} color={colors.textDim} />
                    <Text style={styles.kidsText}>{tf('kidsCatsBtn', { n: kidsCatCount })}</Text>
                </TvTouchable>
            </View>

            <Text style={styles.section}>{t('secAppLock')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{lockOn ? t('appLockOnHint') : t('appLockOffHint')}</Text>
                <View style={styles.pinRow}>
                    <TextInput
                        style={styles.pinInput}
                        value={lockPin}
                        onChangeText={text => { setLockPin(text.replace(/[^0-9]/g, '')); setLockError('') }}
                        placeholder={t('pinPh')}
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                    />
                    <TvTouchable
                        style={[styles.parentalBtn, lockOn && styles.parentalBtnOff]}
                        onPress={() => {
                            void (async () => {
                                if (!isValidPin(lockPin)) { setLockError(t('pinLen')); return }
                                const ok = lockOn ? await disableAppLock(lockPin) : await enableAppLock(lockPin)
                                if (!ok) { setLockError(t('pinWrong')); return }
                                setLockPin('')
                                setLockOn(!lockOn)
                                void applyCapturePolicy()
                            })()
                        }}
                    >
                        <Text style={styles.parentalBtnText}>{lockOn ? t('disable') : t('enable')}</Text>
                    </TvTouchable>
                </View>
                {lockError ? <Text style={styles.pinError}>{lockError}</Text> : null}
            </View>

            <Text style={styles.section}>{t('secUsage')}</Text>
            <View ref={usageShotRef} collapsable={false} style={styles.card}>
                <InfoRow label={t('usageWeek')} value="" />
                <View style={styles.usageBars}>
                    {usageDays.map(entry => {
                        const peak = Math.max(1, ...usageDays.map(d => d.minutes))
                        return (
                            <View key={entry.day} style={styles.usageBarSlot}>
                                <View style={[styles.usageBar, { height: Math.max(3, Math.round((entry.minutes / peak) * 44)) }]} />
                                <Text style={styles.usageBarLabel}>{entry.day.slice(8)}</Text>
                            </View>
                        )
                    })}
                </View>
                {streak >= 2 ? <Text style={[styles.parentalHint, { color: colors.accent }]}>{tf('streakLabel', { n: streak })}</Text> : null}
                <Text style={styles.parentalHint}>{t('usageMonths')}</Text>
                <View style={styles.usageBars}>
                    {usageMonths.map(entry => {
                        const peak = Math.max(1, ...usageMonths.map(m => m.minutes))
                        return (
                            <View key={entry.month} style={styles.usageBarSlot}>
                                <View style={[styles.usageBar, { height: Math.max(3, Math.round((entry.minutes / peak) * 44)) }]} />
                                <Text style={styles.usageBarLabel}>{entry.month.slice(5)}</Text>
                            </View>
                        )
                    })}
                </View>
                <TvTouchable
                    style={[styles.backupBtn, styles.restoreBtn]}
                    onPress={() => {
                        void (async () => {
                            const csv = usageCsv(await loadMonthUsage())
                            const fileUri = `${FileSystem.cacheDirectory}neostream-uso.csv`
                            await FileSystem.writeAsStringAsync(fileUri, csv)
                            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri)
                        })()
                    }}
                >
                    <Ionicons name="download-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('exportCsvBtn')}</Text>
                </TvTouchable>
                <InfoRow label={t('tabLive')} value={formatMinutes(usage.totals.live)} />
                <InfoRow label={t('tabMovies')} value={formatMinutes(usage.totals.movie)} />
                <InfoRow label={t('tabSeries')} value={formatMinutes(usage.totals.episode)} />
                <InfoRow label={t('usageTotal')} value={formatMinutes(usage.totalMinutes)} />
                {topLive.length > 0 ? <InfoRow label={t('topChannels')} value="" /> : null}
                {topLive.map((entry, index) => (
                    <InfoRow key={`l${entry.title}`} label={`${index + 1}. ${entry.title}`} value={formatMinutes(entry.minutes)} />
                ))}
                {topShows.length > 0 ? <InfoRow label={t('topContent')} value="" /> : null}
                {topShows.map((entry, index) => (
                    <InfoRow key={`s${entry.title}`} label={`${index + 1}. ${entry.title}`} value={formatMinutes(entry.minutes)} />
                ))}
                <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
                    <TvTouchable
                        style={styles.backupBtn}
                        onPress={() => {
                            void (async () => {
                                try {
                                    const uri = await captureRef(usageShotRef, { format: 'png', quality: 1 })
                                    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri)
                                } catch { /* aparelho sem share de arquivo */ }
                            })()
                        }}
                    >
                        <Ionicons name="image-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{t('shareImageBtn')}</Text>
                    </TvTouchable>
                    <TvTouchable
                        style={styles.backupBtn}
                        onPress={() => {
                            void Share.share({
                                message: tf('usageShare', {
                                    total: formatMinutes(usage.totalMinutes),
                                    live: formatMinutes(usage.totals.live),
                                    movie: formatMinutes(usage.totals.movie),
                                    episode: formatMinutes(usage.totals.episode),
                                }),
                            }).catch(() => undefined)
                        }}
                    >
                        <Ionicons name="share-social-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{t('shareUsageBtn')}</Text>
                    </TvTouchable>
                </View>
            </View>

            <Text style={styles.section}>{t('secStorage')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('storageHint')}</Text>
                <View style={styles.limitRow}>
                    {[0, 1, 2, 5].map(gb => (
                        <TvTouchable
                            key={gb}
                            style={[styles.limitChip, dlLimit === gb && styles.limitChipOn]}
                            onPress={() => {
                                setDlLimit(gb)
                                void setDownloadLimitGb(gb).then(refreshStorage)
                            }}
                        >
                            <Text style={[styles.limitChipText, dlLimit === gb && styles.limitChipTextOn]}>
                                {gb === 0 ? t('noLimit') : `${gb} GB`}
                            </Text>
                        </TvTouchable>
                    ))}
                </View>
                <Text style={styles.parentalHint}>{tf('usedSpace', { mb: Math.round(dlBytes / 1048576) })}</Text>
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        const next = !amoled
                        setAmoled(next)
                        void setThemeVariant(next ? 'amoled' : 'dark')
                    }}
                >
                    <Ionicons name={amoled ? 'contrast' : 'contrast-outline'} size={18} color={amoled ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, amoled && { color: colors.accent }]}>{t('themeAmoled')}</Text>
                </TvTouchable>
                {amoled ? <Text style={styles.parentalHint}>{t('themeHint')}</Text> : null}
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        const next = !wifiOnly
                        setWifiOnlyState(next)
                        void setWifiOnly(next)
                    }}
                >
                    <Ionicons name={wifiOnly ? 'wifi' : 'wifi-outline'} size={18} color={wifiOnly ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, wifiOnly && { color: colors.accent }]}>{t('wifiOnlyLabel')}</Text>
                </TvTouchable>
                {wifiOnly ? <Text style={styles.parentalHint}>{t('wifiOnlyHint')}</Text> : null}
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        const next = !smartDl
                        setSmartDlState(next)
                        void setSmartDownloads(next)
                    }}
                >
                    <Ionicons name={smartDl ? 'sparkles' : 'sparkles-outline'} size={18} color={smartDl ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, smartDl && { color: colors.accent }]}>{t('smartDlLabel')}</Text>
                </TvTouchable>
                {smartDl ? <Text style={styles.parentalHint}>{t('smartDlHint')}</Text> : null}
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        const next = !bootLive
                        setBootLive(next)
                        void (next
                            ? AsyncStorage.setItem('neostream_boot_tab', 'live')
                            : AsyncStorage.removeItem('neostream_boot_tab')
                        ).catch(() => undefined)
                    }}
                >
                    <Ionicons name={bootLive ? 'tv' : 'tv-outline'} size={18} color={bootLive ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, bootLive && { color: colors.accent }]}>{t('bootLive')}</Text>
                </TvTouchable>
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        void (async () => {
                            const freeable = await listFreeable()
                            if (freeable.length === 0) { setFreeMsg(t('freeSpaceNone')); return }
                            const mb = Math.round(freeable.reduce((sum, item) => sum + item.sizeBytes, 0) / 1048576)
                            for (const item of freeable) await removeDl(item.id)
                            refreshStorage()
                            setFreeMsg(tf('freed', { mb }))
                        })()
                    }}
                >
                    <Ionicons name="trash-bin-outline" size={18} color={colors.textDim} />
                    <Text style={styles.kidsText}>{freeMsg || tf('freeSpaceBtn', { n: '?', mb: '?' })}</Text>
                </TvTouchable>
                <TvTouchable
                    style={styles.saverRow}
                    onPress={() => {
                        const next = !dataSaver
                        setDataSaverState(next)
                        void setDataSaver(next)
                    }}
                >
                    <Ionicons
                        name={dataSaver ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={dataSaver ? colors.accent : colors.textDim}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.saverTitle}>{t('dataSaverTitle')}</Text>
                        <Text style={styles.parentalHint}>{t('dataSaverHint')}</Text>
                    </View>
                </TvTouchable>
            </View>

            <Text style={styles.section}>{t('remindersSection')}</Text>
            <TvTouchable style={[styles.kidsRow, { paddingBottom: spacing.sm }]} onPress={() => router.push('/agenda')}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={[styles.kidsText, { color: colors.accent }]}>{t('agendaOpen')}</Text>
            </TvTouchable>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.sm }]}>
                {recurring.map(reminder => (
                    <View key={`r${reminder.channelId}${reminder.title}`} style={styles.diagRow}>
                        <Ionicons name="repeat-outline" size={16} color={colors.accent} />
                        <Text style={styles.diagLabel} numberOfLines={1}>{reminder.title} · {reminder.channelName}</Text>
                        <TvTouchable
                            accessibilityLabel={t('cancel')}
                            onPress={() => { void removeRecurring(reminder).then(setRecurring) }}
                        >
                            <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                        </TvTouchable>
                    </View>
                ))}
                {reminders.length === 0 && recurring.length === 0 ? (
                    <Text style={styles.parentalHint}>{t('remindersNone')}</Text>
                ) : reminders.map(reminder => (
                    <View key={reminder.id} style={styles.diagRow}>
                        <Ionicons name="alarm-outline" size={16} color={colors.textDim} />
                        <Text style={styles.diagLabel} numberOfLines={1}>
                            {reminder.title} · {new Date(reminder.atMs).toLocaleTimeString().slice(0, 5)}
                        </Text>
                        <TvTouchable
                            accessibilityLabel={t('cancel')}
                            onPress={() => {
                                void cancelScheduled(reminder.id)
                                    .then(listScheduled)
                                    .then(setReminders)
                            }}
                        >
                            <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                        </TvTouchable>
                    </View>
                ))}
            </View>

            <Text style={styles.section}>{t('hiddenSection')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.sm }]}>
                {hiddenList.length === 0 ? (
                    <Text style={styles.parentalHint}>{t('hiddenNone')}</Text>
                ) : hiddenList.map(channel => (
                    <View key={channel.id} style={styles.diagRow}>
                        <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
                        <Text style={styles.diagLabel} numberOfLines={1}>{channel.name}</Text>
                        <TvTouchable
                            onPress={() => {
                                void unhideChannel(channel.id)
                                    .then(listHiddenChannels)
                                    .then(setHiddenList)
                            }}
                        >
                            <Text style={styles.unhideText}>{t('unhide')}</Text>
                        </TvTouchable>
                    </View>
                ))}
            </View>

            <Text style={styles.section}>{t('secHistory')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('historyHint')}</Text>
                <TvTouchable style={styles.backupBtn} onPress={() => router.push('/history')}>
                    <Ionicons name="time-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('viewHistory')}</Text>
                </TvTouchable>
                <TvTouchable
                    style={[styles.backupBtn, styles.restoreBtn]}
                    onPress={() => {
                        Alert.alert(t('clearHistoryTitle'), t('clearHistoryMsg'), [
                            { text: t('cancel'), style: 'cancel' },
                            { text: t('clear'), style: 'destructive', onPress: () => void clearHistory() },
                        ])
                    }}
                >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('clearHistoryBtn')}</Text>
                </TvTouchable>
            </View>

            <Text style={styles.section}>{t('secBackup')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('backupHint')}</Text>
                <TvTouchable
                    style={styles.backupBtn}
                    onPress={() => {
                        void (async () => {
                            const json = serializeBackup(await collectBackup())
                            await Share.share({ message: json }).catch(() => undefined)
                        })()
                    }}
                >
                    <Ionicons name="share-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('exportBtn')}</Text>
                </TvTouchable>
                <TvTouchable
                    style={styles.ghRow}
                    onPress={() => {
                        void (async () => {
                            try {
                                const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
                                const asset = picked.assets?.[0]
                                if (!asset?.uri) return
                                const content = await FileSystem.readAsStringAsync(asset.uri)
                                setImportText(content)
                                setBackupMsg('')
                            } catch {
                                setBackupMsg(t('fileReadFail'))
                            }
                        })()
                    }}
                >
                    <Ionicons name="folder-open-outline" size={16} color={colors.textDim} />
                    <Text style={styles.ghText}>{t('openBackupFile')}</Text>
                </TvTouchable>
                <TvTouchable
                    style={styles.backupBtn}
                    onPress={() => {
                        void (async () => {
                            try {
                                const json = serializeBackup(await collectBackup())
                                const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
                                if (!permission.granted) return
                                const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                                    permission.directoryUri, `neostream-backup-${dayKey(Date.now())}`, 'application/json')
                                await FileSystem.writeAsStringAsync(fileUri, json)
                                setBackupMsg(t('backupSaved'))
                            } catch {
                                setBackupMsg(t('fileReadFail'))
                            }
                        })()
                    }}
                >
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('saveBackupFile')}</Text>
                </TvTouchable>
                <TextInput
                    style={styles.importInput}
                    value={importText}
                    onChangeText={text => { setImportText(text); setBackupMsg('') }}
                    placeholder={t('importPh')}
                    placeholderTextColor={colors.textDim}
                    multiline
                    numberOfLines={3}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                <TvTouchable
                    style={[styles.backupBtn, styles.restoreBtn, !importText.trim() && { opacity: 0.5 }]}
                    disabled={!importText.trim()}
                    onPress={() => {
                        try {
                            const backup = parseBackup(importText)
                            Alert.alert(
                                t('restoreTitle'),
                                tf('restoreMsg', { n: backup.accounts.length }),
                                [
                                    { text: t('cancel'), style: 'cancel' },
                                    {
                                        text: t('restoreBtn'),
                                        style: 'destructive',
                                        onPress: () => {
                                            void applyBackup(backup).then(() => {
                                                setImportText('')
                                                router.replace('/')
                                            })
                                        },
                                    },
                                ],
                            )
                        } catch (err) {
                            setBackupMsg(err instanceof Error ? err.message : t('backupInvalid'))
                        }
                    }}
                >
                    <Ionicons name="download-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{t('restoreBtn')}</Text>
                </TvTouchable>
                {backupMsg ? <Text style={styles.pinError}>{backupMsg}</Text> : null}
                <Text style={styles.parentalHint}>
                    {autoCopies.length > 0 ? t('autoCopies') : t('autoCopiesNone')}
                </Text>
                {autoCopies.map(copy => (
                    <TvTouchable
                        key={copy.name}
                        style={styles.ghRow}
                        onPress={() => {
                            void readAutoBackup(copy.uri)
                                .then(content => { setImportText(content); setBackupMsg('') })
                                .catch(() => setBackupMsg(t('fileReadFail')))
                        }}
                    >
                        <Ionicons name="archive-outline" size={14} color={colors.textDim} />
                        <Text style={styles.ghText}>{copy.name.replace('auto-', '').replace('.json', '')}</Text>
                    </TvTouchable>
                ))}
            </View>


            <TvTouchable
                style={[styles.backupBtn, styles.restoreBtn, { marginBottom: spacing.sm }]}
                onPress={() => {
                    void (async () => {
                        if (cloudDir) {
                            await clearCloudBackupDir()
                            setCloudDir('')
                            return
                        }
                        if (await chooseCloudBackupDir()) setCloudDir(await getCloudBackupDir())
                    })()
                }}
            >
                <Ionicons name={cloudDir ? 'cloud-done-outline' : 'cloud-upload-outline'} size={16} color="#fff" />
                <Text style={styles.backupBtnText}>{cloudDir ? t('cloudBackupOn') : t('cloudBackupBtn')}</Text>
            </TvTouchable>
            <TvTouchable
                style={[styles.backupBtn, { marginBottom: spacing.md }]}
                onPress={() => {
                    void (async () => {
                        const link = buildSetupLink({
                            accounts,
                            activeId: active?.id ?? null,
                            tmdbKey: (await getTmdbKey()) || undefined,
                            prefs: { downloadLimitGb: dlLimit, dataSaver },
                        })
                        void Share.share({ message: link }).catch(() => undefined)
                    })()
                }}
            >
                <Ionicons name="qr-code-outline" size={16} color="#fff" />
                <Text style={styles.backupBtnText}>{t('shareSetupBtn')}</Text>
            </TvTouchable>

            <Text style={styles.section}>{t('secApis')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('tmdbHint')}</Text>
                <View style={styles.pinRow}>
                    <TextInput
                        style={styles.pinInput}
                        value={tmdbDraft}
                        onChangeText={setTmdbDraft}
                        placeholder={t('tmdbPh')}
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TvTouchable
                        style={styles.parentalBtn}
                        onPress={() => { void setTmdbKey(tmdbDraft).then(() => Alert.alert(t('tmdbSaved'))) }}
                    >
                        <Text style={styles.parentalBtnText}>{t('saveBtn')}</Text>
                    </TvTouchable>
                </View>
            </View>

            <Text style={styles.section}>{t('secAbout')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <InfoRow label={t('versionRow')} value={`v${Constants.expoConfig?.version ?? '?'}`} />
                <TvTouchable
                    style={styles.backupBtn}
                    disabled={updateMsg === 'checking'}
                    onPress={() => {
                        setUpdateMsg('checking')
                        void checkForUpdate(Constants.expoConfig?.version ?? '0.0.0', Date.now(), true)
                            .then(info => setUpdateMsg(info ? tf('updateFound', { version: info.version }) : t('upToDate')))
                            .catch(() => setUpdateMsg(t('upToDate')))
                    }}
                >
                    <Ionicons name="refresh-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>{updateMsg === 'checking' ? t('testing') : t('checkUpdateBtn')}</Text>
                </TvTouchable>
                {updateMsg && updateMsg !== 'checking' ? <Text style={styles.parentalHint}>{updateMsg}</Text> : null}
                <Text style={styles.parentalHint}>
                    {errorList.length === 0 ? t('errorsNone') : t('lastErrors')}
                </Text>
                {errorList.map(entry => (
                    <TvTouchable
                        key={entry.at}
                        onPress={() => void Share.share({ message: `${new Date(entry.at).toISOString()} — ${entry.message}` }).catch(() => undefined)}
                    >
                        <Text style={styles.errorLine} numberOfLines={2}>
                            {new Date(entry.at).toLocaleString()} — {entry.message}
                        </Text>
                    </TvTouchable>
                ))}
                <TvTouchable
                    style={styles.ghRow}
                    onPress={() => void Linking.openURL('https://github.com/Rakjsu/NeoStream-Mobile/releases')}
                >
                    <Ionicons name="logo-github" size={16} color={colors.textDim} />
                    <Text style={styles.ghText}>{t('openGitHub')}</Text>
                </TvTouchable>
            </View>

            <Text style={styles.version}>
                NeoStream Mobile v{Constants.expoConfig?.version ?? '?'}
            </Text>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textDim, fontSize: 13, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.md },
    card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    accountMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12 },
    accountName: { flex: 1, color: colors.textDim, fontSize: 14 },
    accountNameActive: { color: colors.text, fontWeight: '600' },
    trash: { padding: spacing.sm },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12 },
    aliasInput: {
        flex: 1,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        fontSize: 14,
        marginVertical: 6,
    },
    addText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.lg,
        paddingVertical: 12,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    infoLabel: { color: colors.textDim, fontSize: 14 },
    infoValue: { color: colors.text, fontSize: 14, flexShrink: 1 },
    version: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
    parentalHint: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
    pinRow: { flexDirection: 'row', gap: spacing.md },
    gateRoot: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xl,
    },
    gateTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    kidsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
    kidsText: { color: colors.textDim, fontSize: 13, fontWeight: '600', flex: 1 },
    pinInput: {
        flex: 1,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        fontSize: 15,
        letterSpacing: 4,
    },
    parentalBtn: {
        backgroundColor: colors.accent,
        borderRadius: 8,
        paddingHorizontal: spacing.lg,
        justifyContent: 'center',
    },
    parentalBtnOff: { backgroundColor: colors.danger },
    parentalBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    pinError: { color: colors.danger, fontSize: 13 },
    limitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    saverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: 4, paddingBottom: spacing.sm },
    saverTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
    diagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    unhideText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
    errorLine: { color: colors.textDim, fontSize: 11, fontFamily: 'monospace' },
    usageBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
        paddingVertical: spacing.md,
    },
    usageBarSlot: { flex: 1, alignItems: 'center', gap: 4 },
    usageBar: { width: '70%', backgroundColor: colors.accent, borderRadius: 3, opacity: 0.9 },
    usageBarLabel: { color: colors.textDim, fontSize: 10 },
    ghRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 4 },
    ghText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
    diagLabel: { flex: 1, color: colors.text, fontSize: 14 },
    diagMeta: { color: colors.textDim, fontSize: 13 },
    limitChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
    },
    limitChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    limitChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
    limitChipTextOn: { color: colors.accent },
    backupBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 8,
        paddingVertical: 10,
    },
    restoreBtn: { backgroundColor: colors.danger },
    backupBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    importInput: {
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        fontSize: 12,
        minHeight: 64,
        textAlignVertical: 'top',
    },
})
