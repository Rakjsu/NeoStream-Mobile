/**
 * Versões do mesmo filme ("Filme 4K", "Filme [L]", "Filme FHD"…) agrupadas
 * numa ficha só — port do movieVersionService do NeoStream desktop, com os
 * marcadores extras que aparecem em listas BR (LEG/LEGENDADO/DUB). PURO.
 */

export interface MovieLike {
    name: string
    stream_id: string | number
}

export interface MovieVersion<TMovie extends MovieLike> {
    movie: TMovie
    label: string
}

const SUBTITLED_RE = /\[L\]|\bleg(endado)?\b/i
const FOUR_K_RE = /\b4k\b/i

/** Rótulo curto da versão pro seletor da ficha. */
export function versionLabel(name: string): string {
    const quality = FOUR_K_RE.test(name) ? '4K' : 'FHD'
    const audio = SUBTITLED_RE.test(name) ? 'Legendado' : 'Dublado'
    return `${quality} ${audio}`
}

/** Nome-base comparável: fora marcadores, ano, colchetes e pontuação. */
export function movieBaseName(name: string): string {
    return name
        .replace(/\s*\[.*?\]\s*/g, ' ')
        .replace(/\b(4k|fhd|hd|uhd|leg(endado)?|dub(lado)?)\b/gi, ' ')
        .replace(/\s*\(\d{4}\)\s*/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** Números de sequência ("Velozes 9", "Matrix II") — precisam bater. */
function sequelNumbers(name: string): string {
    const clean = name.replace(/\s*\(\d{4}\)\s*/g, '')
    const numbers: string[] = []
    for (const match of clean.match(/\b(\d{1,2})\b/g) ?? []) {
        const value = Number(match)
        if (value >= 1 && value <= 20) numbers.push(match)
    }
    for (const roman of clean.match(/\b(II|III|IV|V|VI|VII|VIII|IX|X)\b/gi) ?? []) {
        numbers.push(roman.toUpperCase())
    }
    return numbers.sort().join(',')
}

/** Mesmo filme em versões diferentes? (regras estritas do desktop) */
export function isSameMovie(name1: string, name2: string): boolean {
    const base1 = movieBaseName(name1)
    const base2 = movieBaseName(name2)
    if (!base1 || !base2) return false
    if (sequelNumbers(name1) !== sequelNumbers(name2)) return false
    if (base1 === base2) return true
    const min = Math.min(base1.length, base2.length)
    const max = Math.max(base1.length, base2.length)
    if (min < 8) return false
    if (base1.includes(base2) || base2.includes(base1)) return min / max >= 0.9
    return false
}

/** Todas as versões do filme no catálogo, dedup por rótulo, ordenadas. */
export function findMovieVersions<TMovie extends MovieLike>(current: TMovie, all: TMovie[]): MovieVersion<TMovie>[] {
    if (!current.name) return []
    const order = ['FHD Dublado', 'FHD Legendado', '4K Dublado', '4K Legendado']
    const seen = new Set<string>()
    return all
        .filter(movie => movie.name && isSameMovie(movie.name, current.name))
        .map(movie => ({ movie, label: versionLabel(movie.name) }))
        .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
        .filter(version => {
            if (seen.has(version.label)) return version.movie.stream_id === current.stream_id
            seen.add(version.label)
            return true
        })
}
