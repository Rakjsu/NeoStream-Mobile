// 📱 Item 39: QR do desktop → params do player. O deep link
// neostream://open-content traz kind/sid/container/name/pos e o app
// resolve a URL do stream com a conta DELE. PURO (validação de entrada).
export interface HandoffPlayerParams {
    /** kind do player mobile ('movie' | 'episode'). */
    kind: 'movie' | 'episode'
    sid: string
    container: string
    title: string
    /** Id de progresso ("movie:<sid>" / "episode:<sid>") — retomar/continuar. */
    pid: string
    /** Posição inicial em segundos (0 = do começo). */
    startAt: number
}

const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? ''

export function handoffToPlayerParams(raw: {
    kind?: string | string[]
    sid?: string | string[]
    container?: string | string[]
    name?: string | string[]
    pos?: string | string[]
}): HandoffPlayerParams | null {
    const linkKind = first(raw.kind)
    if (linkKind !== 'movie' && linkKind !== 'series') return null
    const sid = first(raw.sid).trim()
    if (!sid) return null
    const kind = linkKind === 'series' ? 'episode' : 'movie'
    const startAt = Math.max(0, Math.floor(Number(first(raw.pos)) || 0))
    return {
        kind,
        sid,
        container: first(raw.container).trim() || 'mp4',
        title: first(raw.name).slice(0, 200),
        pid: `${kind}:${sid}`,
        startAt,
    }
}
