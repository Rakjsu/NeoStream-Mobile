import { beforeEach, describe, expect, it } from 'vitest'
import { addToWatchQueue, clearWatchQueue, nextVodAfter, watchQueueSize } from './watchQueue'

const vod = (pid: string) => ({ pid, sid: pid, container: 'mp4', title: `Filme ${pid}`, cover: '' })

describe('watchQueue (fila de reprodução de VODs)', () => {
    beforeEach(() => clearWatchQueue())

    it('adiciona com dedupe por pid e conta o tamanho', () => {
        expect(addToWatchQueue(vod('a'))).toBe(1)
        expect(addToWatchQueue(vod('b'))).toBe(2)
        expect(addToWatchQueue(vod('a'))).toBe(2)
        expect(watchQueueSize()).toBe(2)
    })

    it('encadeia: item da fila puxa o seguinte; o último não puxa nada', () => {
        addToWatchQueue(vod('a'))
        addToWatchQueue(vod('b'))
        expect(nextVodAfter('a')?.pid).toBe('b')
        expect(nextVodAfter('b')).toBeNull()
    })

    it('filme fora da fila liga a fila no primeiro item', () => {
        addToWatchQueue(vod('x'))
        expect(nextVodAfter('desconhecido')?.pid).toBe('x')
    })

    it('fila vazia nunca encadeia', () => {
        expect(nextVodAfter('a')).toBeNull()
    })
})
