/**
 * Perfis ("Quem está assistindo?"): favoritos, Minha lista e continuar
 * assistindo POR PERFIL. O perfil padrão usa as chaves originais do storage
 * (zero migração); os demais ganham sufixo `_p_<id>` — trocar de perfil só
 * troca a chave que os serviços leem e zera os caches deles.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface Profile {
    id: string
    name: string
    color: string
    /** PIN de 4 dígitos opcional — protege o perfil (ex.: o dos adultos). */
    pin?: string
}

export const DEFAULT_PROFILE_ID = 'default'
export const GUEST_PROFILE_ID = 'guest'
export const PROFILE_COLORS = ['#7c5cff', '#e0564b', '#3d9e6b', '#d3893a', '#4a90d9', '#c74f9e']

const LIST_KEY = 'neostream_profiles'
const ACTIVE_KEY = 'neostream_active_profile'

let listCache: Profile[] | null = null
// Ativo em MEMÓRIA e síncrono: initProfiles() carrega no boot, antes das telas.
let activeId = DEFAULT_PROFILE_ID
let pickedThisSession = false

// Serviços com cache por perfil se registram pra zerar na troca.
const resetters: (() => void)[] = []
export function onProfileSwitch(reset: () => void): void {
    resetters.push(reset)
}

/** Chave de storage do perfil ativo (o padrão usa a base crua — legado). */
export function profileKey(base: string): string {
    return activeId === DEFAULT_PROFILE_ID ? base : `${base}_p_${activeId}`
}

/** Carregado no boot (index.tsx espera) — depois disso tudo é síncrono. */
export async function initProfiles(): Promise<void> {
    await listProfiles()
    try {
        const saved = await AsyncStorage.getItem(ACTIVE_KEY)
        if (saved && (listCache ?? []).some(profile => profile.id === saved)) activeId = saved
    } catch { /* fica no padrão */ }
}

export async function listProfiles(): Promise<Profile[]> {
    if (listCache) return listCache
    let extras: Profile[] = []
    try {
        const raw = await AsyncStorage.getItem(LIST_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        extras = Array.isArray(parsed)
            ? parsed.filter((p): p is Profile => !!p && typeof (p as Profile).id === 'string' && typeof (p as Profile).name === 'string')
            : []
    } catch { /* só o padrão */ }
    listCache = [
        { id: DEFAULT_PROFILE_ID, name: '', color: PROFILE_COLORS[0] },
        ...extras,
        // Convidado sempre existe: efêmero, zerado a cada entrada.
        { id: GUEST_PROFILE_ID, name: '', color: '#6b7280' },
    ]
    return listCache
}

export function activeProfileId(): string {
    return activeId
}

/** Convidado ativo? (recentes/buscas não são gravados). */
export function isGuestProfile(): boolean {
    return activeId === GUEST_PROFILE_ID
}

/** Apaga os dados do convidado — chamado ao ENTRAR nele (sessão sempre limpa). */
async function wipeGuestData(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([
            'neostream_favorites', 'neostream_progress', 'neostream_watched',
            'neostream_watchlist', 'neostream_usage', 'neostream_usage_titles', 'neostream_usage_months', 'neostream_usage_habits',
        ].map(base => `${base}_p_${GUEST_PROFILE_ID}`))
    } catch { /* best-effort */ }
}

/** Um boot com 2+ perfis pergunta "quem está assistindo?" uma vez. */
export function shouldPickProfile(): boolean {
    // O convidado sempre existe — só perfis "de verdade" disparam a pergunta.
    const real = (listCache ?? []).filter(profile => profile.id !== GUEST_PROFILE_ID).length
    return !pickedThisSession && real > 1
}

export function markProfilePicked(): void {
    pickedThisSession = true
}

export async function switchProfile(id: string): Promise<void> {
    const profiles = await listProfiles()
    if (!profiles.some(profile => profile.id === id)) return
    if (id === GUEST_PROFILE_ID) await wipeGuestData()
    activeId = id
    pickedThisSession = true
    try {
        await AsyncStorage.setItem(ACTIVE_KEY, id)
    } catch { /* best-effort */ }
    for (const reset of resetters) reset()
}

export async function addProfile(name: string, pin?: string): Promise<Profile | null> {
    const clean = name.trim()
    if (!clean) return null
    const profiles = await listProfiles()
    const profile: Profile = {
        id: `p${Date.now().toString(36)}`,
        name: clean,
        color: PROFILE_COLORS[(profiles.length - 1) % PROFILE_COLORS.length],
        pin: pin && /^\d{4}$/.test(pin) ? pin : undefined,
    }
    // Convidado fica sempre no fim da lista.
    listCache = [...profiles.filter(p => p.id !== GUEST_PROFILE_ID), profile,
        ...profiles.filter(p => p.id === GUEST_PROFILE_ID)]
    await persistExtras()
    return profile
}

export async function removeProfile(id: string): Promise<void> {
    if (id === DEFAULT_PROFILE_ID) return
    listCache = (await listProfiles()).filter(profile => profile.id !== id)
    await persistExtras()
    // Faxina: apaga os dados do perfil removido.
    try {
        await AsyncStorage.multiRemove([
            `neostream_favorites_p_${id}`,
            `neostream_progress_p_${id}`,
            `neostream_watched_p_${id}`,
            `neostream_watchlist_p_${id}`,
        ])
    } catch { /* best-effort */ }
    if (activeId === id) await switchProfile(DEFAULT_PROFILE_ID)
}

async function persistExtras(): Promise<void> {
    try {
        await AsyncStorage.setItem(LIST_KEY, JSON.stringify(
            (listCache ?? []).filter(p => p.id !== DEFAULT_PROFILE_ID && p.id !== GUEST_PROFILE_ID)))
    } catch { /* best-effort */ }
}

/** Edita nome/cor/PIN de um perfil extra (pin: '' remove o PIN). */
export async function updateProfile(id: string, changes: { name?: string; pin?: string }): Promise<void> {
    if (id === DEFAULT_PROFILE_ID || id === GUEST_PROFILE_ID) return
    listCache = (await listProfiles()).map(profile => {
        if (profile.id !== id) return profile
        return {
            ...profile,
            name: changes.name?.trim() || profile.name,
            pin: changes.pin === '' ? undefined
                : changes.pin && /^\d{4}$/.test(changes.pin) ? changes.pin : profile.pin,
        }
    })
    await persistExtras()
}

/** Cria um perfil já com os favoritos/Minha lista do perfil ATIVO. */
export async function copyCurrentDataTo(profileId: string): Promise<void> {
    for (const base of ['neostream_favorites', 'neostream_watchlist']) {
        try {
            const raw = await AsyncStorage.getItem(profileKey(base))
            if (raw) await AsyncStorage.setItem(`${base}_p_${profileId}`, raw)
        } catch { /* best-effort */ }
    }
}

/** Backup: só os perfis extras (padrão e convidado sempre existem). */
export async function exportProfiles(): Promise<Profile[]> {
    return (await listProfiles()).filter(p => p.id !== DEFAULT_PROFILE_ID && p.id !== GUEST_PROFILE_ID)
}

/** Restauração de backup: substitui os extras. */
export async function restoreProfilesList(profiles: Profile[]): Promise<void> {
    listCache = null
    try {
        await AsyncStorage.setItem(LIST_KEY, JSON.stringify(Array.isArray(profiles) ? profiles : []))
    } catch { /* best-effort */ }
}

/** Só pra testes. */
export function resetProfilesCache(): void {
    listCache = null
    activeId = DEFAULT_PROFILE_ID
    pickedThisSession = false
}
