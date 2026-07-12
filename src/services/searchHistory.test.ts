import { describe, it, expect, vi, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearSearchTerms, listSearchTerms, pushSearchTerm, recordSearchTerm } from './searchHistory'

// Hoisted pelo vitest.
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
            __store: store,
        },
    }
})

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store

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

describe('persistência do histórico', () => {
    beforeEach(() => store.clear())

    it('grava, lista e limpa', async () => {
        await recordSearchTerm('Matrix')
        await recordSearchTerm('Dark')
        expect(await listSearchTerms()).toEqual(['Dark', 'Matrix'])
        await clearSearchTerms()
        expect(await listSearchTerms()).toEqual([])
    })

    it('storage corrompido devolve lista vazia', async () => {
        store.set('neostream_search_history', '{nao é json')
        expect(await listSearchTerms()).toEqual([])
    })
})
