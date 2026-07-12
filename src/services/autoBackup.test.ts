import { describe, it, expect, vi } from 'vitest'
import { pruneList } from './autoBackup'

// Hoisted pelo vitest — o autoBackup puxa storage/fs/backup no import.
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn() },
}))
vi.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///doc/',
    makeDirectoryAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
    readAsStringAsync: vi.fn(),
    readDirectoryAsync: vi.fn(async () => []),
    deleteAsync: vi.fn(),
}))
vi.mock('./backup', () => ({
    collectBackup: vi.fn(async () => ({})),
    serializeBackup: vi.fn(() => '{}'),
}))

describe('pruneList', () => {
    it('apaga as mais antigas até sobrar o teto (nome tem a data)', () => {
        const names = ['auto-2026-07-10-0900.json', 'auto-2026-07-12-2100.json', 'auto-2026-07-11-1200.json']
        expect(pruneList(names, 2)).toEqual(['auto-2026-07-10-0900.json'])
        expect(pruneList(names, 5)).toEqual([])
    })
})
