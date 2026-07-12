/**
 * Retry com backoff exponencial + jitter pros fetches de provedor.
 * Provedor IPTV é flaky por natureza: um 5xx ou timeout passageiro não pode
 * virar "Falha ao carregar" na tela. 4xx é definitivo — não insiste.
 */

/** Erros dos clients chegam como `HTTP <status>` ou falha de rede/timeout. */
export function isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const match = /^HTTP (\d{3})$/.exec(error.message)
    if (match) return Number(match[1]) >= 500
    // Sem status → rede caiu, DNS, timeout… vale tentar de novo.
    return true
}

/** 500ms, 1s, 2s… com jitter de 50–100% (random injetável pros testes). */
export function backoffDelay(attempt: number, baseMs = 500, random: () => number = Math.random): number {
    return Math.round(baseMs * 2 ** attempt * (0.5 + random() * 0.5))
}

export interface RetryOptions {
    /** Total de tentativas (default 3: original + 2 retries). */
    attempts?: number
    baseDelayMs?: number
}

export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const attempts = options.attempts ?? 3
    const baseDelayMs = options.baseDelayMs ?? 500
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await run()
        } catch (error) {
            lastError = error
            if (!isRetryable(error) || attempt === attempts - 1) throw error
            await new Promise(resolve => setTimeout(resolve, backoffDelay(attempt, baseDelayMs)))
        }
    }
    throw lastError
}
