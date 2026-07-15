/**
 * Modo 10-foot: a MESMA APK serve celular e Android TV — aqui vive a detecção
 * (Platform.isTV = uiMode television) e a escala pra assistir de longe:
 * fontes e cards ~30% maiores, espaçamento mais folgado e margem de overscan
 * (TVs cortam as bordas da tela).
 */
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

/** Margem de segurança de overscan (px) — 0 fora da TV. */
export const overscan = isTV ? 32 : 0
