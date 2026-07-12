import { describe, it, expect, beforeEach } from 'vitest'
import { clearEpisodeQueue, nextEpisodeAfter, nextIndex, setEpisodeQueue, type QueuedEpisode } from './episodeQueue'

const ep = (n: number): QueuedEpisode => ({
    pid: `episode:${n}`,
    sid: String(n),
    container: 'mp4',
    title: `Série · Ep ${n}`,
    cover: '',
})

describe('nextIndex', () => {
    it('avança sem dar a volta', () => {
        expect(nextIndex(0, 3)).toBe(1)
        expect(nextIndex(1, 3)).toBe(2)
    })

    it('fim da lista e índice inválido devolvem null', () => {
        expect(nextIndex(2, 3)).toBeNull() // último
        expect(nextIndex(-1, 3)).toBeNull() // pid não encontrado
        expect(nextIndex(0, 0)).toBeNull() // fila vazia
    })
})

describe('fila de episódios', () => {
    beforeEach(() => clearEpisodeQueue())

    it('devolve o episódio seguinte ao pid dado', () => {
        setEpisodeQueue([ep(1), ep(2), ep(3)])
        expect(nextEpisodeAfter('episode:1')?.sid).toBe('2')
        expect(nextEpisodeAfter('episode:2')?.sid).toBe('3')
    })

    it('último episódio, pid desconhecido e fila limpa devolvem null', () => {
        setEpisodeQueue([ep(1), ep(2)])
        expect(nextEpisodeAfter('episode:2')).toBeNull()
        expect(nextEpisodeAfter('episode:99')).toBeNull()
        clearEpisodeQueue()
        expect(nextEpisodeAfter('episode:1')).toBeNull()
    })

    it('atravessa temporadas: a fila é achatada na ordem em que foi montada', () => {
        // T1E1, T1E2, T2E1 — o fim da T1 emenda na T2.
        setEpisodeQueue([ep(11), ep(12), ep(21)])
        expect(nextEpisodeAfter('episode:12')?.pid).toBe('episode:21')
    })
})
