import { describe, expect, it, vi } from 'vitest'
import { parseSrt, srtTimeToMs, cueAt } from './opensubtitles'

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
    },
}))

const SRT = `1
00:00:01,000 --> 00:00:03,500
Olá, <i>mundo</i>!

2
00:00:10,000 --> 00:00:12,000
Segunda fala
em duas linhas

bloco quebrado sem tempo

3
00:00:05,000 --> 00:00:07,000
Fora de ordem
`

describe('opensubtitles — parser SRT (puro)', () => {
    it('srtTimeToMs converte com vírgula ou ponto', () => {
        expect(srtTimeToMs('00:00:01,000')).toBe(1000)
        expect(srtTimeToMs('01:02:03.450')).toBe(3723450)
        expect(srtTimeToMs('lixo')).toBe(0)
    })

    it('parseSrt pula blocos quebrados, tira tags e ordena por início', () => {
        const cues = parseSrt(SRT)
        expect(cues).toHaveLength(3)
        expect(cues[0]).toEqual({ startMs: 1000, endMs: 3500, text: 'Olá, mundo!' })
        expect(cues[1].text).toBe('Fora de ordem')
        expect(cues[2].text).toBe('Segunda fala\nem duas linhas')
    })

    it('cueAt acha a fala do instante e devolve null nos buracos', () => {
        const cues = parseSrt(SRT)
        expect(cueAt(cues, 2000)).toBe('Olá, mundo!')
        expect(cueAt(cues, 3500)).toBe('Olá, mundo!')
        expect(cueAt(cues, 4000)).toBeNull()
        expect(cueAt(cues, 11000)).toBe('Segunda fala\nem duas linhas')
        expect(cueAt(cues, 99999)).toBeNull()
        expect(cueAt([], 0)).toBeNull()
    })
})
