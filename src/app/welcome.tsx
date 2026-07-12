import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

export const ONBOARDED_KEY = 'neostream_onboarded'

function Card({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardIcon}>
                <Ionicons name={icon} size={26} color={colors.accent} />
            </View>
            <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardBody}>{body}</Text>
            </View>
        </View>
    )
}

/** Primeira abertura: três cartões e um botão — nada de tour de 10 passos. */
export default function Welcome() {
    const start = () => {
        AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => undefined)
        router.replace('/login')
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.logo}>NeoStream</Text>
            <Text style={styles.tagline}>{t('obTagline')}</Text>

            <Card icon="key-outline" title={t('ob1Title')} body={t('ob1Body')} />
            <Card icon="cloud-download-outline" title={t('ob2Title')} body={t('ob2Body')} />
            <Card icon="tv-outline" title={t('ob3Title')} body={t('ob3Body')} />

            <TouchableOpacity style={styles.startBtn} onPress={start}>
                <Text style={styles.startText}>{t('obStart')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
    logo: { color: colors.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
    tagline: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: spacing.lg },
    card: {
        flexDirection: 'row',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: spacing.lg,
    },
    cardIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardText: { flex: 1, gap: 4 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    cardBody: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        marginTop: spacing.lg,
    },
    startText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
