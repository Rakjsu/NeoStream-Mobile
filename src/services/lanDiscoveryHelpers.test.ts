import { describe, it, expect } from 'vitest'
import { subnetHosts, isNeoStreamHealth } from './lanDiscoveryHelpers'

describe('lanDiscoveryHelpers', () => {
    it('subnetHosts gera a /24 sem o próprio IP', () => {
        const hosts = subnetHosts('192.168.1.42')
        expect(hosts).toHaveLength(253)
        expect(hosts[0]).toBe('192.168.1.1')
        expect(hosts).not.toContain('192.168.1.42')
        expect(hosts).toContain('192.168.1.254')
    })

    it('subnetHosts rejeita IP inválido', () => {
        expect(subnetHosts('')).toEqual([])
        expect(subnetHosts('abc.def')).toEqual([])
        expect(subnetHosts('10.0.0')).toEqual([])
    })

    it('isNeoStreamHealth só aceita o health do controle web', () => {
        expect(isNeoStreamHealth({ ok: true, app: 'neostream-remote', uptimeSeconds: 5 })).toBe(true)
        expect(isNeoStreamHealth({ ok: true, app: 'outro' })).toBe(false)
        expect(isNeoStreamHealth({ ok: false, app: 'neostream-remote' })).toBe(false)
        expect(isNeoStreamHealth(null)).toBe(false)
    })
})
