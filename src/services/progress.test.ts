import { describe, it, expect, vi } from 'vitest'
import {
    applySample, buildProgressId, isFinished, listContinue,
    progressPct, resumePosition, type ProgressEntry,
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
