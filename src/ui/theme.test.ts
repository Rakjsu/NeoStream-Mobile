import { beforeEach, describe, expect, it, vi } from 'vitest'
import { colors, initTheme, paletteFor, resetThemeCache, setThemeVariant, themeVariant } from './theme'
// Hoisted pelo vitest.
import AsyncStorage from '@react-native-async-storage/async-storage'

// O tema importa a deteccao de TV -> react-native (Flow) nao parseia no vitest.
vi.mock('react-native', () => ({ Platform: { isTV: false } }))

vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            __clear: () => store.clear(),
        },
    }
})

describe('tema por variante', () => {
    beforeEach(() => {
        resetThemeCache()
        ;(AsyncStorage as unknown as { __clear: () => void }).__clear()
    })

    it('paletteFor só troca as superfícies', () => {
        expect(paletteFor('amoled').bg).toBe('#000000')
        expect(paletteFor('dark').bg).toBe('#0b0b10')
    })

    it('setThemeVariant muta o colors e persiste; initTheme relê no boot', async () => {
        await setThemeVariant('amoled')
        expect(colors.bg).toBe('#000000')
        expect(themeVariant()).toBe('amoled')
        resetThemeCache()
        expect(colors.bg).toBe('#0b0b10')
        await initTheme()
        expect(colors.bg).toBe('#000000')
    })

    it('texto e acento não mudam entre variantes', async () => {
        const { text, accent } = colors
        await setThemeVariant('amoled')
        expect(colors.text).toBe(text)
        expect(colors.accent).toBe(accent)
    })
})

describe('paletteFor: alto contraste', () => {
    it('bordas claras e fundo preto', async () => {
        const { paletteFor } = await import('./theme')
        const palette = paletteFor('contrast')
        expect(palette.bg).toBe('#000000')
        expect(palette.border).toBe('#6b6b7e')
    })
})
