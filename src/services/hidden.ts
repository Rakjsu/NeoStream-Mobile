/**
 * Canais ocultos (curadoria da lista): blacklist por conta, filtrada na aba
 * TV, na busca e no "Agora na TV". Guarda id + nome pra tela de restauração
 * fazer sentido mesmo se o canal sumir da lista do provedor.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getActiveAccountId } from './session'

export interface HiddenChannel {
    id: string
    name: string
}

function storageKey(accountId: string): string {
    return `neostream_hidden_${accountId}`
}

export async function listHiddenChannels(): Promise<HiddenChannel[]> {
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const raw = await AsyncStorage.getItem(storageKey(accountId))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(parsed)
            ? parsed.filter((c): c is HiddenChannel => !!c && typeof (c as HiddenChannel).id === 'string')
            : []
    } catch {
        return []
    }
}

export async function hiddenIdSet(): Promise<Set<string>> {
    return new Set((await listHiddenChannels()).map(channel => channel.id))
}

async function persist(list: HiddenChannel[]): Promise<void> {
    const accountId = await getActiveAccountId()
    if (!accountId) return
    try {
        await AsyncStorage.setItem(storageKey(accountId), JSON.stringify(list))
    } catch { /* best-effort */ }
}

export async function hideChannel(channel: HiddenChannel): Promise<void> {
    const list = await listHiddenChannels()
    if (list.some(item => item.id === channel.id)) return
    await persist([...list, channel])
}

export async function unhideChannel(id: string): Promise<void> {
    await persist((await listHiddenChannels()).filter(item => item.id !== id))
}
