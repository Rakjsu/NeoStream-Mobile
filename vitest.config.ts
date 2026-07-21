import { defineConfig } from 'vitest/config'

// Só a lógica pura (src/services) roda no vitest — telas React Native são
// exercitadas no aparelho/Expo Go, não em jsdom.
export default defineConfig({
    resolve: {
        alias: {
            // O async-storage 3.x nao resolve em Node puro (imports sem
            // extensao) — stub em memoria; vi.mock por teste ainda vence.
            '@react-native-async-storage/async-storage': new URL('./src/test/asyncStorageStub.ts', import.meta.url).pathname,
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
})
