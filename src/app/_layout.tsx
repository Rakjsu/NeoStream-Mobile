import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyNow, onNotificationRoute } from '../services/notify'
import { setupShortcuts } from '../services/shortcuts'
import { applyCapturePolicy } from '../services/privacy'
import { refreshDataSaver } from '../services/dataSaver'
import { runAutoBackup } from '../services/autoBackup'
import { connectDesktopLink } from '../services/desktopLink'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { recordError } from '../services/errorLog'
import { colors } from '../ui/theme'
import { t, tf } from '../i18n/strings'

// 🧯 Erros JS não tratados (fora do React) também entram no log dos Ajustes.
function installGlobalErrorLog(): void {
    const utils = (globalThis as {
        ErrorUtils?: {
            getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined
            setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void
        }
    }).ErrorUtils
    if (!utils) return
    const previous = utils.getGlobalHandler()
    utils.setGlobalHandler((error, isFatal) => {
        const message = error instanceof Error ? error.message : String(error)
        void recordError(`${isFatal ? '💥 ' : ''}${message}`)
        previous?.(error, isFatal)
    })
}
installGlobalErrorLog()

export default function RootLayout() {
    // Clique em notificação (ex.: download concluído) navega pra rota do payload.
    useEffect(() => onNotificationRoute(route => router.push(route)), [])

    // Atalhos do ícone do app (launcher) → rota direta.
    useEffect(() => setupShortcuts(href => router.push(href)), [])

    // Bloqueio do app ligado → sem screenshot nem preview no multitarefa.
    useEffect(() => { void applyCapturePolicy() }, [])

    // Cache síncrono da economia de dados (opção + tipo de rede).
    useEffect(() => { void refreshDataSaver() }, [])

    // Auto-backup silencioso (a cada 3 dias, mantém as 5 últimas cópias).
    useEffect(() => { void runAutoBackup() }, [])

    // 🔗 Receber do desktop ligado → reconecta ao controle web no boot.
    useEffect(() => { void connectDesktopLink() }, [])

    // Dezembro: retrospectiva anual, uma vez por ano.
    useEffect(() => {
        void (async () => {
            const now = new Date()
            if (now.getMonth() !== 11) return
            const flag = `neostream_wrapped_${now.getFullYear()}`
            const seen = await AsyncStorage.getItem(flag).catch(() => '1')
            if (seen) return
            await AsyncStorage.setItem(flag, '1').catch(() => undefined)
            void notifyNow(
                tf('wrappedNotifTitle', { year: now.getFullYear() }),
                t('wrappedNotifBody'),
                '/wrapped',
            )
        })()
    }, [])

    return (
        <ErrorBoundary>
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
                <Stack.Screen name="welcome" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="player" options={{ headerShown: false }} />
                <Stack.Screen name="series/[id]" options={{ title: '' }} />
                <Stack.Screen name="movie/[id]" options={{ title: '' }} />
                <Stack.Screen name="downloads" options={{ title: t('downloadsTitle') }} />
                <Stack.Screen name="history" options={{ title: t('historyTitle') }} />
                <Stack.Screen name="now" options={{ title: t('nowTitle') }} />
                <Stack.Screen name="wrapped" options={{ headerShown: false }} />
            </Stack>
        </ErrorBoundary>
    )
}
