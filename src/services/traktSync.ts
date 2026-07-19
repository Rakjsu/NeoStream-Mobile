import { fetchTraktPlayback, fetchTraktWatchedEpisodes, fetchTraktWatchedMovies, parseEpisodeTitle, syncTraktWatched } from './trakt'
import { getEntry, isFinished, loadProgress, loadWatched, markWatched, progressPct, saveSample, type ProgressEntry } from './progress'
import { cachedFetch, getClient } from './session'

/**
 * 🔄 Sync inicial/total com o Trakt (regra do usuário: "maior progresso vence"):
 * - PUSH: filmes e episódios vistos localmente ANTES de conectar viram histórico
 *   no Trakt (só o que o Trakt ainda não tem — evita plays duplicados).
 * - PULL: vistos do Trakt (filmes E episódios) viram vistos locais; a união dos
 *   dois lados faz quem tem mais temporadas/eps completar o outro.
 * - PLAYBACK: tempos pausados do Trakt entram no continuar assistindo, mas só
 *   sobrescrevem o local quando o % do Trakt é MAIOR.
 * Roda ao conectar o Trakt e no botão manual dos Ajustes.
 */

// Tetos por rodada: o Trakt tem rate limit (~1 POST/s) e cada push resolve o id
// por busca — rodadas seguintes completam o que ficou de fora.
const PUSH_CAP = 30
const SHOW_CAP = 15

export interface TraktSyncReport {
    pushed: number
    pulledMovies: number
    pulledEpisodes: number
    playbackSeeded: number
}

/** Nome do provedor → chave de comparação (tira ano e espaços extras). */
export function cleanTitle(name: string): string {
    return name.replace(/\s*\(\d{4}\)\s*/g, ' ').trim().toLowerCase()
}

/** true quando o % do Trakt deve sobrescrever a entrada local (maior vence). */
export function traktWins(local: ProgressEntry | undefined, traktPct: number): boolean {
    if (!local) return true
    const localPct = local.fromTraktPct ? local.position : progressPct(local.position, local.duration)
    return traktPct > localPct
}

/** Chave única de episódio visto no Trakt pra deduplicar o push. */
export function episodeKey(show: string, season: number, episode: number): string {
    return `${cleanTitle(show)}|${season}|${episode}`
}

export async function runTraktInitialSync(): Promise<TraktSyncReport | null> {
    const client = await getClient()
    if (!client) return null
    const report: TraktSyncReport = { pushed: 0, pulledMovies: 0, pulledEpisodes: 0, playbackSeeded: 0 }

    const [traktMovies, traktEpisodes, vod, watched, progressMap] = await Promise.all([
        fetchTraktWatchedMovies(),
        fetchTraktWatchedEpisodes(),
        cachedFetch('vod', () => client.getVodMovies()).catch(() => []),
        loadWatched(),
        loadProgress(),
    ])
    const traktMovieSet = new Set(traktMovies.map(cleanTitle))
    const traktEpisodeSet = new Set(traktEpisodes.map(e => episodeKey(e.show, e.season, e.episode)))

    // ---- PUSH: o que era visto só aqui vai pro Trakt ----
    let pushBudget = PUSH_CAP
    for (const movie of vod) {
        if (pushBudget <= 0) break
        if (!watched.has(`movie:${movie.stream_id}`)) continue
        if (traktMovieSet.has(cleanTitle(movie.name))) continue
        if (await syncTraktWatched('movie', movie.name)) {
            report.pushed++
            pushBudget--
        }
    }
    for (const entry of Object.values(progressMap)) {
        if (pushBudget <= 0) break
        if (entry.kind !== 'episode' || !isFinished(entry.position, entry.duration)) continue
        const parsed = parseEpisodeTitle(entry.title)
        if (!parsed || traktEpisodeSet.has(episodeKey(parsed.show, parsed.season, parsed.episode))) continue
        if (await syncTraktWatched('episode', entry.title)) {
            report.pushed++
            pushBudget--
        }
    }

    // ---- PULL: filmes vistos no Trakt viram vistos locais ----
    for (const movie of vod) {
        const clean = cleanTitle(movie.name)
        if (!traktMovieSet.has(clean) && !traktMovieSet.has(movie.name.toLowerCase().trim())) continue
        const id = `movie:${movie.stream_id}`
        if (watched.has(id)) continue
        await markWatched(id)
        watched.add(id)
        report.pulledMovies++
    }

    // ---- PULL: episódios vistos no Trakt (por série, com teto) ----
    if (traktEpisodes.length > 0) {
        const seriesList = await cachedFetch('series', () => client.getSeries()).catch(() => [])
        const byShow = new Map<string, { season: number; episode: number }[]>()
        for (const ep of traktEpisodes) {
            const key = cleanTitle(ep.show)
            const list = byShow.get(key) ?? []
            list.push({ season: ep.season, episode: ep.episode })
            byShow.set(key, list)
        }
        let showBudget = SHOW_CAP
        for (const [showName, eps] of byShow) {
            if (showBudget <= 0) break
            const show = seriesList.find(s => cleanTitle(s.name) === showName || s.name.toLowerCase().includes(showName))
            if (!show) continue
            showBudget--
            try {
                const info = await client.getSeriesInfo(String(show.series_id))
                for (const ep of eps) {
                    const episodes = info.episodes?.[String(ep.season)] ?? []
                    const found = episodes.find(e => Number(e.episode_num) === ep.episode)
                    if (!found) continue
                    const id = `episode:${found.id}`
                    if (watched.has(id)) continue
                    await markWatched(id)
                    watched.add(id)
                    report.pulledEpisodes++
                }
            } catch { /* ficha indisponível — fica pra próxima rodada */ }
        }
    }

    // ---- PLAYBACK: tempos do Trakt, maior progresso vence ----
    const paused = await fetchTraktPlayback().catch(() => [] as Awaited<ReturnType<typeof fetchTraktPlayback>>)
    for (const item of paused) {
        const wanted = item.title.toLowerCase()
        if (item.kind === 'movie') {
            const movie = vod.find(m => m.name.toLowerCase().includes(wanted))
            if (!movie) continue
            const progressId = `movie:${movie.stream_id}`
            const local = await getEntry(progressId)
            if (!traktWins(local ?? undefined, item.progress)) continue
            await saveSample({
                id: progressId,
                kind: 'movie',
                streamId: String(movie.stream_id),
                container: movie.container_extension || 'mp4',
                title: movie.name,
                cover: movie.stream_icon || '',
                position: item.progress,
                duration: 100,
                updatedAt: item.pausedAtMs,
                fromTraktPct: true,
            })
            report.playbackSeeded++
        }
        // Episódios pausados seguem entrando pelo Início (home), que usa a
        // mesma regra traktWins — aqui só os filmes pra não custar uma ficha
        // de série por item logo na conexão.
    }

    return report
}
