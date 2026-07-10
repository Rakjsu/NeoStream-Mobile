import { defineConfig } from 'vitest/config'

// Só a lógica pura (src/services) roda no vitest — telas React Native são
// exercitadas no aparelho/Expo Go, não em jsdom.
export default defineConfig({
    test: {
        include: ['src/services/**/*.test.ts'],
    },
})
