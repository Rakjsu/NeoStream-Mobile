import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { onNotificationRoute } from '../services/notify'
import { setupShortcuts } from '../services/shortcuts'
import { colors } from '../ui/theme'
import { t } from '../i18n/strings'

export default function RootLayout() {
    // Clique em notificação (ex.: download concluído) navega pra rota do payload.
    useEffect(() => onNotificationRoute(route => router.push(route)), [])

    // Atalhos do ícone do app (launcher) → rota direta.
    useEffect(() => setupShortcuts(href => router.push(href)), [])

    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: colors.bg },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: colors.bg },
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="unlock" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="player" options={{ headerShown: false }} />
                <Stack.Screen name="series/[id]" options={{ title: '' }} />
                <Stack.Screen name="movie/[id]" options={{ title: '' }} />
                <Stack.Screen name="downloads" options={{ title: t('downloadsTitle') }} />
            </Stack>
        </>
    )
}
