import { describe, it, expect, vi } from 'vitest'
import { pickEvictions, safeFileName } from './downloads'

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
