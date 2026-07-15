/**
 * Aviso de versão nova: sem loja, quem instala o APK não sabe de update.
 * Consulta a release mais recente do GitHub no máximo 1x/dia (cache no
 * aparelho). Comparação de versão é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const LATEST_URL = 'https://api.github.com/repos/Rakjsu/NeoStream-Mobile/releases/latest'
const CACHE_KEY = 'neostream_update_check'
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** "v0.3.0" / "0.3.0" → [0, 3, 0]; lixo → [] (nunca dispara aviso). */
export function parseVersion(tag: string): number[] {
    const match = /^v?(\d+(?:\.\d+)*)/.exec(tag.trim())
    if (!match) return []
    return match[1].split('.').map(Number)
}

export function isNewerVersion(current: string, latest: string): boolean {
    const a = parseVersion(current)
    const b = parseVersion(latest)
    if (a.length === 0 || b.length === 0) return false
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0
        const y = b[i] ?? 0
        if (y > x) return true
        if (y < x) return false
    }
    return false
}

export interface UpdateInfo {
    version: string
    url: string
    /** URL direta do .apk da release (habilita o update in-app). */
    apkUrl?: string
}

interface CachedCheck {
    at: number
    version: string
    url: string
    apkUrl?: string
}

/**
 * Versão mais nova disponível, ou null (em dia / sem rede / cache fresco).
 * `force` fura o cache de 24h (botão "Verificar atualização" nos Ajustes).
 */
export async function checkForUpdate(currentVersion: string, now = Date.now(), force = false): Promise<UpdateInfo | null> {
    let cached: CachedCheck | null = null
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY)
        cached = raw ? (JSON.parse(raw) as CachedCheck) : null
    } catch { /* segue pro fetch */ }

    let version = cached?.version ?? ''
    let url = cached?.url ?? ''
    let apkUrl = cached?.apkUrl ?? ''
    if (force || !cached || now - cached.at >= CHECK_INTERVAL_MS) {
        try {
            const response = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = (await response.json()) as {
                tag_name?: string; html_url?: string
                assets?: { name?: string; browser_download_url?: string }[]
            }
            version = typeof data.tag_name === 'string' ? data.tag_name : ''
            url = typeof data.html_url === 'string' ? data.html_url : ''
            // Prefere o APK universal; o -arm64 é só pra download manual.
            const apkAssets = (data.assets ?? []).filter(asset => asset.name?.endsWith('.apk'))
            apkUrl = (apkAssets.find(asset => !asset.name?.includes('arm64')) ?? apkAssets[0])?.browser_download_url ?? ''
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, version, url, apkUrl } satisfies CachedCheck))
        } catch {
            // Sem rede/limite da API: usa o cache velho se houver, senão silencia.
            if (!cached) return null
        }
    }

    return version && url && isNewerVersion(currentVersion, version)
        ? { version, url, apkUrl: apkUrl || undefined }
        : null
}
