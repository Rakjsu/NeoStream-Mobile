import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { colors } from '../../ui/theme'

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.textDim,
                sceneStyle: { backgroundColor: colors.bg },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Início',
                    tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="live"
                options={{
                    title: 'TV ao vivo',
                    tabBarIcon: ({ color, size }) => <Ionicons name="tv" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="movies"
                options={{
                    title: 'Filmes',
                    tabBarIcon: ({ color, size }) => <Ionicons name="film" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="series"
                options={{
                    title: 'Séries',
                    tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: 'Buscar',
                    tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Ajustes',
                    tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
                }}
            />
        </Tabs>
    )
}
