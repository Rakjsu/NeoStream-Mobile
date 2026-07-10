import { Ionicons } from '@expo/vector-icons'
import { useEvent } from 'expo'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing } from '../ui/theme'

export default function Player() {
    const { url, title, live } = useLocalSearchParams<{ url: string; title?: string; live?: string }>()
    const insets = useSafeAreaInsets()
    useKeepAwake()

    const player = useVideoPlayer(String(url ?? ''), p => {
        p.play()
    })
    const { status, error } = useEvent(player, 'statusChange', {
        status: player.status,
        error: undefined,
    })

    return (
        <View style={styles.root}>
            <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls
                allowsPictureInPicture
            />

            <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
                <TouchableOpacity style={styles.back} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title} numberOfLines={1}>
                    {live === '1' ? '🔴 ' : ''}{title ?? ''}
                </Text>
            </View>

            {status === 'error' ? (
                <View style={styles.errorBox}>
                    <Ionicons name="warning" size={28} color={colors.danger} />
                    <Text style={styles.errorText}>
                        Não deu pra reproduzir este conteúdo.{'\n'}
                        {error?.message ?? 'O formato pode não ser suportado ou o servidor está fora do ar.'}
                    </Text>
                </View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    video: { flex: 1 },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingBottom: spacing.sm,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    back: { padding: spacing.xs },
    title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
    errorBox: {
        position: 'absolute',
        left: spacing.xl,
        right: spacing.xl,
        top: '40%',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(22,22,31,0.95)',
        borderRadius: 12,
        padding: spacing.lg,
    },
    errorText: { color: colors.text, fontSize: 14, textAlign: 'center' },
})
