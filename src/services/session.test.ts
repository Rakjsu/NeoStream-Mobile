import { describe, it, expect, vi } from 'vitest'
import { accountId, accountLabel, upsertAccount, type StoredAccount } from './session'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), multiRemove: vi.fn() },
}))

const conta = (url: string, username: string): { url: string; username: string; password: string } =>
    ({ url, username, password: 'p' })

describe('accountId / accountLabel', () => {
    it('id determinístico normalizado; label sem esquema', () => {
        expect(accountId(conta('prov.tv:8080/', 'u'))).toBe('u@http://prov.tv:8080')
        expect(accountId(conta('http://prov.tv:8080', 'u'))).toBe('u@http://prov.tv:8080')
        expect(accountLabel(conta('http://prov.tv:8080', 'u'))).toBe('u@prov.tv:8080')
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
