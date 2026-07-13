/**
 * "O que há de novo": na primeira abertura após um update, busca as notas da
 * release instalada no GitHub e mostra UMA vez (flag por versão). A limpeza
 * do markdown é PURA (testável).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const RELEASE_URL = 'https://api.github.com/repos/Rakjsu/NeoStream-Mobile/releases/tags/v'

/** Markdown das notas → texto simples legível num modal (PURO). */
export function cleanReleaseNotes(body: string): string {
    return body
        .replace(/^#+\s*/gm, '')
        .replace(/\*\*/g, '')
        .replace(/^\*\s*/gm, '• ')
        .replace(/ by @\S+ in \S+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** Notas da versão atual, uma vez só (null = já visto / sem rede / sem notas). */
export async function checkWhatsNew(version: string): Promise<{ version: string; notes: string } | null> {
    if (!version || version === '0.0.0') return null
    const flag = `neostream_whatsnew_${version}`
    try {
        if (await AsyncStorage.getItem(flag)) return null
        const response = await fetch(`${RELEASE_URL}${version}`)
        if (!response.ok) return null
        const data = await response.json() as { body?: string }
        await AsyncStorage.setItem(flag, '1')
        const notes = cleanReleaseNotes(String(data.body ?? ''))
        return notes ? { version, notes } : null
    } catch {
        return null
    }
}
