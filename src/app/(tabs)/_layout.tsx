import { Ionicons } from '@expo/vector-icons'
import { router, Tabs } from 'expo-router'
import { TouchableOpacity, View } from 'react-native'
import { useEffect } from 'react'
import { checkScheduledRecordings } from '../../services/schedRec'
import { sweepOldRecordings } from '../../services/downloads'
import { onRecStopAction } from '../../services/notify'
import { stopRecording } from '../../services/recorder'
import { OfflineBanner } from '../../ui/components'
import { t } from '../../i18n/strings'
import { colors } from '../../ui/theme'
import { isTV, overscan, tvSize } from '../../ui/tv'

export default function TabsLayout() {
    // Gravação agendada: checa em QUALQUER aba, a cada minuto com o app aberto.
    useEffect(() => {
        const run = () => { void checkScheduledRecordings() }
        queueMicrotask(run)
        // Auto-faxina de gravações vencidas — uma vez por abertura basta.
        queueMicrotask(() => { void sweepOldRecordings(Date.now()) })
        const timer = setInterval(run, 60_000)
        return () => clearInterval(timer)
    }, [])

    // ⏹ da notificação de gravação para o REC sem precisar abrir o app.
    useEffect(() => onRecStopAction(() => { void stopRecording() }), [])

    return (
        <View style={{ flex: 1 }}>
        <OfflineBanner />
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.textDim,
                sceneStyle: { backgroundColor: colors.bg, paddingHorizontal: overscan },
                // 📺 Android TV: barra LATERAL (D-pad navega melhor), rótulos
                // maiores e margem de overscan — a TV corta as bordas da tela.
                ...(isTV ? {
                    tabBarPosition: 'left' as const,
                    tabBarVariant: 'material' as const,
                    tabBarLabelPosition: 'below-icon' as const,
                    tabBarStyle: {
                        backgroundColor: colors.card,
                        borderRightColor: colors.border,
                        paddingVertical: 24,
                    },
                    tabBarLabelStyle: { fontSize: tvSize(10) },
                    headerTitleStyle: { color: colors.text, fontSize: tvSize(18) },
                } : {}),
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: t('tabHome'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
                    headerLeft: () => (
                        <TouchableOpacity
                            style={{ paddingHorizontal: 16 }}
                            accessibilityLabel={t('profilesTitle')}
                            onPress={() => router.push('/profiles')}
                        >
                            <Ionicons name="person-circle-outline" size={24} color={colors.text} />
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity onPress={() => router.push('/downloads')} style={{ paddingHorizontal: 16 }}>
                            <Ionicons name="cloud-download-outline" size={22} color={colors.text} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Tabs.Screen
                name="live"
                options={{
                    title: t('tabLive'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="tv" size={size} color={color} />,
                    headerRight: () => (
                        <View style={{ flexDirection: 'row' }}>
                            <TouchableOpacity
                                style={{ paddingHorizontal: 12 }}
                                accessibilityLabel={t('multiviewTitle')}
                                onPress={() => router.push('/multiview')}
                            >
                                <Ionicons name="grid-outline" size={21} color={colors.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ paddingHorizontal: 12 }}
                                accessibilityLabel={t('nowTitle')}
                                onPress={() => router.push('/now')}
                            >
                                <Ionicons name="calendar-outline" size={22} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="movies"
                options={{
                    title: t('tabMovies'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="film" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="series"
                options={{
                    title: t('tabSeries'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: t('tabSearch'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: t('tabSettings'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
                }}
            />
        </Tabs>
        </View>
    )
}
