import { describe, it, expect, vi } from 'vitest'
import {
    applySample, buildProgressId, isFinished, listContinue,
    pickNextEpisode, progressPct, resumePosition, type ProgressEntry,
    mergeProgressPush,
} from './progress'

// Hoisted pelo vitest — evita o import real (que puxa react-native).
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))

function entry(id: string, position: number, duration: number, updatedAt: number): ProgressEntry {
    const [kind, streamId] = id.split(':')
    return {
        id, kind: kind as ProgressEntry['kind'], streamId,
        container: 'mp4', title: id, cover: '', position, duration, updatedAt,
    }
}

describe('helpers puros do progresso', () => {
    it('buildProgressId e progressPct', () => {
        expect(buildProgressId('movie', 42)).toBe('movie:42')
        expect(progressPct(30, 120)).toBe(25)
        expect(progressPct(500, 120)).toBe(100) // clamp
        expect(progressPct(10, 0)).toBe(0)      // duração desconhecida
    })

    it('isFinished a partir de 95%', () => {
        expect(isFinished(95, 100)).toBe(true)
        expect(isFinished(94, 100)).toBe(false)
        expect(isFinished(50, 0)).toBe(false)
    })

    it('resumePosition ignora começo e fim do vídeo', () => {
        expect(resumePosition(undefined)).toBe(0)
        expect(resumePosition({ position: 10, duration: 3600 })).toBe(0)   // <30s: começa do zero
        expect(resumePosition({ position: 3585, duration: 3600 })).toBe(0) // faltam <30s
        expect(resumePosition({ position: 1200, duration: 3600 })).toBe(1200)
    })
})

describe('applySample (regra de gravação)', () => {
    it('grava a amostra, ignora início, remove terminados', () => {
        let map: Record<string, ProgressEntry> = {}
        map = applySample(map, entry('movie:1', 10, 3600, 1))   // muito no início
        expect(Object.keys(map)).toHaveLength(0)

        map = applySample(map, entry('movie:1', 600, 3600, 2))
        expect(map['movie:1'].position).toBe(600)

        map = applySample(map, entry('movie:1', 3550, 3600, 3)) // >=95% → terminou
        expect(map['movie:1']).toBeUndefined()
    })

    it('poda pros mais recentes quando estoura o limite', () => {
        let map: Record<string, ProgressEntry> = {}
        for (let i = 1; i <= 5; i++) map = applySample(map, entry(`movie:${i}`, 100, 3600, i), 3)
        expect(Object.keys(map).sort()).toEqual(['movie:3', 'movie:4', 'movie:5'])
    })
})

describe('pickNextEpisode (o que assistir agora na série)', () => {
    const eps = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]

    it('episódio em andamento ganha (o mais recente se houver vários)', () => {
        const progress = {
            'episode:e1': entry('episode:e1', 100, 3600, 10),
            'episode:e3': entry('episode:e3', 100, 3600, 99),
        }
        expect(pickNextEpisode(eps, new Set(), progress)?.id).toBe('e3')
    })

    it('sem andamento: primeiro não visto; tudo visto: null', () => {
        expect(pickNextEpisode(eps, new Set(['episode:e1']), {})?.id).toBe('e2')
        expect(pickNextEpisode(eps, new Set(), {})?.id).toBe('e1')
        expect(pickNextEpisode(eps, new Set(['episode:e1', 'episode:e2', 'episode:e3']), {})).toBeNull()
        expect(pickNextEpisode([], new Set(), {})).toBeNull()
    })
})

describe('listContinue', () => {
    it('ordena por mais recente e filtra por tipo', () => {
        const map = {
            'movie:1': entry('movie:1', 100, 3600, 10),
            'episode:2': entry('episode:2', 100, 3600, 30),
            'movie:3': entry('movie:3', 100, 3600, 20),
        }
        expect(listContinue(map).map(e => e.id)).toEqual(['episode:2', 'movie:3', 'movie:1'])
        expect(listContinue(map, 'movie').map(e => e.id)).toEqual(['movie:3', 'movie:1'])
    })
})

describe('mergeProgressPush (item 11 — sync com o desktop)', () => {
    const movie = (over: object = {}) => ({
        kind: 'movie' as const, movieId: '42', title: 'Filme', positionSec: 600, durationSec: 6000, updatedAt: 2000, ...over,
    })

    it('cria entry de filme quando não existe (container mp4 default)', () => {
        const next = mergeProgressPush({}, movie())
        const entry = next?.[buildProgressId('movie', '42')]
        expect(entry?.position).toBe(600)
        expect(entry?.container).toBe('mp4')
    })

    it('LWW: amostra mais velha que a local é ignorada', () => {
        const id = buildProgressId('movie', '42')
        const map = {
            [id]: { id, kind: 'movie' as const, streamId: '42', container: 'mkv', title: 'Filme', cover: '', position: 900, duration: 6000, updatedAt: 5000 },
        }
        expect(mergeProgressPush(map, movie({ updatedAt: 2000 }))).toBeNull()
        const applied = mergeProgressPush(map, movie({ updatedAt: 9000, positionSec: 1200 }))
        expect(applied?.[id]?.position).toBe(1200)
        expect(applied?.[id]?.container).toBe('mkv') // metadados locais preservados
    })

    it('episódio: atualiza entry existente casando por série + SxxEyy do título', () => {
        const map = {
            'episode:7': { id: 'episode:7', kind: 'episode' as const, streamId: '7', container: 'mp4', title: 'Minha Série · S02E05', cover: '', position: 100, duration: 1200, updatedAt: 1000 },
        }
        const next = mergeProgressPush(map, { kind: 'episode', title: 'minha série', season: 2, episode: 5, positionSec: 700, durationSec: 1200, updatedAt: 2000 })
        expect(next?.['episode:7']?.position).toBe(700)
    })

    it('episódio sem match local é ignorado (chega pelo Trakt depois)', () => {
        expect(mergeProgressPush({}, { kind: 'episode', title: 'Outra Série', season: 1, episode: 1, positionSec: 700, durationSec: 1200, updatedAt: 2000 })).toBeNull()
    })
})
