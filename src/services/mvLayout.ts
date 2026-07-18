/**
 * Layouts do multi-view: além do 2×2 e do lado-a-lado, os mosaicos
 * assimétricos 1+2 (um grande em cima) e 1+3 (um grande + coluna de três).
 * PURO — frames em porcentagem pra posicionamento absoluto, testável sem UI.
 */
export type MvLayout = '2x2' | '1x2' | '1+2' | '1+3'

export const MV_LAYOUTS: MvLayout[] = ['2x2', '1x2', '1+2', '1+3']

export function isMvLayout(value: unknown): value is MvLayout {
    return typeof value === 'string' && (MV_LAYOUTS as string[]).includes(value)
}

/** Ciclo do botão do header: 2×2 → 1×2 → 1+2 → 1+3 → 2×2. */
export function nextMvLayout(current: MvLayout): MvLayout {
    const index = MV_LAYOUTS.indexOf(current)
    return MV_LAYOUTS[(index + 1) % MV_LAYOUTS.length]
}

/** Quantos quadrantes o layout mostra. */
export function mvSlotCount(layout: MvLayout): number {
    if (layout === '1x2') return 2
    if (layout === '1+2') return 3
    return 4
}

export interface MvFrame { left: number; top: number; width: number; height: number }

/** Posição do quadrante `index` (porcentagens da área do mosaico). */
export function mvCellFrame(layout: MvLayout, index: number): MvFrame {
    if (layout === '1x2') return { left: index * 50, top: 0, width: 50, height: 100 }
    if (layout === '1+2') {
        if (index === 0) return { left: 0, top: 0, width: 100, height: 60 }
        return { left: (index - 1) * 50, top: 60, width: 50, height: 40 }
    }
    if (layout === '1+3') {
        if (index === 0) return { left: 0, top: 0, width: 68, height: 100 }
        return { left: 68, top: (index - 1) * (100 / 3), width: 32, height: 100 / 3 }
    }
    return { left: (index % 2) * 50, top: index < 2 ? 0 : 50, width: 50, height: 50 }
}
