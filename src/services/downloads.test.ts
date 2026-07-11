import { describe, it, expect, vi } from 'vitest'
import { safeFileName } from './downloads'

// Hoisted pelo vitest — evita os imports reais (que puxam react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
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
