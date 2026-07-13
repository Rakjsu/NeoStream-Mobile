import { Ionicons } from '@expo/vector-icons'
import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import {
    DEFAULT_PROFILE_ID, GUEST_PROFILE_ID, activeProfileId, addProfile, listProfiles,
    markProfilePicked, removeProfile, switchProfile, type Profile,
} from '../services/profiles'
import { TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t, tf } from '../i18n/strings'

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
    const [activeId, setActiveId] = useState(DEFAULT_PROFILE_ID)

    const refresh = () => {
        void listProfiles().then(list => {
            setProfiles(list)
            setActiveId(activeProfileId())
        })
    }

    useEffect(() => { queueMicrotask(refresh) }, [])

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
        Alert.alert(t('profileRemoveTitle'), tf('profileRemoveMsg', { name: profile.name }), [
            { text: t('cancel'), style: 'cancel' },
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

            {adding ? (
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
                            void addProfile(nameDraft, pinDraft || undefined).then(created => {
                                if (!created) return
                                setNameDraft('')
                                setPinDraft('')
                                setAdding(false)
                                refresh()
                            })
                        }}
                    >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                    </TvTouchable>
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
    hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
})
