import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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

    const refresh = useCallback(() => {
        void listAccounts().then(setAccounts)
        void loadAccount().then(setActive)
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
})
