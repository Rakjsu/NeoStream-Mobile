import { describe, expect, it, vi } from 'vitest'
import { nextOccurrence } from './recurring'
import type { EpgProgram } from './xtream'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('./notify', () => ({ notifyAt: vi.fn(async () => true) }))
vi.mock('./session', () => ({ cachedFetch: vi.fn(), getClient: vi.fn(async () => null) }))

const program = (title: string, startMs: number): EpgProgram => ({ title, startMs, endMs: startMs + 3600_000 })

describe('nextOccurrence', () => {
    const now = 1000_000
    const grid = [
        program('Jornal da Noite', now - 5000),
        program('JORNAL  da noite', now + 8000),
        program('Jornal da Noite', now + 2000),
        program('Outra coisa', now + 1000),
    ]

    it('acha a PRÓXIMA exibição futura, sem diferenciar caixa/espaços', () => {
        expect(nextOccurrence(grid, 'jornal da noite', now)?.startMs).toBe(now + 2000)
    })

    it('null quando o título não volta a passar', () => {
        expect(nextOccurrence(grid, 'Filme inexistente', now)).toBeNull()
        expect(nextOccurrence([], 'Jornal da Noite', now)).toBeNull()
    })
})
