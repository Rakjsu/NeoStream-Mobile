/**
 * 🔎 Descoberta do desktop na LAN — parte PURA (testável): gera os candidatos
 * da subnet /24 e valida a resposta do /health do controle web.
 */

export const REMOTE_PORT = 8974

/** Candidatos da /24 a partir do IP local, sem o próprio IP. */
export function subnetHosts(localIp: string): string[] {
    const parts = localIp.split('.')
    if (parts.length !== 4 || parts.some(p => !/^\d+$/.test(p))) return []
    const base = parts.slice(0, 3).join('.')
    const self = Number(parts[3])
    const hosts: string[] = []
    for (let n = 1; n <= 254; n++) {
        if (n !== self) hosts.push(`${base}.${n}`)
    }
    return hosts
}

/** true quando o payload é o /health do controle web do NeoStream (v4.33+). */
export function isNeoStreamHealth(payload: unknown): boolean {
    const data = payload as { ok?: unknown; app?: unknown } | null
    return !!data && data.ok === true && data.app === 'neostream-remote'
}
