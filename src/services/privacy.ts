/**
 * Privacidade no multitarefa: com o bloqueio do app ativo, o conteúdo não
 * pode vazar em screenshot nem no preview de apps recentes (FLAG_SECURE).
 * Tudo best-effort — falhar aqui nunca pode travar o boot.
 */
import * as ScreenCapture from 'expo-screen-capture'
import { loadAppLock } from './appLock'

/** Aplica a política atual: PIN do app ligado = captura bloqueada. */
export async function applyCapturePolicy(): Promise<void> {
    try {
        const lock = await loadAppLock()
        if (lock.enabled) await ScreenCapture.preventScreenCaptureAsync()
        else await ScreenCapture.allowScreenCaptureAsync()
    } catch { /* Expo Go antigo / plataforma sem suporte */ }
}
