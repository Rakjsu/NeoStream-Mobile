import { describe, it, expect, vi } from 'vitest'
import { parseBackup, serializeBackup, type MobileBackup } from './backup'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), multiRemove: vi.fn() },
}))
vi.mock('./downloads', () => ({
    getDownloadLimitGb: vi.fn(async () => 0),
    setDownloadLimitGb: vi.fn(async () => undefined),
}))
vi.mock('./dataSaver', () => ({
    isDataSaverEnabled: vi.fn(async () => false),
    setDataSaver: vi.fn(async () => undefined),
}))

const sample: MobileBackup = {
    app: 'neostream-mobile',
    version: 1,
    accounts: [{ id: 'u@http://a.tv', url: 'http://a.tv', username: 'u', password: 'p' }],
    activeId: 'u@http://a.tv',
    favorites: { live: ['1'], movie: [], series: [] },
    progress: {},
    watched: ['episode:9'],
    parental: { enabled: false, pin: '' },
}

describe('parseBackup (validação do texto colado)', () => {
    it('roundtrip com serializeBackup', () => {
        expect(parseBackup(serializeBackup(sample))).toEqual(sample)
    })

    it('mensagens amigáveis pra cada jeito de dar errado', () => {
        expect(() => parseBackup('não é json')).toThrow(/JSON quebrado/)
        expect(() => parseBackup('{"app":"outro-app"}')).toThrow(/não é um backup/)
        expect(() => parseBackup(JSON.stringify({ ...sample, version: 99 }))).toThrow(/não suportada/)
        expect(() => parseBackup(JSON.stringify({ app: 'neostream-mobile', version: 1 }))).toThrow(/sem a lista de contas/)
    })
})

describe('backup v2 (retrocompatível)', () => {
    it('aceita v1 sem hidden/prefs', () => {
        const v1 = parseBackup(JSON.stringify({ app: 'neostream-mobile', version: 1, accounts: [] }))
        expect(v1.version).toBe(1)
        expect(v1.hiddenByAccount).toBeUndefined()
    })

    it('aceita v2 com ocultos e preferências', () => {
        const v2 = parseBackup(JSON.stringify({
            app: 'neostream-mobile', version: 2, accounts: [],
            hiddenByAccount: { 'u@http://a.tv': [{ id: '1', name: 'X' }] },
            prefs: { downloadLimitGb: 2, dataSaver: true },
        }))
        expect(v2.prefs?.downloadLimitGb).toBe(2)
    })

    it('aceita v3 com Minha lista/TMDB/kids/buscas', () => {
        const v3 = parseBackup(JSON.stringify({
            app: 'neostream-mobile', version: 3, accounts: [],
            watchlist: [{ kind: 'movie', id: '7', name: 'Duna', cover: '', addedAt: 1 }],
            tmdbKey: 'k1', kidsMode: true, searches: ['duna'],
        }))
        expect(v3.watchlist?.[0].name).toBe('Duna')
        expect(v3.tmdbKey).toBe('k1')
        expect(v3.kidsMode).toBe(true)
    })

    it('aceita v4 com perfis; rejeita v6', () => {
        const v4 = parseBackup(JSON.stringify({
            app: 'neostream-mobile', version: 4, accounts: [],
            profilesList: [{ id: 'p1', name: 'Sala', color: '#123' }],
            profilesData: { p1: { neostream_favorites: '{}' } },
        }))
        expect(v4.profilesList?.[0].name).toBe('Sala')
        expect(() => parseBackup(JSON.stringify({ app: 'neostream-mobile', version: 6, accounts: [] })))
            .toThrow(/não suportada/)
    })
})

describe('backup com senha (AES)', () => {
    it('ida e volta com a senha certa; null com a errada; vazio = texto puro', async () => {
        const { protectBackup, decryptBackup, isEncryptedBackup } = await import('./backup')
        const json = '{"version":4,"accounts":[]}'
        const sealed = protectBackup(json, 'segredo')
        expect(isEncryptedBackup(sealed)).toBe(true)
        expect(sealed).not.toContain('accounts')
        expect(decryptBackup(sealed, 'segredo')).toBe(json)
        expect(decryptBackup(sealed, 'errada')).toBeNull()
        expect(protectBackup(json, '  ')).toBe(json)
        expect(isEncryptedBackup(json)).toBe(false)
    })
})

describe('backup v5', () => {
    it('parse aceita a versão 5', async () => {
        const { parseBackup } = await import('./backup')
        expect(parseBackup(JSON.stringify({ app: 'neostream-mobile', version: 5, accounts: [] })).version).toBe(5)
    })
})
