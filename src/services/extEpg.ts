/**
 * EPG externo (XMLTV por URL): sobrepõe o guia de QUALQUER conta quando o do
 * provedor é fraco ou vazio. O XML é baixado uma vez por sessão (lazy) e o
 * casamento é por NOME de canal normalizado — o guia do provedor continua
 * valendo pros canais que o externo não tem.
 *
 * A aplicação é por MUTAÇÃO dos métodos do client (não wrapper): preserva a
 * identidade da instância, então `instanceof M3uClient/StalkerClient` e os
 * métodos extras (searchGuide, epgCoverage, resolveStalkerUrl) seguem vivos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CatalogClient } from './xtream'
import { lookupDaySchedule, lookupNowNext, parseXmltv, type XmltvGuide } from './xmltv'

const URL_KEY = 'neostream_ext_epg_url'

let cachedUrl: string | null = null
let guidePromise: Promise<XmltvGuide | null> | null = null

export async function getExtEpgUrl(): Promise<string> {
    if (cachedUrl !== null) return cachedUrl
    try {
        cachedUrl = (await AsyncStorage.getItem(URL_KEY)) ?? ''
    } catch {
        cachedUrl = ''
    }
    return cachedUrl
}

export async function setExtEpgUrl(url: string): Promise<void> {
    cachedUrl = url.trim()
    guidePromise = null // URL nova = guia novo na próxima consulta
    try {
        if (cachedUrl) await AsyncStorage.setItem(URL_KEY, cachedUrl)
        else await AsyncStorage.removeItem(URL_KEY)
    } catch { /* best-effort */ }
}

async function loadExtGuide(): Promise<XmltvGuide | null> {
    const url = await getExtEpgUrl()
    if (!url) return null
    guidePromise ??= (async () => {
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 30000)
            try {
                const response = await fetch(url, { signal: controller.signal })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const xml = await response.text()
                // Mesma guarda de tamanho do XMLTV das listas M3U.
                if (xml.length > 40_000_000) return null
                return parseXmltv(xml, Date.now())
            } finally {
                clearTimeout(timer)
            }
        } catch {
            return null
        }
    })()
    return guidePromise
}

/**
 * Sobrepõe agora/a seguir e grade do client com o XMLTV externo (quando a URL
 * está configurada e o canal casa por nome). Sem URL, tudo passa reto.
 */
export function applyExternalEpg(client: CatalogClient): void {
    const origShort = client.getShortEpg.bind(client)
    const origDay = client.getDaySchedule?.bind(client)

    // id → nome dos canais, resolvido UMA vez por client (lazy).
    let namesPromise: Promise<Map<string, string>> | null = null
    const nameOf = async (streamId: number | string): Promise<string> => {
        namesPromise ??= client.getLiveChannels()
            .then(channels => new Map(channels.map(c => [String(c.stream_id), c.name])))
            .catch(() => new Map<string, string>())
        return (await namesPromise).get(String(streamId)) ?? ''
    }

    client.getShortEpg = async streamId => {
        const guide = await loadExtGuide()
        if (guide) {
            const name = await nameOf(streamId)
            if (name) {
                const hit = lookupNowNext(guide, '', name)
                if (hit.now || hit.next) return hit
            }
        }
        return origShort(streamId)
    }

    client.getDaySchedule = async streamId => {
        const guide = await loadExtGuide()
        if (guide) {
            const name = await nameOf(streamId)
            if (name) {
                const programs = lookupDaySchedule(guide, '', name)
                if (programs.length > 0) return programs
            }
        }
        return (await origDay?.(streamId)) ?? []
    }
}

/** Só pra testes. */
export function resetExtEpgCache(): void {
    cachedUrl = null
    guidePromise = null
}
