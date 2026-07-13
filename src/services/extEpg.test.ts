import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyExternalEpg, resetExtEpgCache, setExtEpgUrl } from './extEpg'
import type { CatalogClient } from './xtream'

// Storage funcional em memória — setExtEpgUrl/getExtEpgUrl leem de verdade.
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: async (key: string) => store.get(key) ?? null,
            setItem: async (key: string, value: string) => { store.set(key, value) },
            removeItem: async (key: string) => { store.delete(key) },
        },
    }
})

const stamp = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00 +0000`
}

function fakeClient(): CatalogClient {
    return {
        authenticate: async () => ({}),
        getLiveChannels: async () => [{ stream_id: 7, name: 'Globo HD' }],
        getLiveCategories: async () => [],
        getVodMovies: async () => [],
        getVodCategories: async () => [],
        getSeries: async () => [],
        getSeriesCategories: async () => [],
        getSeriesInfo: async () => ({}),
        getVodDetails: async () => ({
            plot: '', genre: '', releaseDate: '', rating: '', duration: '', cover: '', trailer: '', cast: '', director: '',
        }),
        getShortEpg: async () => ({ now: { title: 'Do provedor', startMs: 0, endMs: 1 }, next: null }),
        liveStreamUrl: () => '',
        vodStreamUrl: () => '',
        seriesStreamUrl: () => '',
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
    resetExtEpgCache()
})

describe('EPG externo (XMLTV por URL)', () => {
    it('sobrepõe agora/a seguir e grade quando o canal casa por nome', async () => {
        await setExtEpgUrl('http://epg/externo.xml')
        const start = Date.now() + 60_000
        const xml = '<tv><channel id="g"><display-name>Globo HD</display-name></channel>'
            + `<programme start="${stamp(start)}" stop="${stamp(start + 3600_000)}" channel="g"><title>Externo</title></programme></tv>`
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => xml })))

        const client = fakeClient()
        applyExternalEpg(client)
        expect((await client.getShortEpg(7)).next?.title).toBe('Externo')
        expect((await client.getDaySchedule?.(7))?.[0]?.title).toBe('Externo')
    })

    it('sem URL configurada tudo passa reto pro guia do provedor', async () => {
        await setExtEpgUrl('')
        const client = fakeClient()
        applyExternalEpg(client)
        expect((await client.getShortEpg(7)).now?.title).toBe('Do provedor')
        expect(await client.getDaySchedule?.(7)).toEqual([])
    })

    it('falha no download do XML cai no guia do provedor', async () => {
        await setExtEpgUrl('http://epg/fora-do-ar.xml')
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' })))
        const client = fakeClient()
        applyExternalEpg(client)
        expect((await client.getShortEpg(7)).now?.title).toBe('Do provedor')
    })
})
