import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { M3uClient } from '../services/m3u'
import { addAccount } from '../services/session'
import { XtreamClient, normalizeBaseUrl } from '../services/xtream'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

export default function Login() {
    const [mode, setMode] = useState<'xtream' | 'm3u'>('xtream')
    const [url, setUrl] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const canSubmit = url.trim() !== '' && (mode === 'm3u' || (username.trim() !== '' && password !== '')) && !busy

    const submit = async () => {
        if (!canSubmit) return
        setBusy(true)
        setError('')
        try {
            if (mode === 'm3u') {
                const listUrl = normalizeBaseUrl(url)
                const userInfo = await new M3uClient(listUrl).authenticate()
                await addAccount({ url: listUrl, username: '', password: '', type: 'm3u' }, userInfo)
            } else {
                const account = { url: normalizeBaseUrl(url), username: username.trim(), password }
                const userInfo = await new XtreamClient(account).authenticate()
                await addAccount(account, userInfo)
            }
            router.replace('/(tabs)/home')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('loginFail'))
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
                    <Text style={styles.subtitle}>
                        {mode === 'm3u' ? t('loginSubtitleM3u') : t('loginSubtitleXtream')}
                    </Text>
                </View>

                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeBtn, mode === 'xtream' && styles.modeBtnOn]}
                        onPress={() => { setMode('xtream'); setError('') }}
                    >
                        <Text style={[styles.modeText, mode === 'xtream' && styles.modeTextOn]}>{t('modeXtream')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeBtn, mode === 'm3u' && styles.modeBtnOn]}
                        onPress={() => { setMode('m3u'); setError('') }}
                    >
                        <Text style={[styles.modeText, mode === 'm3u' && styles.modeTextOn]}>{t('modeM3u')}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>{mode === 'm3u' ? t('m3uLabel') : t('serverLabel')}</Text>
                <TextInput
                    style={styles.input}
                    value={url}
                    onChangeText={setUrl}
                    placeholder={mode === 'm3u' ? 'http://provedor.tv/lista.m3u' : 'http://servidor.tv:8080'}
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />

                {mode === 'm3u' ? (
                    <TouchableOpacity
                        style={styles.fileBtn}
                        onPress={() => {
                            void (async () => {
                                try {
                                    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
                                    const asset = picked.assets?.[0]
                                    if (!asset?.uri) return
                                    // Cópia própria: o cache do picker pode sumir; a playlist não.
                                    const dir = FileSystem.documentDirectory + 'playlists/'
                                    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined)
                                    const dest = dir + (asset.name || 'lista.m3u').replace(/[^\w.-]/g, '_')
                                    await FileSystem.copyAsync({ from: asset.uri, to: dest })
                                    setUrl(dest)
                                    setError('')
                                } catch {
                                    setError(t('fileReadFail'))
                                }
                            })()
                        }}
                    >
                        <Text style={styles.fileBtnText}>{t('openM3uFile')}</Text>
                    </TouchableOpacity>
                ) : null}

                {mode === 'xtream' ? <>
                <Text style={styles.label}>{t('userLabel')}</Text>
                <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder={t('userPh')}
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <Text style={styles.label}>{t('passLabel')}</Text>
                <View style={styles.passwordRow}>
                    <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder={t('passPh')}
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
                </> : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                    style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    onPress={submit}
                    disabled={!canSubmit}
                >
                    {busy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.buttonText}>{t('signIn')}</Text>}
                </TouchableOpacity>

                <Text style={styles.hint}>
                    {t('loginHint')}
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    fileBtn: {
        alignSelf: 'flex-start',
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 8,
    },
    fileBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    logoWrap: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.xs },
    modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    modeBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    modeBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    modeText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
    modeTextOn: { color: colors.accent },
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
