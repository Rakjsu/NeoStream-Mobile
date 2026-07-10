import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { saveAccount } from '../services/session'
import { XtreamClient, normalizeBaseUrl } from '../services/xtream'
import { colors, spacing } from '../ui/theme'

export default function Login() {
    const [url, setUrl] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const canSubmit = url.trim() !== '' && username.trim() !== '' && password !== '' && !busy

    const submit = async () => {
        if (!canSubmit) return
        setBusy(true)
        setError('')
        try {
            const account = { url: normalizeBaseUrl(url), username: username.trim(), password }
            const client = new XtreamClient(account)
            const userInfo = await client.authenticate()
            await saveAccount(account, userInfo)
            router.replace('/(tabs)/live')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao conectar no servidor.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.logoWrap}>
                    <Ionicons name="play-circle" size={64} color={colors.accent} />
                    <Text style={styles.title}>NeoStream</Text>
                    <Text style={styles.subtitle}>Entre com os dados da sua lista IPTV (Xtream)</Text>
                </View>

                <Text style={styles.label}>Servidor</Text>
                <TextInput
                    style={styles.input}
                    value={url}
                    onChangeText={setUrl}
                    placeholder="http://servidor.tv:8080"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />

                <Text style={styles.label}>Usuário</Text>
                <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="usuário"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordRow}>
                    <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="senha"
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showPassword}
                        onSubmitEditing={submit}
                    />
                    <TouchableOpacity style={styles.eye} onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textDim} />
                    </TouchableOpacity>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                    style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    onPress={submit}
                    disabled={!canSubmit}
                >
                    {busy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.buttonText}>Entrar</Text>}
                </TouchableOpacity>

                <Text style={styles.hint}>
                    Seus dados ficam só neste aparelho e são usados apenas pra falar com o seu provedor.
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    logoWrap: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.xs },
    title: { color: colors.text, fontSize: 28, fontWeight: '700' },
    subtitle: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
    label: { color: colors.textDim, fontSize: 13, marginBottom: spacing.xs, marginTop: spacing.md },
    input: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        fontSize: 15,
    },
    passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    eye: { padding: spacing.sm },
    error: { color: colors.danger, marginTop: spacing.md, fontSize: 14 },
    button: {
        backgroundColor: colors.accent,
        borderRadius: 10,
        alignItems: 'center',
        paddingVertical: 14,
        marginTop: spacing.xl,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    hint: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
})
