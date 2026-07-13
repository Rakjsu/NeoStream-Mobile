/**
 * Sonda de canal: um GET curto (Range de 1 byte + timeout) diz se o stream
 * responde. Usada pelo "verificar favoritos" do diagnóstico — concorrência
 * limitada pra 20+ canais não virarem rajada no provedor.
 */

export async function probeStream(url: string, timeoutMs = 8000): Promise<boolean> {
    if (!/^https?:\/\//i.test(url)) return false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: controller.signal })
        return response.ok || response.status === 206
    } catch {
        return false
    } finally {
        clearTimeout(timer)
        controller.abort() // mata o corpo — só os headers interessam
    }
}

/** Roda as sondas com teto de simultâneas, preservando a ordem dos itens. */
export async function probeAll<T>(items: T[], urlOf: (item: T) => string, limit = 4): Promise<{ item: T; alive: boolean }[]> {
    const results: { item: T; alive: boolean }[] = []
    let cursor = 0
    const worker = async (): Promise<void> => {
        while (cursor < items.length) {
            const index = cursor++
            const item = items[index]
            results[index] = { item, alive: await probeStream(urlOf(item)) }
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
    return results
}
