import { describe, expect, it, vi } from 'vitest'
import { canRecordUrl, parseHlsSegments } from './recorder'
import { splitDue, type ScheduledRec } from './schedRec'

vi.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///doc/',
    makeDirectoryAsync: vi.fn(), createDownloadResumable: vi.fn(), getInfoAsync: vi.fn(), deleteAsync: vi.fn(),
}))
vi.mock('./downloads', () => ({ addLocalDownload: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn() },
}))
vi.mock('./notify', () => ({ notifyAt: vi.fn(), notifyNow: vi.fn() }))
vi.mock('./session', () => ({ getClient: vi.fn(async () => null) }))

describe('gravador', () => {
    it('canRecordUrl: http grava (TS e HLS); resto não', () => {
        expect(canRecordUrl('http://s/live/u/p/9.ts')).toBe(true)
        expect(canRecordUrl('http://s/live/u/p/9.m3u8')).toBe(true)
        expect(canRecordUrl('file:///x.ts')).toBe(false)
        expect(canRecordUrl('stalker://ep/1/2')).toBe(false)
    })

    it('parseHlsSegments resolve relativas e ignora comentários/lixo', () => {
        const playlist = '#EXTM3U\n#EXTINF:6,\nseg1.ts\n\n#EXT-X\nhttp://cdn/seg2.ts'
        expect(parseHlsSegments(playlist, 'http://s/ch/index.m3u8'))
            .toEqual(['http://s/ch/seg1.ts', 'http://cdn/seg2.ts'])
    })
})

describe('gravação agendada (splitDue)', () => {
    const rec = (startMs: number, endMs: number): ScheduledRec =>
        ({ channelId: '1', channelName: 'C', title: 'P', startMs, endMs })

    it('na janela é devida; futura fica; vencida some', () => {
        const now = 1000
        const { due, keep } = splitDue([rec(500, 2000), rec(1500, 3000), rec(100, 900)], now)
        expect(due).toHaveLength(1)
        expect(due[0].startMs).toBe(500)
        expect(keep).toHaveLength(1)
        expect(keep[0].startMs).toBe(1500)
    })
})
