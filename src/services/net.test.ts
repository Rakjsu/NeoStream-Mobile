import { describe, it, expect, vi } from 'vitest'
import { backoffDelay, isRetryable, withRetry } from './net'

describe('isRetryable', () => {
    it('5xx e falha de rede sim; 4xx não', () => {
        expect(isRetryable(new Error('HTTP 502'))).toBe(true)
        expect(isRetryable(new Error('HTTP 500'))).toBe(true)
        expect(isRetryable(new Error('HTTP 404'))).toBe(false)
        expect(isRetryable(new Error('HTTP 401'))).toBe(false)
        expect(isRetryable(new Error('Network request failed'))).toBe(true)
        expect(isRetryable(new Error('Tempo esgotado — o servidor demorou demais pra responder.'))).toBe(true)
        expect(isRetryable('string qualquer')).toBe(false)
    })
})

describe('backoffDelay', () => {
    it('dobra por tentativa com jitter de 50–100%', () => {
        const min = () => 0 // jitter mínimo
        const max = () => 1 // jitter máximo
        expect(backoffDelay(0, 500, min)).toBe(250)
        expect(backoffDelay(0, 500, max)).toBe(500)
        expect(backoffDelay(1, 500, min)).toBe(500)
        expect(backoffDelay(2, 500, max)).toBe(2000)
    })
})

describe('withRetry', () => {
    it('insiste em falha transitória e devolve o sucesso', async () => {
        const run = vi.fn()
            .mockRejectedValueOnce(new Error('HTTP 503'))
            .mockRejectedValueOnce(new Error('Network request failed'))
            .mockResolvedValueOnce('ok')
        await expect(withRetry(run, { baseDelayMs: 1 })).resolves.toBe('ok')
        expect(run).toHaveBeenCalledTimes(3)
    })

    it('4xx não ganha segunda chance', async () => {
        const run = vi.fn().mockRejectedValue(new Error('HTTP 404'))
        await expect(withRetry(run, { baseDelayMs: 1 })).rejects.toThrow('HTTP 404')
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('esgotou as tentativas → propaga o último erro', async () => {
        const run = vi.fn().mockRejectedValue(new Error('HTTP 500'))
        await expect(withRetry(run, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('HTTP 500')
        expect(run).toHaveBeenCalledTimes(3)
    })
})
