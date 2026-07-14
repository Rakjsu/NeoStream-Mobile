/**
 * Velocímetro do provedor: baixa um trecho REAL do primeiro canal e mede os
 * Mbps — responde "é a minha internet ou o provedor?". Parsers e veredito
 * são PUROS; só a medição toca a rede.
 */

/** Primeira URL de mídia de um m3u8 (resolve relativa contra a base). */
import AsyncStorage from '@react-native-async-storage/async-storage'

export function parseFirstSegment(m3u8: string, baseUrl: string): string {
    for (const raw of m3u8.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        try {
            return new URL(line, baseUrl).toString()
        } catch {
            return ''
        }
    }
    return ''
}

/** bytes/ms → Mbps (0 quando não dá pra medir). */
export function toMbps(bytes: number, elapsedMs: number): number {
    if (bytes <= 0 || elapsedMs <= 0) return 0
    return (bytes * 8) / (elapsedMs / 1000) / 1_000_000
}

export type SpeedVerdict = '4k' | 'hd' | 'sd' | 'slow'

/** Faixas conservadoras: 4K ~25 Mbps, HD ~8, SD ~3. */
export function speedVerdict(mbps: number): SpeedVerdict {
    if (mbps >= 25) return '4k'
    if (mbps >= 8) return 'hd'
    if (mbps >= 3) return 'sd'
    return 'slow'
}

export interface SpeedSample {
    at: number
    mbps: number
    verdict: SpeedVerdict
}

const HISTORY_KEY = 'neostream_speed_history'

/** Mais novo primeiro, teto fixo (PURO). */
export function pushSpeedSample(list: SpeedSample[], sample: SpeedSample, keep = 10): SpeedSample[] {
    return [sample, ...list].slice(0, keep)
}

export async function loadSpeedHistory(): Promise<SpeedSample[]> {
    try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY)
        const parsed = raw ? (JSON.parse(raw) as SpeedSample[]) : []
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export async function saveSpeedSample(sample: SpeedSample): Promise<void> {
    try {
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(pushSpeedSample(await loadSpeedHistory(), sample)))
    } catch { /* best-effort */ }
}

const MAX_MS = 6000

/** Baixa a URL (com teto de tempo) e mede; 0 = não deu (stream infinito etc.). */
async function measure(url: string): Promise<number> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MAX_MS)
    const start = Date.now()
    try {
        // Range corta streams infinitos em servidores que respeitam o header.
        const response = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-4194303' } })
        if (!response.ok && response.status !== 206) return 0
        const buffer = await response.arrayBuffer()
        return toMbps(buffer.byteLength, Date.now() - start)
    } catch {
        return 0
    } finally {
        clearTimeout(timer)
    }
}

/** HLS: playlist → (mestre → media) → primeiro segmento; senão a URL direta. */
export async function runSpeedTest(streamUrl: string): Promise<{ mbps: number; verdict: SpeedVerdict } | null> {
    let target = streamUrl
    if (/\.m3u8($|\?)/.test(streamUrl)) {
        try {
            const first = parseFirstSegment(await (await fetch(streamUrl)).text(), streamUrl)
            if (first && /\.m3u8($|\?)/.test(first)) {
                const second = parseFirstSegment(await (await fetch(first)).text(), first)
                if (second) target = second
            } else if (first) {
                target = first
            }
        } catch {
            return null
        }
    }
    const mbps = await measure(target)
    if (mbps <= 0) return null
    return { mbps: Math.round(mbps * 10) / 10, verdict: speedVerdict(mbps) }
}
