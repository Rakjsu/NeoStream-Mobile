/**
 * Trakt.tv com credenciais do PRÓPRIO usuário (mesmo modelo do TMDB): ele cria
 * um app pessoal em trakt.tv/oauth/applications e cola Client ID/Secret nos
 * Ajustes. A conexão é por device code (código digitado no site) e o app manda
 * filmes/episódios vistos pro /sync/history — melhor esforço, casando por
 * busca de título; nunca trava o fluxo de progresso local.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const API = 'https://api.trakt.tv'
const CREDS_KEY = 'neostream_trakt_creds'
const TOKEN_KEY = 'neostream_trakt_token'

export interface TraktCreds {
    clientId: string
    clientSecret: string
}

interface TraktToken {
    access: string
    refresh: string
}

export async function getTraktCreds(): Promise<TraktCreds> {
    try {
        const raw = await AsyncStorage.getItem(CREDS_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<TraktCreds>) : null
        return {
            clientId: typeof parsed?.clientId === 'string' ? parsed.clientId : '',
            clientSecret: typeof parsed?.clientSecret === 'string' ? parsed.clientSecret : '',
        }
    } catch {
        return { clientId: '', clientSecret: '' }
    }
}

export async function setTraktCreds(creds: TraktCreds): Promise<void> {
    try {
        await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({
            clientId: creds.clientId.trim(),
            clientSecret: creds.clientSecret.trim(),
        }))
    } catch { /* best-effort */ }
}

async function getToken(): Promise<TraktToken | null> {
    try {
        const raw = await AsyncStorage.getItem(TOKEN_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<TraktToken>) : null
        return parsed?.access ? { access: parsed.access, refresh: parsed.refresh ?? '' } : null
    } catch {
        return null
    }
}

export async function isTraktConnected(): Promise<boolean> {
    return !!(await getToken())
}

export async function disconnectTrakt(): Promise<void> {
    try {
        await AsyncStorage.removeItem(TOKEN_KEY)
    } catch { /* best-effort */ }
}

export interface DeviceAuth {
    deviceCode: string
    userCode: string
    verificationUrl: string
    intervalSec: number
    expiresIn: number
}

/** Passo 1 do device code: pede o código que o usuário digita no site. */
export async function startDeviceAuth(): Promise<DeviceAuth | null> {
    const { clientId } = await getTraktCreds()
    if (!clientId) return null
    try {
        const response = await fetch(`${API}/oauth/device/code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
        })
        if (!response.ok) return null
        const data = await response.json() as {
            device_code?: string; user_code?: string; verification_url?: string; interval?: number; expires_in?: number
        }
        if (!data.device_code || !data.user_code) return null
        return {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUrl: data.verification_url ?? 'https://trakt.tv/activate',
            intervalSec: data.interval ?? 5,
            expiresIn: data.expires_in ?? 600,
        }
    } catch {
        return null
    }
}

/** Passo 2: pergunta se o usuário já autorizou (400 = ainda não). */
export async function pollDeviceToken(deviceCode: string): Promise<'ok' | 'pending' | 'error'> {
    const { clientId, clientSecret } = await getTraktCreds()
    if (!clientId || !clientSecret) return 'error'
    try {
        const response = await fetch(`${API}/oauth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: deviceCode, client_id: clientId, client_secret: clientSecret }),
        })
        if (response.status === 200) {
            const data = await response.json() as { access_token?: string; refresh_token?: string }
            if (!data.access_token) return 'error'
            await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ access: data.access_token, refresh: data.refresh_token ?? '' }))
            return 'ok'
        }
        if (response.status === 400) return 'pending'
        return 'error'
    } catch {
        return 'error'
    }
}

/** "Série · S01E02 — Nome" → { show, season, episode } (PURO; null sem SxxEyy). */
export function parseEpisodeTitle(title: string): { show: string; season: number; episode: number } | null {
    const match = /^(.+?)[\s·:—–-]+S(\d{1,2})\s*E(\d{1,3})/i.exec(title.trim())
    if (!match) return null
    const show = match[1].replace(/[\s·:—–-]+$/, '').trim()
    if (!show) return null
    return { show, season: Number(match[2]), episode: Number(match[3]) }
}

export interface TraktHit {
    title?: string
    year?: number
    ids?: Record<string, unknown>
}

/** Melhor resultado da busca (PURO): título igual (e ano, se houver) vence; senão o 1º. */
export function pickSearchHit(results: { movie?: TraktHit; show?: TraktHit }[], title: string, year?: number): TraktHit | null {
    const wanted = title.toLowerCase().trim()
    const items: TraktHit[] = []
    for (const result of results) {
        const item = result.movie ?? result.show
        if (item) items.push(item)
    }
    const exact = items.find(item => item.title?.toLowerCase().trim() === wanted && (!year || item.year === year))
    return exact ?? items[0] ?? null
}

async function traktGet(path: string, clientId: string, access: string): Promise<unknown> {
    const response = await fetch(`${API}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': clientId,
            Authorization: `Bearer ${access}`,
        },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
}

async function traktPost(path: string, body: unknown, clientId: string, access: string): Promise<void> {
    const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': clientId,
            Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

/**
 * Marca como visto no Trakt (fire-and-forget do progress): busca o título,
 * pega o melhor match e adiciona ao histórico. false = não sincronizou
 * (desconectado, sem match, provedor com título fora do padrão…).
 */
export async function syncTraktWatched(kind: 'movie' | 'episode', title: string): Promise<boolean> {
    const token = await getToken()
    const { clientId } = await getTraktCreds()
    if (!token || !clientId) return false
    try {
        if (kind === 'movie') {
            const year = Number(/\((\d{4})\)/.exec(title)?.[1]) || undefined
            const clean = title.replace(/\s*\(\d{4}\)\s*/g, ' ').trim()
            if (!clean) return false
            const results = await traktGet(`/search/movie?query=${encodeURIComponent(clean)}`, clientId, token.access) as { movie?: TraktHit }[]
            const hit = pickSearchHit(results, clean, year)
            if (!hit?.ids) return false
            await traktPost('/sync/history', { movies: [{ ids: hit.ids }] }, clientId, token.access)
            return true
        }
        const parsed = parseEpisodeTitle(title)
        if (!parsed) return false
        const results = await traktGet(`/search/show?query=${encodeURIComponent(parsed.show)}`, clientId, token.access) as { show?: TraktHit }[]
        const hit = pickSearchHit(results, parsed.show)
        if (!hit?.ids) return false
        await traktPost('/sync/history', {
            shows: [{ ids: hit.ids, seasons: [{ number: parsed.season, episodes: [{ number: parsed.episode }] }] }],
        }, clientId, token.access)
        return true
    } catch {
        return false
    }
}

/** Só pra testes. */
export function resetTraktCache(): void {
    // Estado vive só no AsyncStorage — nada em módulo pra zerar (por enquanto).
}
