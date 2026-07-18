/**
 * Legendas externas via OpenSubtitles (API v2) com credenciais DO USUÁRIO
 * (Ajustes → APIs) — mesmo modelo do desktop: nada embutido no app.
 * Sem Api-Key salva, o botão nem aparece no player. O parser de SRT e o
 * seletor de cue são PUROS (testáveis sem rede).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY_STORAGE = 'neostream_os_key'
const USER_STORAGE = 'neostream_os_user'
const PASS_STORAGE = 'neostream_os_pass'
const API = 'https://api.opensubtitles.com/api/v1'
const UA = 'NeoStream Mobile v1.0'

export interface OsCredentials {
    apiKey: string
    username: string
    password: string
}

let cache: OsCredentials | null = null
let token: string | null = null

export async function getOsCredentials(): Promise<OsCredentials> {
    if (cache) return cache
    try {
        const [apiKey, username, password] = await Promise.all([
            AsyncStorage.getItem(KEY_STORAGE),
            AsyncStorage.getItem(USER_STORAGE),
            AsyncStorage.getItem(PASS_STORAGE),
        ])
        cache = { apiKey: apiKey ?? '', username: username ?? '', password: password ?? '' }
    } catch {
        cache = { apiKey: '', username: '', password: '' }
    }
    return cache
}

export async function setOsCredentials(creds: OsCredentials): Promise<void> {
    cache = { apiKey: creds.apiKey.trim(), username: creds.username.trim(), password: creds.password }
    token = null
    const save = async (key: string, value: string) => {
        if (value) await AsyncStorage.setItem(key, value)
        else await AsyncStorage.removeItem(key)
    }
    try {
        await Promise.all([
            save(KEY_STORAGE, cache.apiKey),
            save(USER_STORAGE, cache.username),
            save(PASS_STORAGE, cache.password),
        ])
    } catch { /* best-effort */ }
}

export async function hasOsKey(): Promise<boolean> {
    return !!(await getOsCredentials()).apiKey
}

/** Só pra testes. */
export function resetOsCacheForTests(): void {
    cache = null
    token = null
}

// ---------------------------------------------------------------------------
// SRT (PURO)
// ---------------------------------------------------------------------------

export interface SubtitleCue {
    startMs: number
    endMs: number
    text: string
}

/** "HH:MM:SS,mmm" (ou com ponto) → milissegundos. NaN vira 0. */
export function srtTimeToMs(time: string): number {
    const m = time.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/)
    if (!m) return 0
    return Number(m[1]) * 3600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4].padEnd(3, '0'))
}

/** SRT → cues ordenados; blocos malformados são pulados e tags HTML caem. */
export function parseSrt(srt: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    for (const block of srt.replace(/\r/g, '').split(/\n\n+/)) {
        const lines = block.split('\n').filter(line => line.trim().length > 0)
        const timeLine = lines.find(line => line.includes('-->'))
        if (!timeLine) continue
        const m = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{1,3})/)
        if (!m) continue
        const text = lines
            .slice(lines.indexOf(timeLine) + 1)
            .join('\n')
            .replace(/<[^>]+>/g, '')
            .trim()
        if (!text) continue
        cues.push({ startMs: srtTimeToMs(m[1]), endMs: srtTimeToMs(m[2]), text })
    }
    return cues.sort((a, b) => a.startMs - b.startMs)
}

/** Texto visível no instante dado (cues ordenados) — null fora de qualquer cue. */
export function cueAt(cues: SubtitleCue[], positionMs: number): string | null {
    for (const cue of cues) {
        if (positionMs < cue.startMs) break
        if (positionMs <= cue.endMs) return cue.text
    }
    return null
}

// ---------------------------------------------------------------------------
// API v2: busca → login (token pro download) → download → parse
// ---------------------------------------------------------------------------

async function login(creds: OsCredentials): Promise<string | null> {
    if (token) return token
    if (!creds.username || !creds.password) return null
    try {
        const response = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Api-Key': creds.apiKey, 'Content-Type': 'application/json', 'User-Agent': UA },
            body: JSON.stringify({ username: creds.username, password: creds.password }),
        })
        if (!response.ok) return null
        const data = await response.json() as { token?: string }
        token = data.token ?? null
        return token
    } catch {
        return null
    }
}

/** Busca a melhor legenda pro título e devolve os cues prontos (ou null). */
export async function fetchSrtForTitle(title: string, lang: string): Promise<SubtitleCue[] | null> {
    const creds = await getOsCredentials()
    if (!creds.apiKey || !title.trim()) return null
    try {
        const clean = title
            .replace(/\s*\(\d{4}\)\s*/g, ' ')
            .replace(/\s*\[.*?\]\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        const search = await fetch(
            `${API}/subtitles?query=${encodeURIComponent(clean)}&languages=${encodeURIComponent(lang)}`,
            { headers: { 'Api-Key': creds.apiKey, 'User-Agent': UA } },
        )
        if (!search.ok) return null
        const data = await search.json() as {
            data?: { attributes?: { files?: { file_id?: number }[] } }[]
        }
        const fileId = data.data?.[0]?.attributes?.files?.[0]?.file_id
        if (!fileId) return null

        const authToken = await login(creds)
        const headers: Record<string, string> = {
            'Api-Key': creds.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': UA,
        }
        if (authToken) headers.Authorization = `Bearer ${authToken}`
        const download = await fetch(`${API}/download`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ file_id: fileId }),
        })
        if (!download.ok) return null
        const { link } = await download.json() as { link?: string }
        if (!link) return null

        const srt = await (await fetch(link)).text()
        const cues = parseSrt(srt)
        return cues.length > 0 ? cues : null
    } catch {
        return null
    }
}
