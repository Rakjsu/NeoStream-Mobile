import { describe, it, expect } from 'vitest'
import { pushSearchTerm } from './searchHistory'

describe('pushSearchTerm', () => {
    it('põe no topo, dedup sem diferenciar caixa, ignora vazio', () => {
        let list = pushSearchTerm([], 'Matrix')
        list = pushSearchTerm(list, 'Dark')
        expect(list).toEqual(['Dark', 'Matrix'])
        expect(pushSearchTerm(list, 'MATRIX')).toEqual(['MATRIX', 'Dark'])
        expect(pushSearchTerm(list, '   ')).toEqual(list)
    })

    it('respeita o teto', () => {
        let list: string[] = []
        for (let index = 1; index <= 10; index++) list = pushSearchTerm(list, `t${index}`, 3)
        expect(list).toEqual(['t10', 't9', 't8'])
    })
})
