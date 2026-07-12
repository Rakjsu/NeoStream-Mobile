import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { disableAppLock, enableAppLock, loadAppLock } from '../../services/appLock'
import { applyBackup, collectBackup, parseBackup, serializeBackup } from '../../services/backup'
import { disableParental, enableParental, isValidPin, loadParental } from '../../services/parental'
import { clearHistory } from '../../services/progress'
import {
    accountLabel, listAccounts, loadAccount, removeAccount, renameAccount, switchAccount,
    type StoredAccount,
} from '../../services/session'
import { parseExpiry } from '../../services/xtream'
import { colors, spacing } from '../../ui/theme'
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
    const [aliasDraft, setAliasDraft] = useState('')
    const [importText, setImportText] = useState('')
    const [backupMsg, setBackupMsg] = useState('')

    const refresh = useCallback(() => {
        void listAccounts().then(setAccounts)
        void loadAccount().then(setActive)
        void loadParental().then(state => setParentalOn(state.enabled))
        void loadAppLock().then(state => setLockOn(state.enabled))
    }, [])

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

    const expiry = parseExpiry(active?.userInfo?.exp_date)

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
                                <TouchableOpacity
                                    style={styles.trash}
                                    onPress={() => {
                                        void renameAccount(account.id, aliasDraft).then(() => {
                                            setEditingId(null)
                                            refresh()
                                        })
                                    }}
                                >
                                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                                </TouchableOpacity>
                            </View>
                        )
                    }
                    return (
                        <View key={account.id} style={styles.accountRow}>
                            <TouchableOpacity style={styles.accountMain} onPress={() => activate(account)}>
                                <Ionicons
                                    name={isActive ? 'radio-button-on' : 'radio-button-off'}
                                    size={18}
                                    color={isActive ? colors.accent : colors.textDim}
                                />
                                <Text style={[styles.accountName, isActive && styles.accountNameActive]} numberOfLines={1}>
                                    {accountLabel(account)}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.trash}
                                onPress={() => { setEditingId(account.id); setAliasDraft(account.alias ?? '') }}
                            >
                                <Ionicons name="pencil-outline" size={16} color={colors.textDim} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.trash} onPress={() => confirmRemove(account)}>
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    )
                })}
                <TouchableOpacity style={styles.addRow} onPress={() => router.push('/login')}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                    <Text style={styles.addText}>{t('addAccount')}</Text>
                </TouchableOpacity>
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
                    <TouchableOpacity
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
                    </TouchableOpacity>
                </View>
                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
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
                    <TouchableOpacity
                        style={[styles.parentalBtn, lockOn && styles.parentalBtnOff]}
                        onPress={() => {
                            void (async () => {
                                if (!isValidPin(lockPin)) { setLockError(t('pinLen')); return }
                                const ok = lockOn ? await disableAppLock(lockPin) : await enableAppLock(lockPin)
                                if (!ok) { setLockError(t('pinWrong')); return }
                                setLockPin('')
                                setLockOn(!lockOn)
                            })()
                        }}
                    >
                        <Text style={styles.parentalBtnText}>{lockOn ? t('disable') : t('enable')}</Text>
                    </TouchableOpacity>
                </View>
                {lockError ? <Text style={styles.pinError}>{lockError}</Text> : null}
            </View>

            <Text style={styles.section}>{t('secHistory')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('historyHint')}</Text>
                <TouchableOpacity
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
                </TouchableOpacity>
            </View>

            <Text style={styles.section}>{t('secBackup')}</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>{t('backupHint')}</Text>
                <TouchableOpacity
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
                </TouchableOpacity>
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
                <TouchableOpacity
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
                </TouchableOpacity>
                {backupMsg ? <Text style={styles.pinError}>{backupMsg}</Text> : null}
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
