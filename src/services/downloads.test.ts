import { describe, it, expect, vi } from 'vitest'
import { groupDownloads, isFreeable, pickEvictions, pickPending, safeFileName , networkAllows } from './downloads'

// Hoisted pelo vitest — evita os imports reais (que puxam react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('./notify', () => ({ notifyDownloadDone: vi.fn(async () => undefined) }))
vi.mock('./progress', () => ({ loadWatched: vi.fn(async () => new Set<string>()) }))

vi.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///doc/',
    makeDirectoryAsync: vi.fn(),
    deleteAsync: vi.fn(),
    getInfoAsync: vi.fn(),
    createDownloadResumable: vi.fn(),
}))

describe('safeFileName', () => {
    it('id vira nome de arquivo seguro com a extensão certa', () => {
        expect(safeFileName('movie:123', 'mkv')).toBe('movie_123.mkv')
        expect(safeFileName('episode:9', 'MP4')).toBe('episode_9.mp4')
        expect(safeFileName('movie:../etc', 'mp4')).toBe('movie____etc.mp4')
        expect(safeFileName('movie:1', 'não-extensão!')).toBe('movie_1.mp4')
        expect(safeFileName('movie:1', '')).toBe('movie_1.mp4')
    })
})

describe('pickEvictions (teto de armazenamento)', () => {
    const GB = 1024 ** 3
    const item = (id: string, gb: number, at: number) =>
        ({ id, title: id, cover: '', container: 'mp4', fileUri: id, sizeBytes: gb * GB, downloadedAt: at })

    it('sem teto ou cabendo, ninguém sai', () => {
        const items = [item('a', 1, 1), item('b', 1, 2)]
        expect(pickEvictions(items, new Set(), 0)).toEqual([])
        expect(pickEvictions(items, new Set(), 5 * GB)).toEqual([])
    })

    it('assistidos saem primeiro; depois os mais antigos, até caber', () => {
        const items = [item('velho', 2, 1), item('visto', 2, 3), item('novo', 2, 2)]
        const out = pickEvictions(items, new Set(['visto']), 4 * GB)
        expect(out.map(i => i.id)).toEqual(['visto'])
        const out2 = pickEvictions(items, new Set(['visto']), 2 * GB)
        expect(out2.map(i => i.id)).toEqual(['visto', 'velho'])
    })
})

describe('pickPending (fila da temporada)', () => {
    const req = (id: string) => ({ id, url: 'http://u/' + id, title: id, cover: '', container: 'mp4' })

    it('pula já baixados/baixando/na fila e dedup interno', () => {
        const out = pickPending([req('a'), req('b'), req('a'), req('c')], new Set(['b']))
        expect(out.map(r => r.id)).toEqual(['a', 'c'])
    })
})

describe('groupDownloads', () => {
    const dl = (id: string, title: string, mb: number, at: number) =>
        ({ id, title, cover: '', container: 'mp4', fileUri: id, sizeBytes: mb, downloadedAt: at })

    it('gravações primeiro, episódios pela série, filmes no fim', () => {
        const groups = groupDownloads([
            dl('movie:1', 'Matrix', 700, 3),
            dl('episode:10', 'Dark · Ep 1', 300, 2),
            dl('episode:11', 'Dark · Ep 2', 300, 1),
            dl('rec:99', '⏺ Jogo', 900, 4),
        ], 'Filmes', 'Gravações')
        expect(groups.map(g => g.title)).toEqual(['Gravações', 'Dark', 'Filmes'])
        expect(groups[1].bytes).toBe(600)
        expect(groups[1].data).toHaveLength(2)
    })

    it('lista vazia → sem grupos', () => {
        expect(groupDownloads([], 'Filmes')).toEqual([])
    })
})

describe('networkAllows (só no Wi-Fi)', () => {
    it('sem trava, qualquer rede conectada serve', () => {
        expect(networkAllows(false, 'CELLULAR', true)).toBe(true)
        expect(networkAllows(false, 'WIFI', false)).toBe(false)
    })

    it('com trava, só Wi-Fi/cabo passam', () => {
        expect(networkAllows(true, 'WIFI', true)).toBe(true)
        expect(networkAllows(true, 'ETHERNET', true)).toBe(true)
        expect(networkAllows(true, 'CELLULAR', true)).toBe(false)
        expect(networkAllows(true, undefined, true)).toBe(false)
    })
})

describe('isFreeable (liberar espaço)', () => {
    const item = (id: string, at: number) =>
        ({ id, title: '', cover: '', container: 'ts', fileUri: '', sizeBytes: 1, downloadedAt: at })
    const DAY = 24 * 3600_000

    it('visto libera; gravação velha libera; resto fica', () => {
        const now = 100 * DAY
        expect(isFreeable(item('movie:1', now), new Set(['movie:1']), now)).toBe(true)
        expect(isFreeable(item('rec:1', now - 15 * DAY), new Set(), now)).toBe(true)
        expect(isFreeable(item('rec:2', now - 2 * DAY), new Set(), now)).toBe(false)
        expect(isFreeable(item('movie:2', now - 30 * DAY), new Set(), now)).toBe(false)
    })
})
