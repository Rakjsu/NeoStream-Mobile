import { describe, it, expect } from 'vitest'
import { groupChannelVariants, qualityRank } from './channelVariants'

const ch = (id: number, name: string) => ({ stream_id: id, name })

describe('qualityRank', () => {
    it('ordena 4K > FHD > HD > SD > sem marcação', () => {
        expect(qualityRank('Globo 4K')).toBe(4)
        expect(qualityRank('Globo FHD')).toBe(3)
        expect(qualityRank('Globo Full HD')).toBe(3)
        expect(qualityRank('Globo HD')).toBe(2)
        expect(qualityRank('Globo SD')).toBe(1)
        expect(qualityRank('Globo')).toBe(0)
    })
})

describe('groupChannelVariants', () => {
    it('vira um card por canal, melhor qualidade na frente, ordem preservada', () => {
        const { groups, variantsOf } = groupChannelVariants([
            ch(1, 'Globo SD'),
            ch(2, 'SBT HD'),
            ch(3, 'Globo FHD'),
            ch(4, 'Globo HD'),
            ch(5, 'Record'),
        ])
        expect(groups.map(c => c.name)).toEqual(['Globo FHD', 'SBT HD', 'Record'])
        expect(variantsOf.get('3')?.map(c => c.name)).toEqual(['Globo SD', 'Globo FHD', 'Globo HD'])
        // Sem variantes = fora do mapa (o card nem mostra o seletor).
        expect(variantsOf.has('2')).toBe(false)
        expect(variantsOf.has('5')).toBe(false)
    })

    it('lista sem duplicatas passa reta', () => {
        const { groups, variantsOf } = groupChannelVariants([ch(1, 'A'), ch(2, 'B')])
        expect(groups).toHaveLength(2)
        expect(variantsOf.size).toBe(0)
    })
})
