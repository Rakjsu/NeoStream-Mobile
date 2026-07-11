/**
 * Fila de episódios da série aberta — alimenta o autoplay do player.
 *
 * A tela da série grava a fila (na ordem das temporadas) antes de abrir o
 * player; quando um episódio termina, o player pergunta "qual vem depois
 * deste pid?" e emenda. Estado de módulo, igual ao zap: morre com o app,
 * não persiste.
 */

export interface QueuedEpisode {
    /** buildProgressId('episode', id) — casa com o pid que o player recebe. */
    pid: string
    /** stream id do episódio (pra montar a URL). */
    sid: string
    container: string
    /** "Série · Título do ep", pronto pro player e pro Continuar. */
    title: string
    cover: string
}

let queue: QueuedEpisode[] = []

/** Índice do item seguinte, sem dar a volta — null no fim (ou fora) da lista. */
export function nextIndex(index: number, length: number): number | null {
    if (index < 0 || index + 1 >= length) return null
    return index + 1
}

export function setEpisodeQueue(episodes: QueuedEpisode[]): void {
    queue = episodes
}

export function clearEpisodeQueue(): void {
    queue = []
}

/** Próximo episódio depois do pid dado — null se não há fila, pid desconhecido ou último. */
export function nextEpisodeAfter(pid: string): QueuedEpisode | null {
    const index = queue.findIndex(episode => episode.pid === pid)
    const next = nextIndex(index, queue.length)
    return next === null ? null : queue[next]
}
