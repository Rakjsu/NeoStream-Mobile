import { describe, it, expect, vi } from 'vitest'
import { parseBackup, serializeBackup, type MobileBackup } from './backup'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), multiRemove: vi.fn() },
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
