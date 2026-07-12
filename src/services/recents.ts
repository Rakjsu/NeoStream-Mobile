/**
 * Canais assistidos há pouco (por conta): alimenta o rail "recentes" do
 * Início. A ordenação é PURA (testável); load/save tocam o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getActiveAccountId } from './session'

export interface RecentChannel {
    id: string
    name: string
    logo: string
}

const MAX_RECENTS = 15

function storageKey(accountId: string): string {
    return `neostream_recents_${accountId}`
}

/**
 * Põe o canal no topo, sem duplicar e sem passar do teto. Se a entrada nova
 * vier sem logo (ex.: zapping), preserva o logo que já se conhecia.
 */
export function pushRecent(list: RecentChannel[], channel: RecentChannel, max = MAX_RECENTS): RecentChannel[] {
    const previous = list.find(item => item.id === channel.id)
    const merged: RecentChannel = {
        ...channel,
        logo: channel.logo || previous?.logo || '',
        name: channel.name || previous?.name || '',
    }
    return [merged, ...list.filter(item => item.id !== channel.id)].slice(0, max)
}

export async function listRecentChannels(): Promise<RecentChannel[]> {
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const raw = await AsyncStorage.getItem(storageKey(accountId))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((c): c is RecentChannel => !!c && typeof (c as RecentChannel).id === 'string')
            : []
    } catch {
        return []
    }
}

/** Chamado por quem dá o play num canal (abas, busca, zapping). */
export async function recordRecentChannel(channel: RecentChannel): Promise<void> {
    const accountId = await getActiveAccountId()
    if (!accountId) return
    try {
        const list = pushRecent(await listRecentChannels(), channel)
        await AsyncStorage.setItem(storageKey(accountId), JSON.stringify(list))
    } catch { /* best-effort */ }
}
