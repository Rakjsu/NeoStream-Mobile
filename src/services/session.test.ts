import { describe, it, expect, vi, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
    accountId, accountLabel, addAccount, cachedFetch, resetSessionCache,
    upsertAccount, type StoredAccount,
} from './session'

// Hoisted pelo vitest — storage de verdade em memória (evita o react-native).
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
            removeItem: vi.fn(async (key: string) => { store.delete(key) }),
            multiRemove: vi.fn(async (keys: string[]) => { keys.forEach(key => store.delete(key)) }),
            __store: store,
        },
    }
})

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store

const conta = (url: string, username: string): { url: string; username: string; password: string } =>
    ({ url, username, password: 'p' })

describe('accountId / accountLabel', () => {
    it('id determinístico normalizado; label sem esquema', () => {
        expect(accountId(conta('prov.tv:8080/', 'u'))).toBe('u@http://prov.tv:8080')
        expect(accountId(conta('http://prov.tv:8080', 'u'))).toBe('u@http://prov.tv:8080')
        expect(accountLabel(conta('http://prov.tv:8080', 'u'))).toBe('u@prov.tv:8080')
    })
})

describe('contas M3U', () => {
    it('id e label próprios (sem usuário)', () => {
        const conta = { url: 'http://prov.tv/lista.m3u', username: '', password: '', type: 'm3u' as const }
        expect(accountId(conta)).toBe('m3u@http://prov.tv/lista.m3u')
        expect(accountLabel(conta)).toBe('M3U · prov.tv')
    })
})

describe('upsertAccount (dedup por url+usuário)', () => {
    it('adiciona conta nova e atualiza a existente sem duplicar', () => {
        const first = upsertAccount([], conta('http://a.tv', 'u'), { status: 'Active' })
        expect(first.accounts).toHaveLength(1)
        expect(first.entry.id).toBe('u@http://a.tv')

        const second = upsertAccount(first.accounts, conta('http://b.tv', 'u'))
        expect(second.accounts).toHaveLength(2)

        // Relogin na primeira: atualiza (senha/userInfo), não duplica.
        const relogin = upsertAccount(second.accounts, { ...conta('http://a.tv', 'u'), password: 'nova' }, { status: 'Expired' })
        expect(relogin.accounts).toHaveLength(2)
        const updated = relogin.accounts.find((a: StoredAccount) => a.id === 'u@http://a.tv')
        expect(updated?.password).toBe('nova')
        expect(updated?.userInfo?.status).toBe('Expired')
    })

    it('é imutável (não mexe no array original)', () => {
        const original: StoredAccount[] = []
        upsertAccount(original, conta('http://a.tv', 'u'))
        expect(original).toHaveLength(0)
    })
})

describe('cachedFetch (SWR em disco)', () => {
    const KEY = 'neostream_catalog_u@http://a.tv_live'

    beforeEach(async () => {
        store.clear()
        resetSessionCache()
        await addAccount(conta('http://a.tv', 'u'), { status: 'Active' })
    })

    it('cache fresco em disco vai pra tela na hora e atualiza por tras', async () => {
        store.set(KEY, JSON.stringify({ t: Date.now(), data: ['do-disco'] }))
        const fetcher = vi.fn(async () => ['da-rede'])
        expect(await cachedFetch('live', fetcher)).toEqual(['do-disco'])
        // O refresh em background atualizou memoria e disco.
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(await cachedFetch('live', fetcher)).toEqual(['da-rede'])
        expect(JSON.parse(store.get(KEY)!).data).toEqual(['da-rede'])
    })

    it('rede falhou mas ha cache velho → modo offline', async () => {
        store.set(KEY, JSON.stringify({ t: 0, data: ['velho'] })) // > 24h
        const fetcher = vi.fn(async () => { throw new Error('Network request failed') })
        expect(await cachedFetch('live', fetcher)).toEqual(['velho'])
    })

    it('sucesso persiste no disco; chave nao-persistivel nao', async () => {
        expect(await cachedFetch('live', async () => ['fresquinho'])).toEqual(['fresquinho'])
        expect(JSON.parse(store.get(KEY)!).data).toEqual(['fresquinho'])
        await cachedFetch('epg:1', async () => ['agora'])
        expect([...store.keys()].some(key => key.includes('epg'))).toBe(false)
    })

    it('sem cache nenhum, erro de rede propaga', async () => {
        await expect(cachedFetch('live', async () => { throw new Error('HTTP 500') })).rejects.toThrow('HTTP 500')
    })
})
