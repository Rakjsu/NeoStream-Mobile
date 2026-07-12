import { describe, it, expect } from 'vitest'
import { pushRecent, type RecentChannel } from './recents'

const ch = (id: string, logo = ''): RecentChannel => ({ id, name: `Canal ${id}`, logo })

describe('pushRecent', () => {
    it('põe no topo e não duplica', () => {
        const list = pushRecent(pushRecent([], ch('1')), ch('2'))
        expect(list.map(c => c.id)).toEqual(['2', '1'])
        expect(pushRecent(list, ch('1')).map(c => c.id)).toEqual(['1', '2'])
    })

    it('respeita o teto descartando o mais antigo', () => {
        let list: RecentChannel[] = []
        for (let index = 1; index <= 5; index++) list = pushRecent(list, ch(String(index)), 3)
        expect(list.map(c => c.id)).toEqual(['5', '4', '3'])
    })

    it('zapping sem logo preserva o logo já conhecido', () => {
        const list = pushRecent([], ch('1', 'http://logo/1.png'))
        const rezap = pushRecent(list, { id: '1', name: 'Canal 1', logo: '' })
        expect(rezap[0].logo).toBe('http://logo/1.png')
    })
})
