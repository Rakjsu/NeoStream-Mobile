import { describe, it, expect, vi } from 'vitest'
import { buildTransferUrl } from './desktopTransfer'

// Hoisted pelo vitest — evita os imports reais (que puxam react-native).
vi.mock('expo-file-system/legacy', () => ({
    uploadAsync: vi.fn(),
    FileSystemUploadType: { BINARY_CONTENT: 0 },
}))
vi.mock('./desktopLink', () => ({
    getDesktopLinkConfig: vi.fn(async () => ({ addr: '', pin: '', enabled: false })),
}))

describe('buildTransferUrl (item 12 — enviar download pro PC)', () => {
    it('filme monta kind=movie com nome+extensão codificados', () => {
        const url = buildTransferUrl('http', '192.168.0.10:17605', '1234', {
            id: 'movie:55', title: 'Filme X', container: 'mkv',
        })
        expect(url).toBe(
            'http://192.168.0.10:17605/transfer?pin=1234&kind=movie&name=Filme%20X.mkv&title=Filme%20X',
        )
    })

    it('episódio vira kind=episode e container vazio cai pra mp4', () => {
        const url = buildTransferUrl('https', 'pc.local:17605', '9%9', {
            id: 'episode:e1', title: 'Ep 1', container: '',
        })
        expect(url).toContain('https://pc.local:17605/transfer?pin=9%259')
        expect(url).toContain('&kind=episode')
        expect(url).toContain('&name=Ep%201.mp4')
    })
})
