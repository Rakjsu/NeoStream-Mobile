import { describe, it, expect } from 'vitest'
import { pruneList } from './autoBackup'

describe('pruneList', () => {
    it('apaga as mais antigas até sobrar o teto (nome tem a data)', () => {
        const names = ['auto-2026-07-10-0900.json', 'auto-2026-07-12-2100.json', 'auto-2026-07-11-1200.json']
        expect(pruneList(names, 2)).toEqual(['auto-2026-07-10-0900.json'])
        expect(pruneList(names, 5)).toEqual([])
    })
})
