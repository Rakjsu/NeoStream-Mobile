/**
 * Paleta do NeoStream (mesmo clima do desktop: fundo escuro + índigo).
 *
 * Tema por variante: o `colors` é MUTÁVEL e o initTheme() roda no boot
 * (index.tsx espera) ANTES das rotas — como os StyleSheets das telas são
 * criados no primeiro render de cada rota (require lazy do expo-router),
 * eles já nascem com a variante certa. Trocar o tema vale ao reabrir o app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isTV } from './tv'

export type ThemeVariant = 'dark' | 'amoled'

const THEME_KEY = 'neostream_theme'
const ACCENT_KEY = 'neostream_accent'

/** Presets de cor de destaque — accent + o "soft" derivado (PURO). */
export const ACCENT_PRESETS = {
    indigo: { accent: '#6366f1', accentSoft: 'rgba(99,102,241,0.18)' },
    blue: { accent: '#3b82f6', accentSoft: 'rgba(59,130,246,0.18)' },
    green: { accent: '#22c55e', accentSoft: 'rgba(34,197,94,0.18)' },
    orange: { accent: '#f97316', accentSoft: 'rgba(249,115,22,0.18)' },
    pink: { accent: '#ec4899', accentSoft: 'rgba(236,72,153,0.18)' },
} as const
export type AccentName = keyof typeof ACCENT_PRESETS

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
let accent: AccentName = 'indigo'

export function themeVariant(): ThemeVariant {
    return variant
}

export function currentAccent(): AccentName {
    return accent
}

function applyAccent(next: AccentName): void {
    accent = next
    Object.assign(colors, ACCENT_PRESETS[next] ?? ACCENT_PRESETS.indigo)
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
        const savedAccent = await AsyncStorage.getItem(ACCENT_KEY)
        if (savedAccent && savedAccent in ACCENT_PRESETS) applyAccent(savedAccent as AccentName)
    } catch { /* fica no escuro padrão */ }
}

/** Mesma pegada do tema: muda na hora nos estilos novos; 100% ao reabrir. */
export async function setAccent(next: AccentName): Promise<void> {
    applyAccent(next)
    try {
        await AsyncStorage.setItem(ACCENT_KEY, next)
    } catch { /* best-effort */ }
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
    applyAccent('indigo')
}

// Na TV o app respira mais — mesmo token, escala 10-foot.
const gap = (n: number) => (isTV ? Math.round(n * 1.25) : n)
export const spacing = { xs: gap(4), sm: gap(8), md: gap(12), lg: gap(16), xl: gap(24) }
