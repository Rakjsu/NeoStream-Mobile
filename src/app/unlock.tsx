import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { unlockApp } from '../services/appLock'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

/** Tela de bloqueio: PIN de 4 dígitos antes de entrar no app. */
export default function Unlock() {
    const [pin, setPin] = useState('')
    const [error, setError] = useState(false)

    const submit = (value: string) => {
        void unlockApp(value).then(ok => {
            if (ok) router.replace('/(tabs)/home')
            else { setError(true); setPin('') }
        })
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.badge}>
                <Ionicons name="lock-closed" size={34} color={colors.accent} />
            </View>
            <Text style={styles.title}>{t('unlockTitle')}</Text>
            <Text style={styles.hint}>{t('unlockHint')}</Text>
            <TextInput
                style={[styles.input, error && styles.inputError]}
                value={pin}
                onChangeText={text => {
                    const digits = text.replace(/[^0-9]/g, '')
                    setPin(digits)
                    setError(false)
                    // 4 dígitos → tenta direto, sem botão.
                    if (digits.length === 4) submit(digits)
                }}
                placeholder="••••"
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                autoFocus
            />
            {error ? <Text style={styles.error}>{t('pinWrong')}</Text> : null}
            <TouchableOpacity
                style={[styles.btn, pin.length !== 4 && { opacity: 0.5 }]}
                disabled={pin.length !== 4}
                onPress={() => submit(pin)}
            >
                <Text style={styles.btnText}>{t('unlock')}</Text>
            </TouchableOpacity>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
    },
    badge: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.sm,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    hint: { color: colors.textDim, fontSize: 14 },
    input: {
        width: 160,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        color: colors.text,
        fontSize: 24,
        textAlign: 'center',
        letterSpacing: 12,
        paddingVertical: 12,
        marginTop: spacing.md,
    },
    inputError: { borderColor: colors.danger },
    error: { color: colors.danger, fontSize: 13 },
    btn: {
        width: 160,
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: spacing.sm,
    },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
