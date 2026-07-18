import { describe, expect, it } from 'vitest'
import { isMvLayout, MV_LAYOUTS, mvCellFrame, mvSlotCount, nextMvLayout, type MvLayout } from './mvLayout'

describe('mvLayout (mosaicos do multi-view)', () => {
    it('ciclo passa por todos os layouts e volta ao início', () => {
        const seen: MvLayout[] = ['2x2']
        let current: MvLayout = '2x2'
        for (let i = 0; i < MV_LAYOUTS.length - 1; i++) {
            current = nextMvLayout(current)
            seen.push(current)
        }
        expect(new Set(seen).size).toBe(MV_LAYOUTS.length)
        expect(nextMvLayout(current)).toBe('2x2')
    })

    it('contagem de quadrantes por layout', () => {
        expect(mvSlotCount('2x2')).toBe(4)
        expect(mvSlotCount('1x2')).toBe(2)
        expect(mvSlotCount('1+2')).toBe(3)
        expect(mvSlotCount('1+3')).toBe(4)
    })

    it('frames ficam dentro da área e cobrem 100% dela', () => {
        for (const layout of MV_LAYOUTS) {
            let area = 0
            for (let index = 0; index < mvSlotCount(layout); index++) {
                const frame = mvCellFrame(layout, index)
                expect(frame.left).toBeGreaterThanOrEqual(0)
                expect(frame.top).toBeGreaterThanOrEqual(0)
                expect(frame.left + frame.width).toBeLessThanOrEqual(100.01)
                expect(frame.top + frame.height).toBeLessThanOrEqual(100.01)
                area += frame.width * frame.height
            }
            expect(area).toBeCloseTo(10_000, 0)
        }
    })

    it('o quadrante grande dos assimétricos é o primeiro', () => {
        expect(mvCellFrame('1+2', 0).height).toBeGreaterThan(mvCellFrame('1+2', 1).height)
        expect(mvCellFrame('1+3', 0).width).toBeGreaterThan(mvCellFrame('1+3', 1).width)
    })

    it('isMvLayout valida o que veio do AsyncStorage', () => {
        for (const layout of MV_LAYOUTS) expect(isMvLayout(layout)).toBe(true)
        expect(isMvLayout('3x3')).toBe(false)
        expect(isMvLayout(undefined)).toBe(false)
    })
})
