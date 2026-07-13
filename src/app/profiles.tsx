import { Ionicons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'
import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import {
    DEFAULT_PROFILE_ID, GUEST_PROFILE_ID, PROFILE_COLORS, activeProfileId, addProfile, copyCurrentDataTo, listProfiles,
    markProfilePicked, removeProfile, switchProfile, updateProfile, type Profile,
} from '../services/profiles'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

// Avatares prontos (emoji) — o perfil pode trocar a letra inicial por um deles.
const AVATAR_EMOJIS = ['😀', '😎', '🧒', '🦖', '🐱', '⚽', '🎮', '🍿']

/**
 * "Quem está assistindo?" — toque troca o perfil (favoritos, Minha lista e
 * continuar assistindo próprios), long-press remove (menos o principal).
 */
export default function Profiles() {
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [adding, setAdding] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [pinDraft, setPinDraft] = useState('')
    // Perfil com PIN: guarda o alvo até o PIN certo liberar.
    const [pinFor, setPinFor] = useState<Profile | null>(null)
    const [pinTry, setPinTry] = useState('')
    const [editing, setEditing] = useState<Profile | null>(null)
    const [iconDraft, setIconDraft] = useState('')
    const [colorDraft, setColorDraft] = useState('')
    const [bioOk, setBioOk] = useState(false)
    const [activeId, setActiveId] = useState(DEFAULT_PROFILE_ID)

    const refresh = () => {
        void listProfiles().then(list => {
            setProfiles(list)
            setActiveId(activeProfileId())
        })
    }

    useEffect(() => { queueMicrotask(refresh) }, [])

    // Biometria disponível? (digital/rosto cadastrado) — atalho no gate de PIN.
    useEffect(() => {
        queueMicrotask(() => {
            void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
                .then(([hw, enrolled]) => setBioOk(hw && enrolled))
                .catch(() => undefined)
        })
    }, [])

    const enter = (profile: Profile) => {
        void switchProfile(profile.id).then(() => {
            markProfilePicked()
            router.replace('/(tabs)/home')
        })
    }

    const pick = (profile: Profile) => {
        if (profile.pin) { setPinTry(''); setPinFor(profile); return }
        enter(profile)
    }

    const confirmRemove = (profile: Profile) => {
        if (profile.id === DEFAULT_PROFILE_ID || profile.id === GUEST_PROFILE_ID) return
        Alert.alert(profile.name, '', [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('profileEdit'),
                onPress: () => {
                    setNameDraft(profile.name)
                    setPinDraft(profile.pin ?? '')
                    setIconDraft(profile.icon ?? '')
                    setColorDraft(profile.color)
                    setEditing(profile)
                    setAdding(false)
                },
            },
            { text: t('remove'), style: 'destructive', onPress: () => { void removeProfile(profile.id).then(refresh) } },
        ])
    }

    const displayName = (profile: Profile) =>
        profile.id === DEFAULT_PROFILE_ID ? t('profileDefault')
            : profile.id === GUEST_PROFILE_ID ? t('profileGuest') : profile.name

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ title: t('profilesTitle') }} />
            <Text style={styles.title}>{t('profilesTitle')}</Text>
            <View style={styles.grid}>
                {profiles.map(profile => (
                    <TvTouchable
                        key={profile.id}
                        style={styles.cell}
                        onPress={() => pick(profile)}
                        onLongPress={() => confirmRemove(profile)}
                        delayLongPress={400}
                    >
                        <View style={[styles.avatar, { backgroundColor: profile.color },
                            profile.id === activeId && styles.avatarActive]}>
                            {profile.id === GUEST_PROFILE_ID ? (
                                <Ionicons name="glasses-outline" size={30} color="#fff" />
                            ) : profile.icon ? (
                                <Text style={styles.avatarEmoji}>{profile.icon}</Text>
                            ) : (
                                <Text style={styles.avatarLetter}>{displayName(profile).slice(0, 1).toUpperCase()}</Text>
                            )}
                            {profile.pin ? (
                                <View style={styles.pinBadge}>
                                    <Ionicons name="lock-closed" size={11} color="#fff" />
                                </View>
                            ) : null}
                        </View>
                        <Text style={styles.name} numberOfLines={1}>{displayName(profile)}</Text>
                    </TvTouchable>
                ))}
                <TvTouchable style={styles.cell} onPress={() => setAdding(true)}>
                    <View style={[styles.avatar, styles.avatarAdd]}>
                        <Ionicons name="add" size={30} color={colors.textDim} />
                    </View>
                    <Text style={[styles.name, { color: colors.textDim }]}>{t('profileAdd')}</Text>
                </TvTouchable>
            </View>

            {adding || editing ? (
                <View style={styles.addRow}>
                    <TextInput
                        style={styles.input}
                        value={nameDraft}
                        onChangeText={setNameDraft}
                        placeholder={t('profileNamePh')}
                        placeholderTextColor={colors.textDim}
                        maxLength={16}
                        autoFocus
                    />
                    <TextInput
                        style={[styles.input, { width: 110 }]}
                        value={pinDraft}
                        onChangeText={text => setPinDraft(text.replace(/[^0-9]/g, ''))}
                        placeholder={t('profilePinPh')}
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                    />
                    <TvTouchable
                        style={styles.addBtn}
                        onPress={() => {
                            if (editing) {
                                void updateProfile(editing.id, { name: nameDraft, pin: pinDraft, icon: iconDraft, color: colorDraft }).then(() => {
                                    setEditing(null)
                                    setNameDraft('')
                                    setPinDraft('')
                                    setIconDraft('')
                                    setColorDraft('')
                                    refresh()
                                })
                                return
                            }
                            void addProfile(nameDraft, pinDraft || undefined).then(created => {
                                if (!created) return
                                // Avatar/cor escolhidos já valem pro perfil recém-criado.
                                if (iconDraft || colorDraft) void updateProfile(created.id, { icon: iconDraft, color: colorDraft }).then(refresh)
                                setNameDraft('')
                                setPinDraft('')
                                setIconDraft('')
                                setColorDraft('')
                                setAdding(false)
                                refresh()
                                // Opcional: já nascer com os favoritos/lista do perfil atual.
                                Alert.alert(t('profileCopyTitle'), t('profileCopyMsg'), [
                                    { text: t('cancel'), style: 'cancel' },
                                    { text: t('copyBtn'), onPress: () => { void copyCurrentDataTo(created.id) } },
                                ])
                            })
                        }}
                    >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                    </TvTouchable>
                </View>
            ) : null}
            {adding || editing ? (
                <View style={styles.pickRow}>
                    {AVATAR_EMOJIS.map(emoji => (
                        <TvTouchable
                            key={emoji}
                            style={[styles.pickChip, iconDraft === emoji && styles.pickChipOn]}
                            onPress={() => setIconDraft(current => (current === emoji ? '' : emoji))}
                        >
                            <Text style={{ fontSize: 18 }}>{emoji}</Text>
                        </TvTouchable>
                    ))}
                    {PROFILE_COLORS.map(color => (
                        <TvTouchable
                            key={color}
                            accessibilityLabel={color}
                            style={[styles.colorDot, { backgroundColor: color }, colorDraft === color && styles.pickChipOn]}
                            onPress={() => setColorDraft(current => (current === color ? '' : color))}
                        />
                    ))}
                </View>
            ) : null}
            {pinFor ? (
                <View style={styles.addRow}>
                    <Text style={styles.hint}>{tf('profilePinAsk', { name: displayName(pinFor) })}</Text>
                    <TextInput
                        style={[styles.input, { width: 110 }]}
                        value={pinTry}
                        onChangeText={text => {
                            const digits = text.replace(/[^0-9]/g, '')
                            setPinTry(digits)
                            if (digits.length === 4) {
                                if (digits === pinFor.pin) { setPinFor(null); enter(pinFor) }
                                else setPinTry('')
                            }
                        }}
                        placeholder="••••"
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        autoFocus
                    />
                    {bioOk ? (
                        <TvTouchable
                            style={styles.addBtn}
                            accessibilityLabel={t('bioUnlock')}
                            onPress={() => {
                                void LocalAuthentication.authenticateAsync({ cancelLabel: 'PIN' }).then(result => {
                                    if (result.success && pinFor) {
                                        const target = pinFor
                                        setPinFor(null)
                                        enter(target)
                                    }
                                }).catch(() => undefined)
                            }}
                        >
                            <Ionicons name="finger-print" size={20} color="#fff" />
                        </TvTouchable>
                    ) : null}
                </View>
            ) : null}
            <Text style={styles.hint}>{t('profilesHint')}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xl },
    cell: { alignItems: 'center', gap: spacing.sm, width: 92 },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarActive: { borderWidth: 3, borderColor: colors.text },
    avatarAdd: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    avatarLetter: { color: '#fff', fontSize: 28, fontWeight: '700' },
    pinBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        backgroundColor: colors.accent,
        borderRadius: 9,
        padding: 3,
    },
    name: { color: colors.text, fontSize: 13, fontWeight: '600' },
    addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    input: {
        width: 200,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        color: colors.text,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
    },
    addBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: 9 },
    pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', maxWidth: 420 },
    pickChip: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    pickChipOn: { borderColor: colors.accent, borderWidth: 2 },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
    avatarEmoji: { fontSize: 32 },
    hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
})
