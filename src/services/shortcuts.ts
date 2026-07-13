/**
 * Atalhos do ícone do app (segurar o ícone no launcher): Continuar · TV ao
 * vivo · Downloads. Módulo nativo (expo-quick-actions) — não existe no Expo
 * Go, então o require é lazy e tudo é best-effort, igual ao cast.
 */
import { t } from '../i18n/strings'

interface QuickAction {
    id: string
    title: string
    params?: Record<string, string>
}

interface QuickActionsApi {
    setItems(items: QuickAction[]): Promise<void>
    addListener(handler: (action: QuickAction | null) => void): { remove(): void }
    initial?: QuickAction | null
}

let api: QuickActionsApi | null = null
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-quick-actions') as QuickActionsApi & { QuickActions?: QuickActionsApi; default?: QuickActionsApi }
    const candidate = mod?.QuickActions ?? mod?.default ?? mod
    api = typeof candidate?.setItems === 'function' ? candidate : null
} catch {
    api = null // Expo Go / plataforma sem suporte
}

/** Itens padrão + (opcional) o "Continuar {título}" dinâmico na frente. */
function buildItems(continueItem?: QuickAction): QuickAction[] {
    return [
        continueItem ?? { id: 'continue', title: t('continueRail'), params: { href: '/(tabs)/home' } },
        { id: 'live', title: t('tabLive'), params: { href: '/(tabs)/live' } },
        { id: 'downloads', title: t('downloadsTitle'), params: { href: '/downloads' } },
    ]
}

/**
 * Atualiza o atalho "Continuar" com o último assistido: filme abre a ficha
 * (com botão de retomar), episódio abre o Início (rail Continuar no topo).
 */
export function updateContinueShortcut(entry: {
    kind: string; streamId: string; title: string; container: string; cover: string
} | null): void {
    if (!api) return
    const dynamic: QuickAction | undefined = entry ? {
        id: 'continue',
        title: `▶ ${entry.title}`,
        params: {
            href: entry.kind === 'movie'
                ? `/movie/${entry.streamId}?name=${encodeURIComponent(entry.title)}&container=${encodeURIComponent(entry.container || 'mp4')}&cover=${encodeURIComponent(entry.cover || '')}`
                : '/(tabs)/home',
        },
    } : undefined
    try {
        void api.setItems(buildItems(dynamic)).catch(() => undefined)
    } catch { /* best-effort */ }
}

/** Registra os atalhos e roteia o toque (inclusive o que abriu o app frio). */
export function setupShortcuts(onRoute: (href: string) => void): () => void {
    if (!api) return () => undefined
    try {
        void api.setItems(buildItems()).catch(() => undefined)
        const route = (action: QuickAction | null) => {
            const href = action?.params?.href
            if (typeof href === 'string' && href) onRoute(href)
        }
        const sub = api.addListener(route)
        if (api.initial) route(api.initial)
        return () => sub.remove()
    } catch {
        return () => undefined
    }
}
