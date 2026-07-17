import { describe, expect, it } from 'vitest'
import { buildSetupLink, extractSetupParam, parseSetupParam } from './setupLink'
import type { StoredAccount } from './session'

describe('extractSetupParam (HTML do /setup do desktop → parâmetro d)', () => {
    it('acha o deep link no href e decodifica o percent-encoding', () => {
        const account: StoredAccount = { id: 'x', url: 'http://h', username: 'u', password: 'p+/=', type: 'xtream' }
        const link = buildSetupLink({ accounts: [account], activeId: 'x' })
        const html = `<!doctype html><body><a class="open" href="${link}">abrir</a></body>`

        const d = extractSetupParam(html)
        expect(d).not.toBeNull()
        const payload = parseSetupParam(d!)
        expect(payload).not.toBeNull()
        expect(payload!.accounts[0]).toMatchObject({ id: 'x', url: 'http://h', password: 'p+/=' })
        expect(payload!.activeId).toBe('x')
    })

    it('devolve null quando a página não tem o link', () => {
        expect(extractSetupParam('<html><body>403</body></html>')).toBeNull()
    })
})
