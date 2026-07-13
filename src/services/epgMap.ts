/**
 * Correção manual de EPG (port do epgMappingsService do desktop): canal M3U
 * cujo nome não casa com o XMLTV ganha um override channelId → id do guia.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'neostream_epg_overrides'

export async function loadEpgOverrides(): Promise<Record<string, string>> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function setEpgOverride(channelId: string, guideId: string): Promise<void> {
    const map = await loadEpgOverrides()
    map[channelId] = guideId
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch { /* best-effort */ }
}
