import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeAll, probeStream } from './probe'

afterEach(() => vi.unstubAllGlobals())

describe('probeStream', () => {
    it('2xx/206 = vivo; erro de rede e URL não-http = morto', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })))
        expect(await probeStream('http://srv/live/1.ts')).toBe(true)

        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 206 })))
        expect(await probeStream('http://srv/live/2.ts')).toBe(true)

        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
        expect(await probeStream('http://srv/live/3.ts')).toBe(false)

        expect(await probeStream('stalker://archive/9')).toBe(false)
    })
})

describe('probeAll', () => {
    it('preserva a ordem e marca vivo/morto por item', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: unknown) => ({
            ok: !String(url).includes('morto'), status: 200,
        })))
        const results = await probeAll(
            [{ id: 'a', url: 'http://srv/ok' }, { id: 'b', url: 'http://srv/morto' }, { id: 'c', url: 'http://srv/ok2' }],
            item => item.url,
            2,
        )
        expect(results.map(r => `${r.item.id}:${r.alive ? 1 : 0}`)).toEqual(['a:1', 'b:0', 'c:1'])
    })
})
