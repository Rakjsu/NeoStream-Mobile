import { describe, expect, it } from 'vitest'
import { parseFirstSegment, speedVerdict, toMbps } from './speedtest'

describe('parseFirstSegment', () => {
    it('acha a primeira mídia e resolve URL relativa', () => {
        const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg001.ts\nseg002.ts'
        expect(parseFirstSegment(playlist, 'http://s/live/u/p/9.m3u8')).toBe('http://s/live/u/p/seg001.ts')
    })

    it('URL absoluta passa reta; playlist vazia vira vazio', () => {
        expect(parseFirstSegment('#EXTM3U\nhttp://cdn/x.ts', 'http://s/a.m3u8')).toBe('http://cdn/x.ts')
        expect(parseFirstSegment('#EXTM3U\n#EXT-X-ENDLIST', 'http://s/a.m3u8')).toBe('')
    })
})

describe('toMbps / speedVerdict', () => {
    it('converte bytes/tempo em Mbps', () => {
        // 4 MB em 2s = 16 Mbit/s
        expect(toMbps(4_000_000, 2000)).toBe(16)
        expect(toMbps(0, 1000)).toBe(0)
        expect(toMbps(1000, 0)).toBe(0)
    })

    it('veredito por faixa', () => {
        expect(speedVerdict(30)).toBe('4k')
        expect(speedVerdict(10)).toBe('hd')
        expect(speedVerdict(5)).toBe('sd')
        expect(speedVerdict(1)).toBe('slow')
    })
})
