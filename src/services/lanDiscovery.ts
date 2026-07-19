/**
 * 🔎 Varre a subnet /24 chamando GET /health (porta fixa do controle web)
 * em lotes com timeout curto — devolve o primeiro desktop NeoStream achado.
 */
import * as Network from 'expo-network'
import { REMOTE_PORT, isNeoStreamHealth, subnetHosts } from './lanDiscoveryHelpers'

const BATCH_SIZE = 24
const PROBE_TIMEOUT_MS = 900

async function probe(host: string): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
        const res = await fetch(`http://${host}:${REMOTE_PORT}/health`, { signal: controller.signal })
        if (!res.ok) return null
        return isNeoStreamHealth(await res.json()) ? host : null
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

/** Primeiro desktop com o controle web ligado na subnet, ou null. */
export async function discoverDesktop(): Promise<string | null> {
    const ip = await Network.getIpAddressAsync().catch(() => null)
    if (!ip) return null
    const hosts = subnetHosts(ip)
    for (let i = 0; i < hosts.length; i += BATCH_SIZE) {
        const results = await Promise.all(hosts.slice(i, i + BATCH_SIZE).map(probe))
        const found = results.find(Boolean)
        if (found) return found
    }
    return null
}
