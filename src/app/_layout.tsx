import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { colors } from '../ui/theme'

export default function RootLayout() {
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
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="player" options={{ headerShown: false }} />
                <Stack.Screen name="series/[id]" options={{ title: '' }} />
            </Stack>
        </>
    )
}
