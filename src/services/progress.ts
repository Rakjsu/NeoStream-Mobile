/**
 * "Continuar assistindo": posição de reprodução por filme/episódio, salva no
 * aparelho. Helpers de decisão são PUROS (testáveis); só load/save tocam o
 * AsyncStorage. Espelha o conceito do watchProgress do NeoStream desktop.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ProgressKind = 'movie' | 'episode'

export interface ProgressEntry {
    /** "movie:<streamId>" | "episode:<episodeId>" (ver buildProgressId). */
    id: string
    kind: ProgressKind
    /** stream_id do filme ou id do episódio — reconstrói a URL no resume. */
    streamId: string
    container: string
    title: string
    cover: string
    /** Segundos assistidos / duração total. */
    position: number
    duration: number
    updatedAt: number
}

const STORAGE_KEY = 'neostream_progress'
/** Guardamos só os mais recentes — o rail não precisa de história infinita. */
export const MAX_ENTRIES = 30
/** Menos que isso assistido nem vale salvar (zapping de VOD). */
export const MIN_POSITION_S = 30
/** A partir daqui o item conta como terminado e sai do rail. */
export const FINISHED_RATIO = 0.95
/** Retomar só faz sentido com folga antes do fim. */
export const RESUME_MIN_S = 30

export function buildProgressId(kind: ProgressKind, streamId: string | number): string {
    return `${kind}:${streamId}`
}

export function isFinished(position: number, duration: number): boolean {
    return duration > 0 && position / duration >= FINISHED_RATIO
}

export function progressPct(position: number, duration: number): number {
    if (duration <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((position / duration) * 100)))
}

/** Posição pra retomar, ou 0 quando não vale a pena (início/fim do vídeo). */
export function resumePosition(entry: Pick<ProgressEntry, 'position' | 'duration'> | undefined): number {
    if (!entry) return 0
    if (entry.position < MIN_POSITION_S) return 0
    if (entry.duration > 0 && entry.duration - entry.position < RESUME_MIN_S) return 0
    return entry.position
}

/**
 * Aplica uma amostra de posição ao mapa (PURO). Terminou → remove; muito no
 * início → ignora; senão grava e poda pros MAX_ENTRIES mais recentes.
 */
export function applySample(
    map: Record<string, ProgressEntry>,
    entry: ProgressEntry,
    maxEntries: number = MAX_ENTRIES,
): Record<string, ProgressEntry> {
    const next = { ...map }
    if (isFinished(entry.position, entry.duration)) {
        delete next[entry.id]
        return next
    }
    if (entry.position < MIN_POSITION_S) return next
    next[entry.id] = entry
    const ids = Object.keys(next).sort((a, b) => next[b].updatedAt - next[a].updatedAt)
    for (const id of ids.slice(maxEntries)) delete next[id]
    return next
}

/** Rail "Continuar assistindo": mais recente primeiro, opcionalmente por tipo. */
export function listContinue(map: Record<string, ProgressEntry>, kind?: ProgressKind): ProgressEntry[] {
    return Object.values(map)
        .filter(e => (kind ? e.kind === kind : true))
        .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Próximo episódio a assistir numa lista ORDENADA: o que está no meio
 * (mais recente) ganha; senão o primeiro ainda não visto; tudo visto → null.
 */
export function pickNextEpisode<T extends { id: string | number }>(
    episodes: T[],
    watched: Set<string>,
    progress: Record<string, ProgressEntry>,
): T | null {
    let inProgress: T | null = null
    let latest = -1
    for (const ep of episodes) {
        const entry = progress[buildProgressId('episode', ep.id)]
        if (entry && entry.updatedAt > latest) {
            inProgress = ep
            latest = entry.updatedAt
        }
    }
    if (inProgress) return inProgress
    return episodes.find(ep => !watched.has(buildProgressId('episode', ep.id))) ?? null
}

// ------------------------------------------------------------- persistência --

let cache: Record<string, ProgressEntry> | null = null

export async function loadProgress(): Promise<Record<string, ProgressEntry>> {
    if (cache) return cache
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Record<string, ProgressEntry>) : {}
        cache = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        cache = {}
    }
    return cache
}

export async function saveSample(entry: ProgressEntry): Promise<void> {
    const map = await loadProgress()
    // Terminou (>=95%): sai do rail mas entra no histórico de vistos (✓).
    if (isFinished(entry.position, entry.duration)) await markWatched(entry.id)
    cache = applySample(map, entry)
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* melhor perder uma amostra que travar o player */ }
}

export async function getEntry(id: string): Promise<ProgressEntry | undefined> {
    return (await loadProgress())[id]
}

export async function removeEntry(id: string): Promise<void> {
    const map = await loadProgress()
    if (!(id in map)) return
    cache = { ...map }
    delete cache[id]
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch { /* best-effort */ }
}

// -------------------------------------------------------- vistos (✓ na série) --

const WATCHED_KEY = 'neostream_watched'
let watchedCache: Set<string> | null = null

export async function loadWatched(): Promise<Set<string>> {
    if (watchedCache) return watchedCache
    try {
        const raw = await AsyncStorage.getItem(WATCHED_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        watchedCache = new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
    } catch {
        watchedCache = new Set()
    }
    return watchedCache
}

export async function markWatched(id: string): Promise<void> {
    const set = await loadWatched()
    if (set.has(id)) return
    set.add(id)
    try {
        await AsyncStorage.setItem(WATCHED_KEY, JSON.stringify([...set]))
    } catch { /* best-effort */ }
}

/** Restauração de backup: substitui progresso e vistos. */
export async function restoreProgress(map: Record<string, ProgressEntry>, watched: string[]): Promise<void> {
    cache = map && typeof map === 'object' ? map : {}
    watchedCache = new Set(Array.isArray(watched) ? watched.filter((x): x is string => typeof x === 'string') : [])
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
        await AsyncStorage.setItem(WATCHED_KEY, JSON.stringify([...watchedCache]))
    } catch { /* best-effort */ }
}

/** Só pra testes/logout. */
export function resetProgressCache(): void {
    cache = null
    watchedCache = null
}
