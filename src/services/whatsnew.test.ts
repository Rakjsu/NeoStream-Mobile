import { describe, it, expect, vi } from 'vitest'
import { cleanReleaseNotes } from './whatsnew'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

describe('cleanReleaseNotes (markdown → texto do modal)', () => {
    it('tira cabeçalhos, negrito e créditos; bullets viram •', () => {
        const raw = '## Novidades\n\n* **REC agendado** by @Rakjsu in https://github.com/x/pull/1\n* Badge NOVO'
        expect(cleanReleaseNotes(raw)).toBe('Novidades\n\n• REC agendado\n• Badge NOVO')
    })

    it('colapsa linhas em branco em excesso e apara as pontas', () => {
        expect(cleanReleaseNotes('\n\nA\n\n\n\nB\n\n')).toBe('A\n\nB')
    })

    it('texto vazio continua vazio', () => {
        expect(cleanReleaseNotes('')).toBe('')
    })
})
