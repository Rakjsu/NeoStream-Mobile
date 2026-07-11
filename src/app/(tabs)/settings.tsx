import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { applyBackup, collectBackup, parseBackup, serializeBackup } from '../../services/backup'
import { disableParental, enableParental, isValidPin, loadParental } from '../../services/parental'
import { clearHistory } from '../../services/progress'
import {
    accountLabel, listAccounts, loadAccount, removeAccount, switchAccount,
    type StoredAccount,
} from '../../services/session'
import { parseExpiry } from '../../services/xtream'
import { colors, spacing } from '../../ui/theme'

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
    const [importText, setImportText] = useState('')
    const [backupMsg, setBackupMsg] = useState('')

    const refresh = useCallback(() => {
        void listAccounts().then(setAccounts)
        void loadAccount().then(setActive)
        void loadParental().then(state => setParentalOn(state.enabled))
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
        Alert.alert('Remover conta', `Remover ${accountLabel(account)} deste aparelho?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Remover',
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
            <Text style={styles.section}>Contas</Text>
            <View style={styles.card}>
                {accounts.map(account => {
                    const isActive = account.id === active?.id
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
                            <TouchableOpacity style={styles.trash} onPress={() => confirmRemove(account)}>
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    )
                })}
                <TouchableOpacity style={styles.addRow} onPress={() => router.push('/login')}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                    <Text style={styles.addText}>Adicionar conta</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.section}>Conta ativa</Text>
            <View style={styles.card}>
                <InfoRow label="Servidor" value={active?.url ?? '—'} />
                <InfoRow label="Usuário" value={active?.username ?? '—'} />
                <InfoRow label="Status" value={active?.userInfo?.status ?? '—'} />
                <InfoRow
                    label="Expira em"
                    value={expiry ? expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Sem expiração'}
                />
                <InfoRow
                    label="Conexões"
                    value={`${active?.userInfo?.active_cons ?? '?'} de ${active?.userInfo?.max_connections ?? '?'}`}
                />
            </View>

            <Text style={styles.section}>Controle parental</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>
                    {parentalOn
                        ? 'Conteúdo adulto oculto. Digite o PIN pra desativar.'
                        : 'Oculta categorias adultas das abas e da busca, protegido por PIN de 4 dígitos.'}
                </Text>
                <View style={styles.pinRow}>
                    <TextInput
                        style={styles.pinInput}
                        value={pin}
                        onChangeText={text => { setPin(text.replace(/[^0-9]/g, '')); setPinError('') }}
                        placeholder="PIN (4 dígitos)"
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                    />
                    <TouchableOpacity
                        style={[styles.parentalBtn, parentalOn && styles.parentalBtnOff]}
                        onPress={() => {
                            void (async () => {
                                if (!isValidPin(pin)) { setPinError('O PIN tem 4 dígitos.'); return }
                                const ok = parentalOn ? await disableParental(pin) : await enableParental(pin)
                                if (!ok) { setPinError('PIN incorreto.'); return }
                                setPin('')
                                // Recarrega as abas já com (ou sem) o filtro.
                                router.replace('/')
                            })()
                        }}
                    >
                        <Text style={styles.parentalBtnText}>{parentalOn ? 'Desativar' : 'Ativar'}</Text>
                    </TouchableOpacity>
                </View>
                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            </View>

            <Text style={styles.section}>Histórico</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>
                    Zera o “continuar assistindo” e os episódios marcados como vistos.
                </Text>
                <TouchableOpacity
                    style={[styles.backupBtn, styles.restoreBtn]}
                    onPress={() => {
                        Alert.alert('Limpar histórico', 'Apagar todo o progresso e os vistos deste aparelho?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Limpar', style: 'destructive', onPress: () => void clearHistory() },
                        ])
                    }}
                >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>Limpar progresso e vistos</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.section}>Backup</Text>
            <View style={[styles.card, { paddingVertical: spacing.md, gap: spacing.md }]}>
                <Text style={styles.parentalHint}>
                    Exporta contas, favoritos, progresso e ajustes num texto — guarde no Drive ou mande pra você mesmo.
                </Text>
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
                    <Text style={styles.backupBtnText}>Exportar (compartilhar)</Text>
                </TouchableOpacity>
                <TextInput
                    style={styles.importInput}
                    value={importText}
                    onChangeText={text => { setImportText(text); setBackupMsg('') }}
                    placeholder="Cole aqui o conteúdo de um backup pra restaurar…"
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
                                'Restaurar backup',
                                `Substituir TUDO neste aparelho por ${backup.accounts.length} conta(s) do backup?`,
                                [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                        text: 'Restaurar',
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
                            setBackupMsg(err instanceof Error ? err.message : 'Backup inválido.')
                        }
                    }}
                >
                    <Ionicons name="download-outline" size={16} color="#fff" />
                    <Text style={styles.backupBtnText}>Restaurar</Text>
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
