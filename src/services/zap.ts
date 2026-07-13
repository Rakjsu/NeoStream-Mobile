/**
 * Contexto de zapping: a lista de canais da tela de onde o player ao vivo foi
 * aberto, pra ⏮/⏭ trocar de canal sem voltar. Vive só em memória (por sessão);
 * o cálculo do vizinho é PURO (testável).
 */

export interface ZapChannel {
    id: string
    name: string
    /** Número real do canal no provedor (campo num do Xtream). */
    num?: number | string
}

/** Índice vizinho com volta (último → primeiro, como zapping de TV). */
export function wrapIndex(length: number, index: number, delta: number): number {
    if (length <= 0) return -1
    return ((index + delta) % length + length) % length
}

let list: ZapChannel[] = []
let index = -1

/** Chamado por quem abre o player: a lista FILTRADA da tela + o canal tocado. */
export function setZapContext(channels: ZapChannel[], currentId: string): void {
    list = channels
    index = channels.findIndex(c => c.id === currentId)
}

export function hasZapContext(): boolean {
    return index >= 0 && list.length > 1
}

/** Anda `delta` canais (com volta) e devolve o novo canal. */
export function zapBy(delta: number): ZapChannel | null {
    if (!hasZapContext()) return null
    index = wrapIndex(list.length, index, delta)
    return list[index] ?? null
}

/**
 * Ordena a gaveta: favoritos primeiro, depois recentes (na ordem de uso),
 * resto na ordem original (sort estável) — PURO.
 */
export function rankChannels(channels: ZapChannel[], favorites: Set<string>, recents: string[]): ZapChannel[] {
    const recentRank = new Map(recents.map((id, position) => [id, position]))
    return [...channels].sort((a, b) => {
        const aFav = favorites.has(a.id) ? 0 : 1
        const bFav = favorites.has(b.id) ? 0 : 1
        if (aFav !== bFav) return aFav - bFav
        const aRecent = recentRank.get(a.id) ?? Number.POSITIVE_INFINITY
        const bRecent = recentRank.get(b.id) ?? Number.POSITIVE_INFINITY
        return aRecent - bRecent
    })
}

/** A lista inteira do contexto (gaveta de canais do player). */
export function zapList(): ZapChannel[] {
    return list
}

/** Canal atual do contexto (null sem contexto). */
export function currentZapChannel(): ZapChannel | null {
    return index >= 0 ? list[index] ?? null : null
}

/** Espia o vizinho SEM trocar (preview do long-press no zap). */
export function peekZap(delta: number): ZapChannel | null {
    if (!hasZapContext()) return null
    return list[wrapIndex(list.length, index, delta)] ?? null
}

/** Canal na posição `n` (1-based, como número de canal de TV); null fora. */
export function zapToNumber(n: number): ZapChannel | null {
    if (!Number.isInteger(n) || n < 1) return null
    // Número REAL do provedor tem prioridade; sem match, vale a posição na lista.
    const real = list.findIndex(c => Number(c.num) === n)
    if (real >= 0) {
        index = real
        return list[real] ?? null
    }
    if (n > list.length) return null
    index = n - 1
    return list[index] ?? null
}

/** Posição 1-based de um canal na lista (0 = fora da lista). */
export function channelNumber(id: string): number {
    const position = list.findIndex(c => c.id === id)
    const real = position >= 0 ? Number(list[position]?.num) : NaN
    if (Number.isFinite(real) && real > 0) return real
    return position + 1
}

/** Pula direto pra um canal da lista (gaveta) e devolve ele. */
export function zapTo(id: string): ZapChannel | null {
    const target = list.findIndex(c => c.id === id)
    if (target < 0) return null
    index = target
    return list[target] ?? null
}

export function clearZapContext(): void {
    list = []
    index = -1
}
