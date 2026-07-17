import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { restoreAccounts } from '../services/session'
import { extractSetupParam, parseSetupParam, type SetupPayload } from '../services/setupLink'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

/**
 * 🖥️ Pareamento LAN com o NeoStream desktop: busca o /setup do controle web
 * (endereço + PIN mostrados no desktop), extrai o deep link neostream://setup
 * embutido na página e aplica as contas — sem digitar credenciais.
 */
export default function PairDesktop() {
    const [addr, setAddr] = useState('')
    const [pin, setPin] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')

    const fetchFromDesktop = () => {
        const address = addr.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
        const code = pin.trim()
        if (!address || code.length < 4 || busy) return
        setBusy(true)
        setMsg('')
        void (async () => {
            try {
                let payload: SetupPayload | null = null
                let sawForbidden = false
                // O controle web roda em http OU https (self-signed) — tenta os dois.
                for (const scheme of ['http', 'https'] as const) {
                    const controller = new AbortController()
                    const timer = setTimeout(() => controller.abort(), 6000)
                    try {
                        const res = await fetch(`${scheme}://${address}/setup?pin=${encodeURIComponent(code)}`, {
                            signal: controller.signal,
                        })
                        if (res.status === 403) { sawForbidden = true; continue }
                        if (!res.ok) continue
                        const d = extractSetupParam(await res.text())
                        if (d) payload = parseSetupParam(d)
                        if (payload) break
                    } catch {
                        // esquema indisponível — tenta o próximo
                    } finally {
                        clearTimeout(timer)
                    }
                }
                if (!payload) {
                    setMsg(sawForbidden ? t('pairPinWrong') : t('pairFail'))
                    return
                }
                const found = payload
                Alert.alert(t('pairTitle'), tf('setupMsg', { n: found.accounts.length }), [
                    { text: t('cancel'), style: 'cancel' },
                    {
                        text: t('setupApply'),
                        onPress: () => {
                            void restoreAccounts(found.accounts, found.activeId).then(() => {
                                router.replace('/(tabs)/home')
                            })
                        },
                    },
                ])
            } finally {
                setBusy(false)
            }
        })()
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('pairTitle') }} />
            <Ionicons name="desktop-outline" size={44} color={colors.accent} />
            <Text style={styles.title}>{t('pairTitle')}</Text>
            <Text style={styles.text}>{t('pairHint')}</Text>
            <TextInput
                style={styles.input}
                value={addr}
                onChangeText={text => { setAddr(text); setMsg('') }}
                placeholder={t('pairAddrPh')}
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
            />
            <TextInput
                style={styles.input}
                value={pin}
                onChangeText={text => { setPin(text.replace(/\D/g, '').slice(0, 4)); setMsg('') }}
                placeholder={t('pairPinPh')}
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                maxLength={4}
            />
            {msg ? <Text style={styles.error}>{msg}</Text> : null}
            <TvTouchable
                style={[styles.applyBtn, (busy || !addr.trim() || pin.trim().length < 4) && { opacity: 0.5 }]}
                onPress={fetchFromDesktop}
                disabled={busy || !addr.trim() || pin.trim().length < 4}
            >
                <Text style={styles.applyText}>{busy ? '…' : t('pairFetch')}</Text>
            </TvTouchable>
            <TvTouchable onPress={() => router.back()}>
                <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TvTouchable>
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
    input: {
        alignSelf: 'stretch',
        backgroundColor: colors.card,
        borderRadius: 10,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        color: colors.text,
        fontSize: 15,
    },
    error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
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
