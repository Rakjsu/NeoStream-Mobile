import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { clearSession, loadAccount, loadUserInfo } from '../../services/session'
import { parseExpiry, type UserInfo, type XtreamAccount } from '../../services/xtream'
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
    const [account, setAccount] = useState<XtreamAccount | null>(null)
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

    useEffect(() => {
        void loadAccount().then(setAccount)
        void loadUserInfo().then(setUserInfo)
    }, [])

    const expiry = parseExpiry(userInfo?.exp_date)

    const logout = () => {
        Alert.alert('Sair', 'Remover esta conta do aparelho?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sair',
                style: 'destructive',
                onPress: () => {
                    void clearSession().then(() => router.replace('/login'))
                },
            },
        ])
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.section}>Conta</Text>
            <View style={styles.card}>
                <InfoRow label="Servidor" value={account?.url ?? '—'} />
                <InfoRow label="Usuário" value={account?.username ?? '—'} />
                <InfoRow label="Status" value={userInfo?.status ?? '—'} />
                <InfoRow
                    label="Expira em"
                    value={expiry ? expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Sem expiração'}
                />
                <InfoRow
                    label="Conexões"
                    value={`${userInfo?.active_cons ?? '?'} de ${userInfo?.max_connections ?? '?'}`}
                />
            </View>

            <TouchableOpacity style={styles.logout} onPress={logout}>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.logoutText}>Sair desta conta</Text>
            </TouchableOpacity>

            <Text style={styles.version}>
                NeoStream Mobile v{Constants.expoConfig?.version ?? '?'}
            </Text>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textDim, fontSize: 13, textTransform: 'uppercase', marginBottom: spacing.sm },
    card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
    },
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
    logout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.xl,
        padding: spacing.md,
        borderRadius: 10,
        borderColor: colors.danger,
        borderWidth: 1,
    },
    logoutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
    version: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
})
