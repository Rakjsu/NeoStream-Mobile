/**
 * Toques hápticos sutis nas ações-chave (favoritar, marcar visto, zapear).
 * Best-effort: aparelho sem vibração ou API indisponível apenas ignora.
 */
import * as Haptics from 'expo-haptics'

export function tapLight(): void {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
}

export function tapSuccess(): void {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
}
