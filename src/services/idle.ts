/**
 * Atividade do usuário: todo toque/foco passa pelo TvTouchable, que pinga
 * aqui — o protetor de tela da TV dispara quando ninguém mexe há um tempo.
 */
let lastActivity = Date.now()

export function pingActivity(): void {
    lastActivity = Date.now()
}

/** Minutos desde a última interação (`now` injetável pra teste). */
export function idleMinutes(now = Date.now()): number {
    return Math.max(0, (now - lastActivity) / 60_000)
}
