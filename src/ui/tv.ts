/**
 * Modo 10-foot: a MESMA APK serve celular e Android TV — aqui vive a detecção
 * (Platform.isTV = uiMode television) e a escala pra assistir de longe:
 * fontes e cards ~30% maiores, espaçamento mais folgado e margem de overscan
 * (TVs cortam as bordas da tela).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

export const isTV = Platform.isTV === true

/** Escala 10-foot (PURO — testável passando o fator explícito). */
export function scaledSize(base: number, tv = isTV, factor = 1.3): number {
    return tv ? Math.round(base * factor) : base
}

/** Tamanho pra UI: maior na TV, intacto no celular. */
export function tvSize(base: number): number {
    return scaledSize(base)
}

/**
 * Margem de segurança de overscan — 0 fora da TV; na TV é AJUSTÁVEL nos
 * Ajustes (cada TV corta uma borda diferente).
 */
const OVERSCAN_KEY = 'neostream_tv_overscan'
export const OVERSCAN_STEPS = [0, 16, 32, 48, 64]
let overscanPx = isTV ? 32 : 0
const overscanListeners = new Set<() => void>()

export function getOverscan(): number {
    return overscanPx
}

function subscribeOverscan(listener: () => void): () => void {
    overscanListeners.add(listener)
    return () => { overscanListeners.delete(listener) }
}

/** Valor vivo pra componentes — re-renderiza na hora do ajuste. */
export function useOverscan(): number {
    return useSyncExternalStore(subscribeOverscan, getOverscan)
}

export function setOverscan(px: number): void {
    overscanPx = Math.max(0, Math.min(64, Math.round(px)))
    overscanListeners.forEach(listener => listener())
    void AsyncStorage.setItem(OVERSCAN_KEY, String(overscanPx)).catch(() => undefined)
}

/** Boot: relê o ajuste salvo (só interessa na TV). */
export async function initTv(): Promise<void> {
    if (!isTV) return
    const raw = await AsyncStorage.getItem(OVERSCAN_KEY).catch(() => null)
    const parsed = Number(raw)
    if (raw !== null && Number.isFinite(parsed)) overscanPx = Math.max(0, Math.min(64, parsed))
}
