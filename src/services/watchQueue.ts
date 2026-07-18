/**
 * Fila de reprodução de VODs: o usuário monta a fila nas fichas
 * ("➕ Adicionar à fila") e o player emenda um filme no outro ao terminar,
 * com o mesmo overlay "A seguir" dos episódios. Estado de módulo, igual ao
 * episodeQueue — morre com o app, não persiste.
 */

export interface QueuedVod {
    /** buildProgressId('movie', id) — casa com o pid que o player recebe. */
    pid: string
    /** stream id do filme (pra montar a URL). */
    sid: string
    container: string
    title: string
    cover: string
}

let queue: QueuedVod[] = []

/** Adiciona (dedupe por pid) e retorna o tamanho atual da fila. */
export function addToWatchQueue(item: QueuedVod): number {
    if (!queue.some(entry => entry.pid === item.pid)) queue = [...queue, item]
    return queue.length
}

export function clearWatchQueue(): void {
    queue = []
}

export function watchQueueSize(): number {
    return queue.length
}

/**
 * Próximo VOD depois do pid dado. Um filme que NÃO está na fila encadeia no
 * primeiro item — dar play em qualquer filme "liga" a fila montada.
 */
export function nextVodAfter(pid: string): QueuedVod | null {
    if (queue.length === 0) return null
    const index = queue.findIndex(entry => entry.pid === pid)
    if (index === -1) return queue[0]
    return index + 1 < queue.length ? queue[index + 1] : null
}
