import { describe, expect, it, vi } from 'vitest'
import { guessAccountType, mergeAccountLists, parseDesktopBackupAccounts } from './backup'
import type { StoredAccount } from './session'

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

const desktopBackup = (playlists: unknown[] | undefined, version = 3) => JSON.stringify({
    version,
    exportedAt: '2026-07-16T00:00:00.000Z',
    app: 'neostream',
    data: { neostream_language: 'pt' },
    ...(playlists ? { playlists } : {}),
})

// btoa do desktop = base64 padrão do UTF-8
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')

describe('parseDesktopBackupAccounts (backup do desktop → contas)', () => {
    it('extrai contas com senha decodificada, tipo deduzido e apelido', () => {
        const accounts = parseDesktopBackupAccounts(desktopBackup([
            { name: 'Casa', url: 'http://host:8080', username: 'user', passwordB64: b64('sênha!') },
            { name: 'Lista', url: 'http://x/lista.m3u', username: '', passwordB64: b64('') },
            { name: 'Portal', url: 'http://portal/c/', username: '00:1A:79:AA:BB:CC', passwordB64: b64('') },
        ]))
        expect(accounts).not.toBeNull()
        expect(accounts).toHaveLength(3)
        expect(accounts![0]).toMatchObject({ url: 'http://host:8080', username: 'user', password: 'sênha!', type: 'xtream', alias: 'Casa' })
        expect(accounts![0].id).toBeTruthy()
        expect(accounts![1].type).toBe('m3u')
        expect(accounts![2].type).toBe('stalker')
    })

    it('v1 sem playlists devolve lista vazia (é desktop, mas sem contas)', () => {
        expect(parseDesktopBackupAccounts(desktopBackup(undefined, 1))).toEqual([])
    })

    it('devolve null pra backup do mobile e JSON quebrado', () => {
        expect(parseDesktopBackupAccounts(JSON.stringify({ app: 'neostream-mobile', accounts: [] }))).toBeNull()
        expect(parseDesktopBackupAccounts('{oops')).toBeNull()
    })
})

describe('guessAccountType', () => {
    it('MAC vira stalker, sem usuário ou .m3u vira m3u, resto xtream', () => {
        expect(guessAccountType('http://portal/c/', '00:1a:79:aa:bb:cc')).toBe('stalker')
        expect(guessAccountType('http://x/lista.m3u', 'user')).toBe('m3u')
        expect(guessAccountType('http://x/lista', '')).toBe('m3u')
        expect(guessAccountType('http://host:8080', 'user')).toBe('xtream')
    })
})

describe('mergeAccountLists', () => {
    const conta = (id: string, alias?: string): StoredAccount =>
        ({ id, url: `http://${id}`, username: 'u', password: 'p', alias })

    it('junta sem duplicar e preserva o apelido local', () => {
        const merged = mergeAccountLists(
            [conta('a', 'Meu apelido'), conta('b')],
            [conta('a'), conta('c', 'Nova')],
        )
        expect(merged.map(a => a.id).sort()).toEqual(['a', 'b', 'c'])
        expect(merged.find(a => a.id === 'a')?.alias).toBe('Meu apelido')
        expect(merged.find(a => a.id === 'c')?.alias).toBe('Nova')
    })
})
