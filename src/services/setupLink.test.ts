import { describe, expect, it } from 'vitest'
import { buildSetupLink, encodeBase64Utf8, parseSetupParam, type SetupPayload } from './setupLink'
import { decodeBase64Utf8 } from './xtream'

describe('link de configuração', () => {
    const payload: SetupPayload = {
        accounts: [{ id: 'u@http://a.tv', url: 'http://a.tv', username: 'usuário', password: 'çãõ123' }],
        activeId: 'u@http://a.tv',
        tmdbKey: 'k1',
        prefs: { downloadLimitGb: 2, dataSaver: true },
    }

    it('base64 próprio faz roundtrip com UTF-8 e padding', () => {
        for (const text of ['abc', 'ab', 'a', 'ação e 📺', ''] ) {
            expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text)
        }
    })

    it('build + parse fazem roundtrip pelo deep link', () => {
        const link = buildSetupLink(payload)
        expect(link.startsWith('neostream://setup?d=')).toBe(true)
        const d = decodeURIComponent(link.split('d=')[1])
        expect(parseSetupParam(d)).toEqual(payload)
    })

    it('lixo e payload sem contas viram null', () => {
        expect(parseSetupParam('nao-e-base64!!!')).toBeNull()
        expect(parseSetupParam(encodeBase64Utf8(JSON.stringify({ accounts: [] })))).toBeNull()
        expect(parseSetupParam(encodeBase64Utf8('"string"'))).toBeNull()
    })
})
