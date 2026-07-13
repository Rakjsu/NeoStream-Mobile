/**
 * Compartilhar configuração por link: contas + preferências viram um deep
 * link `neostream://setup?d=<base64>` — montar o app da família em outro
 * aparelho leva segundos. Codificação e parse são PUROS (testáveis).
 * De propósito NÃO leva histórico/favoritos (isso é do backup completo).
 */
import type { StoredAccount } from './session'
import { decodeBase64Utf8 } from './xtream'

export interface SetupPayload {
    accounts: StoredAccount[]
    activeId: string | null
    tmdbKey?: string
    prefs?: { downloadLimitGb: number; dataSaver: boolean }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** UTF-8 → base64 sem btoa (o Hermes não garante) (PURO). */
export function encodeBase64Utf8(text: string): string {
    const bytes: number[] = []
    for (const char of text) {
        const cp = char.codePointAt(0)!
        if (cp < 0x80) bytes.push(cp)
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63))
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    }
    let out = ''
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = bytes[i + 1]
        const b2 = bytes[i + 2]
        out += B64[b0 >> 2]
        out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
        out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
        out += b2 === undefined ? '=' : B64[b2 & 63]
    }
    return out
}

/** Payload → deep link compartilhável (PURO). */
export function buildSetupLink(payload: SetupPayload): string {
    return `neostream://setup?d=${encodeURIComponent(encodeBase64Utf8(JSON.stringify(payload)))}`
}

/** Parâmetro `d` → payload validado (PURO; null = link inválido). */
export function parseSetupParam(d: string): SetupPayload | null {
    try {
        const parsed = JSON.parse(decodeBase64Utf8(d)) as Partial<SetupPayload> | null
        if (!parsed || !Array.isArray(parsed.accounts)) return null
        const accounts = parsed.accounts.filter((account): account is StoredAccount =>
            !!account && typeof account.id === 'string' && typeof account.url === 'string')
        if (accounts.length === 0) return null
        return {
            accounts,
            activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
            tmdbKey: typeof parsed.tmdbKey === 'string' ? parsed.tmdbKey : undefined,
            prefs: parsed.prefs && typeof parsed.prefs === 'object' ? parsed.prefs : undefined,
        }
    } catch {
        return null
    }
}
