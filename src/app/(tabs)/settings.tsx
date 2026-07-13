import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as LocalAuthentication from 'expo-local-authentication'
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
import { hideChannel, listHiddenChannels, unhideChannel, type HiddenChannel } from '../../services/hidden'
import { applyBackup, collectBackup, decryptBackup, isEncryptedBackup, parseBackup, protectBackup, serializeBackup } from '../../services/backup'
import { probeAll } from '../../services/probe'
import { loadFavorites } from '../../services/favorites'
import { disableParental, enableParental, isValidPin, listBlockedCategories, loadParental } from '../../services/parental'
import { getKidsTimeLimit, isKidsMode, listKidsCategories, setKidsMode, setKidsTimeLimit } from '../../services/kids'
import { disconnectTrakt, getTraktCreds, isTraktConnected, pollDeviceToken, setTraktCreds, startDeviceAuth } from '../../services/trakt'
import { getExtEpgUrl, setExtEpgUrl } from '../../services/extEpg'
import { defaultRailPrefs, loadRailPrefs, moveRail, railOrderAll, saveRailPrefs, toggleRail, type RailKey, type RailPrefs } from '../../services/homeRails'
import { M3uClient } from '../../services/m3u'
import { loadSpeedHistory, runSpeedTest, saveSpeedSample, type SpeedSample, type SpeedVerdict } from '../../services/speedtest'
import { clearHistory } from '../../services/progress'
import { checkForUpdate } from '../../services/updates'
import {
    accountLabel, cachedFetch, clearCatalogCache, getClient, listAccounts, loadAccount, removeAccount, renameAccount, resolvePlayableUrl, switchAccount,
    type StoredAccount,
} from '../../services/session'
import { currentStreak, dayKey, formatMinutes, lastDays, lastMonths, loadMonthUsage, loadTitleUsage, loadUsage, monthKey, summarize, topTitles, usageCsv, weekDelta, type TopTitle, type UsageSummary } from '../../services/usage'
import { heatmapCells, loadHabits } from '../../services/habit'
import { parseExpiry } from '../../services/xtream'
import { TvTouchable } from '../../ui/components'
import { colors, setThemeVariant, spacing, themeVariant } from '../../ui/theme'
import { t, tf } from '../../i18n/strings'


// Chips de navegação num componente próprio: dentro do SettingsTab (gigante),
// qualquer leitura do estado sectionY no map fazia o React Compiler pular o arquivo.
function SectionNav({ sectionY, onJump }: { sectionY: Record<string, number>; onJump: (y: number) => void }) {
    return (
        <View style={styles.navRow}>
            {([
                ['secAccounts', '👤'], ['secParental', '🧒'], ['secUsage', '📊'],
                ['secStorage', '💾'], ['secBackup', '☁️'], ['secAbout', 'ℹ️'],
            ] as const).map(([key, icon]) => (
                <TouchableOpacity key={key} style={styles.navChip} onPress={() => onJump(sectionY[key] ?? 0)}>
                    <Text style={styles.navChipText}>{icon} {t(key)}</Text>
                </TouchableOpacity>
            ))}
        </View>
    )
}

// Heatmap dia × faixa de hora (componente próprio — ver nota do SectionNav).
function HabitHeatmap({ cells }: { cells: number[][] }) {
    const max = Math.max(1, ...cells.flat())
    const dayLabels = t('heatmapDays').split(',')
    const bucketIcons = ['🌅', '☀️', '🌆', '🌙']
    if (cells.flat().every(value => value === 0)) return null
    return (
        <View style={{ gap: 3 }}>
            <Text style={styles.parentalHint}>{t('heatmapTitle')}</Text>
            <View style={{ flexDirection: 'row', gap: 3 }}>
                <View style={{ width: 18 }} />
                {dayLabels.map((label, position) => (
                    <Text key={`${label}${position}`} style={styles.heatLabel}>{label}</Text>
                ))}
            </View>
            {bucketIcons.map((icon, bucketIdx) => (
                <View key={icon} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                    <Text style={styles.heatIcon}>{icon}</Text>
                    {cells.map((day, dayIdx) => (
                        <View
                            key={String(dayIdx)}
                            style={[styles.heatCell, { opacity: day[bucketIdx] === 0 ? 0.08 : 0.25 + 0.75 * (day[bucketIdx] / max) }]}
                        />
                    ))}
                </View>
            ))}
        </View>
    )
}

// Rótulo de cada rail configurável (reusa as strings das próprias rails).
function railLabel(key: RailKey): string {
    switch (key) {
        case 'watchlist': return t('watchlistRail')
        case 'freshEpisodes': return t('newEpisodesRail')
        case 'favPosters': return t('favRail')
        case 'because': return tf('becauseRail', { title: '…' })
        case 'praAgora': return t('praAgoraRail')
        case 'recentChannels': return t('recentChannelsRail')
        case 'favChannels': return t('favChannelsRail')
        case 'newMovies': return t('newMoviesRail')
        case 'newSeries': return t('newSeriesRail')
    }
}

// Componente próprio (como o SectionNav): map lendo estado dentro do
// SettingsTab gigante faz o React Compiler pular o arquivo inteiro.
function HomeRailsConfig({ prefs, onChange }: { prefs: RailPrefs; onChange: (next: RailPrefs) => void }) {
    return (
        <View style={{ gap: 2 }}>
            <Text style={styles.parentalHint}>{t('homeRailsTitle')}</Text>
            {railOrderAll(prefs).map(key => {
                const hiddenRail = prefs.hidden.includes(key)
                return (
                    <View key={key} style={styles.diagRow}>
                        <TouchableOpacity style={{ padding: 4 }} accessibilityLabel={railLabel(key)} onPress={() => onChange(toggleRail(prefs, key))}>
                            <Ionicons name={hiddenRail ? 'eye-off-outline' : 'eye-outline'} size={16} color={hiddenRail ? colors.textDim : colors.accent} />
                        </TouchableOpacity>
                        <Text style={[styles.diagLabel, hiddenRail && { color: colors.textDim }]} numberOfLines={1}>{railLabel(key)}</Text>
                        <TouchableOpacity style={{ padding: 4 }} accessibilityLabel={t('favUp')} onPress={() => onChange(moveRail(prefs, key, -1))}>
                            <Ionicons name="chevron-up" size={14} color={colors.textDim} />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ padding: 4 }} accessibilityLabel={t('favDown')} onPress={() => onChange(moveRail(prefs, key, 1))}>
                            <Ionicons name="chevron-down" size={14} color={colors.textDim} />
                        </TouchableOpacity>
                    </View>
                )
            })}
        </View>
    )
}

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
    const [weekDiff, setWeekDiff] = useState<number | null>(null)
    const [epgCov, setEpgCov] = useState<{ matched: number; total: number; misses: { id: string; name: string }[] } | null>(null)
    const [extEpgDraft, setExtEpgDraft] = useState('')
    const [railPrefs, setRailPrefs] = useState<RailPrefs>(defaultRailPrefs())
    const [bioOk, setBioOk] = useState(false)
    const [kidsLimit, setKidsLimit] = useState(0)
    const [habitGrid, setHabitGrid] = useState<number[][]>([])
    const [traktCid, setTraktCid] = useState('')
    const [traktCsec, setTraktCsec] = useState('')
    const [traktOn, setTraktOn] = useState(false)
    const [traktMsg, setTraktMsg] = useState('')
    const [favCheck, setFavCheck] = useState<{ dead: { id: string; name: string }[]; total: number } | null>(null)
    const [favChecking, setFavChecking] = useState(false)
    const [backupPass, setBackupPass] = useState('')
    const [topLive, setTopLive] = useState<TopTitle[]>([])
    const [topShows, setTopShows] = useState<TopTitle[]>([])
    const usageShotRef = useRef<View>(null)
    // Navegação rápida: guarda o Y de cada seção pro chip dar scrollTo.
    // Estado (não ref): indexar ref.current[chave] num handler do map faz o React Compiler pular o arquivo.
    const scrollRef = useRef<ScrollView>(null)
    const [sectionY, setSectionY] = useState<Record<string, number>>({})
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

    // Biometria disponível? (digital/rosto cadastrado) — atalho no gate do PIN.
    useEffect(() => {
        queueMicrotask(() => {
            void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
                .then(([hw, enrolled]) => setBioOk(hw && enrolled))
                .catch(() => undefined)
        })
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
        void getExtEpgUrl().then(setExtEpgDraft)
        void loadRailPrefs().then(setRailPrefs)
        void getKidsTimeLimit().then(setKidsLimit)
        void loadHabits().then(map => setHabitGrid(heatmapCells(map)))
        void getTraktCreds().then(creds => { setTraktCid(creds.clientId); setTraktCsec(creds.clientSecret) })
        void isTraktConnected().then(setTraktOn)
        void AsyncStorage.getItem('neostream_boot_tab').then(v => setBootLive(v === 'live')).catch(() => undefined)
        refreshStorage()
        void loadUsage().then(map => {
            const today = dayKey(Date.now())
            setUsage(summarize(map, today))
            setUsageDays(lastDays(map, today))
            setStreak(currentStreak(map, today))
            const delta = weekDelta(map, today)
            setWeekDiff(delta.previous > 0 || delta.current > 0 ? delta.current - delta.previous : null)
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

    // 🩺 Testa os streams dos favoritos em lote (teto de 30, 4 por vez).
    const runFavCheck = async () => {
        setFavChecking(true)
        try {
            const client = await getClient()
            if (!client) return
            const [live, favorites] = await Promise.all([
                cachedFetch('live', () => client.getLiveChannels()),
                loadFavorites(),
            ])
            const targets = live.filter(c => favorites.live.includes(String(c.stream_id))).slice(0, 30)
            const withUrls = await Promise.all(targets.map(async channel => ({
                channel,
                url: await resolvePlayableUrl(client.liveStreamUrl(String(channel.stream_id))).catch(() => ''),
            })))
            const results = await probeAll(withUrls, entry => entry.url)
            setFavCheck({
                total: targets.length,
                dead: results
                    .filter(r => r.item.url.startsWith('http') && !r.alive)
                    .map(r => ({ id: String(r.item.channel.stream_id), name: r.item.channel.name })),
            })
        } finally {
            setFavChecking(false)
        }
    }

    // Trakt: salva as credenciais, mostra o código e fica perguntando até
    // o usuário autorizar no site (device code — intervalo vem da API).
    const connectTrakt = async () => {
        await setTraktCreds({ clientId: traktCid, clientSecret: traktCsec })
        const auth = await startDeviceAuth()
        if (!auth) { Alert.alert(t('traktFail')); return }
        setTraktMsg(tf('traktWaiting', { code: auth.userCode }))
        Alert.alert('Trakt', tf('traktCodeMsg', { code: auth.userCode }), [
            { text: t('cancel'), style: 'cancel' },
            { text: t('traktOpenSite'), onPress: () => { void Linking.openURL(auth.verificationUrl) } },
        ])
        const deadline = Date.now() + auth.expiresIn * 1000
        const tick = async () => {
            if (Date.now() > deadline) { setTraktMsg(''); return }
            const result = await pollDeviceToken(auth.deviceCode)
            if (result === 'ok') {
                setTraktOn(true)
                setTraktMsg('')
                Alert.alert(t('traktConnected'))
                return
            }
            if (result === 'error') { setTraktMsg(''); Alert.alert(t('traktFail')); return }
            setTimeout(() => { void tick() }, auth.intervalSec * 1000)
        }
        setTimeout(() => { void tick() }, auth.intervalSec * 1000)
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
                {bioOk ? (
                    <TvTouchable
                        style={[styles.parentalBtn, { backgroundColor: colors.card }]}
                        onPress={() => {
                            void LocalAuthentication.authenticateAsync({ cancelLabel: 'PIN' }).then(result => {
                                if (result.success) {
                                    setKidsGate(false)
                                    setGatePin('')
                                }
                            }).catch(() => undefined)
                        }}
                    >
                        <Text style={styles.parentalBtnText}>👆 {t('bioUnlock')}</Text>
                    </TvTouchable>
                ) : null}
                {gateError ? <Text style={styles.pinError}>{gateError}</Text> : null}
            </View>
        )
    }

    return (
        <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={{ padding: spacing.lg }} stickyHeaderIndices={[0]}>
            <SectionNav sectionY={sectionY} onJump={y => scrollRef.current?.scrollTo({ y, animated: true })} />
            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secAccounts']: y })) }}>{t('secAccounts')}</Text>
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
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn, favChecking && { opacity: 0.6 }]}
                        disabled={favChecking}
                        onPress={() => { void runFavCheck() }}
                    >
                        <Ionicons name="pulse-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>
                            {favChecking ? t('favCheckRunning')
                                : favCheck ? tf('favCheckResult', { dead: favCheck.dead.length, total: favCheck.total })
                                    : t('favCheckBtn')}
                        </Text>
                    </TvTouchable>
                    {favCheck?.dead.map(dead => (
                        <View key={dead.id} style={styles.diagRow}>
                            <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                            <Text style={styles.diagLabel} numberOfLines={1}>{dead.name}</Text>
                            <TouchableOpacity
                                accessibilityLabel={t('hide')}
                                onPress={() => {
                                    void hideChannel({ id: dead.id, name: dead.name }).then(() => {
                                        setFavCheck(current => current
                                            ? { ...current, dead: current.dead.filter(d => d.id !== dead.id) }
                                            : current)
                                        refresh()
                                    })
                                }}
                            >
                                <Text style={[styles.diagMeta, { color: colors.accent }]}>{t('hide')}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    <Text style={styles.parentalHint}>{t('extEpgHint')}</Text>
                    <View style={styles.accountRow}>
                        <TextInput
                            style={styles.aliasInput}
                            value={extEpgDraft}
                            onChangeText={setExtEpgDraft}
                            placeholder="https://…/epg.xml"
                            placeholderTextColor={colors.textDim}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TvTouchable
                            style={styles.trash}
                            accessibilityLabel={t('a11yConfirm')}
                            onPress={() => {
                                void setExtEpgUrl(extEpgDraft).then(() => Alert.alert(t('extEpgSaved')))
                            }}
                        >
                            <Ionicons name="checkmark" size={20} color={colors.accent} />
                        </TvTouchable>
                    </View>
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn]}
                        onPress={() => {
                            void (async () => {
                                const client = await getClient()
                                if (!(client instanceof M3uClient)) { Alert.alert(t('epgCovOnlyM3u')); return }
                                setEpgCov(await client.epgCoverage())
                            })()
                        }}
                    >
                        <Ionicons name="flask-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>
                            {epgCov ? tf('epgCovResult', { matched: epgCov.matched, total: epgCov.total }) : t('epgCovBtn')}
                        </Text>
                    </TvTouchable>
                    {epgCov ? epgCov.misses.slice(0, 5).map(miss => (
                        <TouchableOpacity
                            key={miss.id}
                            style={styles.diagRow}
                            onPress={() => router.push({ pathname: '/epgfix', params: { channel: miss.id, name: miss.name } })}
                        >
                            <Ionicons name="help-circle-outline" size={14} color={colors.danger} />
                            <Text style={styles.diagLabel} numberOfLines={1}>{miss.name}</Text>
                            <Text style={[styles.diagMeta, { color: colors.accent }]}>{t('epgFixBtn')}</Text>
                        </TouchableOpacity>
                    )) : null}
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

            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secParental']: y })) }}>{t('secParental')}</Text>
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
                <TvTouchable
                    style={styles.kidsRow}
                    onPress={() => {
                        // Off → 30 → 60 → 90 → 120 → off.
                        const next = kidsLimit === 0 ? 30 : kidsLimit >= 120 ? 0 : kidsLimit + 30
                        setKidsLimit(next)
                        void setKidsTimeLimit(next)
                    }}
                >
                    <Ionicons name="hourglass-outline" size={18} color={kidsLimit > 0 ? colors.accent : colors.textDim} />
                    <Text style={[styles.kidsText, kidsLimit > 0 && { color: colors.accent }]}>
                        {kidsLimit > 0 ? tf('kidsLimitLabel', { n: kidsLimit }) : t('kidsLimitOff')}
                    </Text>
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

            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secUsage']: y })) }}>{t('secUsage')}</Text>
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
                {weekDiff !== null ? (
                    <Text style={styles.parentalHint}>
                        {tf('weekVsLast', { sign: weekDiff >= 0 ? '+' : '−', diff: formatMinutes(Math.abs(weekDiff)) })}
                    </Text>
                ) : null}
                {habitGrid.length > 0 ? <HabitHeatmap cells={habitGrid} /> : null}
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

            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secStorage']: y })) }}>{t('secStorage')}</Text>
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
                <HomeRailsConfig prefs={railPrefs} onChange={next => { setRailPrefs(next); void saveRailPrefs(next) }} />
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

            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secBackup']: y })) }}>{t('secBackup')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('backupHint')}</Text>
                <TextInput
                    style={styles.aliasInput}
                    value={backupPass}
                    onChangeText={setBackupPass}
                    placeholder={t('backupPassPh')}
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                />
                <TvTouchable
                    style={styles.backupBtn}
                    onPress={() => {
                        void (async () => {
                            const json = protectBackup(serializeBackup(await collectBackup()), backupPass)
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
                                const json = protectBackup(serializeBackup(await collectBackup()), backupPass)
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
                            const raw = isEncryptedBackup(importText) ? decryptBackup(importText, backupPass) : importText
                            if (raw === null) {
                                setBackupMsg(t('backupPassWrong'))
                                return
                            }
                            const backup = parseBackup(raw)
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
                <Text style={styles.parentalHint}>{t('traktHint')}</Text>
                <View style={styles.accountRow}>
                    <TextInput
                        style={styles.aliasInput}
                        value={traktCid}
                        onChangeText={setTraktCid}
                        placeholder="Trakt Client ID"
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
                <View style={styles.accountRow}>
                    <TextInput
                        style={styles.aliasInput}
                        value={traktCsec}
                        onChangeText={setTraktCsec}
                        placeholder="Trakt Client Secret"
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                    />
                </View>
                {traktOn ? (
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn]}
                        onPress={() => { void disconnectTrakt().then(() => setTraktOn(false)) }}
                    >
                        <Ionicons name="link" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{t('traktConnected')} — {t('traktDisconnect')}</Text>
                    </TvTouchable>
                ) : (
                    <TvTouchable
                        style={[styles.backupBtn, styles.restoreBtn, (!traktCid.trim() || !traktCsec.trim()) && { opacity: 0.5 }]}
                        disabled={!traktCid.trim() || !traktCsec.trim()}
                        onPress={() => { void connectTrakt() }}
                    >
                        <Ionicons name="link-outline" size={16} color="#fff" />
                        <Text style={styles.backupBtnText}>{traktMsg || t('traktConnect')}</Text>
                    </TvTouchable>
                )}
            </View>

            <Text style={styles.section} onLayout={e => { const y = e.nativeEvent.layout.y; setSectionY(prev => ({ ...prev, ['secAbout']: y })) }}>{t('secAbout')}</Text>
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
    navRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        backgroundColor: colors.bg,
        paddingBottom: spacing.sm,
    },
    navChip: {
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: colors.card,
    },
    navChipText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
    heatLabel: { flex: 1, textAlign: 'center', color: colors.textDim, fontSize: 9 },
    heatIcon: { fontSize: 10, width: 18 },
    heatCell: { flex: 1, height: 16, borderRadius: 3, backgroundColor: colors.accent },
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
