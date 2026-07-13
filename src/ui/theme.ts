/**
 * Paleta do NeoStream (mesmo clima do desktop: fundo escuro + índigo).
 *
 * Tema por variante: o `colors` é MUTÁVEL e o initTheme() roda no boot
 * (index.tsx espera) ANTES das rotas — como os StyleSheets das telas são
 * criados no primeiro render de cada rota (require lazy do expo-router),
 * eles já nascem com a variante certa. Trocar o tema vale ao reabrir o app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeVariant = 'dark' | 'amoled'

const THEME_KEY = 'neostream_theme'

/** Só as superfícies mudam por variante (PURO). */
export function paletteFor(variant: ThemeVariant): { bg: string; card: string; border: string } {
    if (variant === 'amoled') return { bg: '#000000', card: '#0c0c0c', border: '#1d1d1d' }
    return { bg: '#0b0b10', card: '#16161f', border: '#26263a' }
}

export const colors = {
    bg: '#0b0b10',
    card: '#16161f',
    border: '#26263a',
    text: '#f4f4f8',
    textDim: 'rgba(244,244,248,0.55)',
    accent: '#6366f1',
    accentSoft: 'rgba(99,102,241,0.18)',
    danger: '#ef4444',
    live: '#22c55e',
}

let variant: ThemeVariant = 'dark'

export function themeVariant(): ThemeVariant {
    return variant
}

function applyVariant(next: ThemeVariant): void {
    variant = next
    Object.assign(colors, paletteFor(next))
}

/** Boot: carrega a variante salva antes das telas montarem seus estilos. */
export async function initTheme(): Promise<void> {
    try {
        const saved = await AsyncStorage.getItem(THEME_KEY)
        if (saved === 'amoled') applyVariant('amoled')
    } catch { /* fica no escuro padrão */ }
}

export async function setThemeVariant(next: ThemeVariant): Promise<void> {
    applyVariant(next)
    try {
        await AsyncStorage.setItem(THEME_KEY, next)
    } catch { /* best-effort */ }
}

/** Só pra testes. */
export function resetThemeCache(): void {
    applyVariant('dark')
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
