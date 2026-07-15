/**
 * 📁 Pastas de favoritos: coleções nomeadas de filmes/séries (por perfil).
 * Cada item leva nome/capa junto — o Início renderiza as pastas como fileiras
 * sem precisar casar com o catálogo. CRUD simples sobre o AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { onProfileSwitch, profileKey } from './profiles'

export interface CollectionItem {
    kind: 'movie' | 'series'
    id: string
    name: string
    cover: string
    container?: string
}

export interface Collection {
    id: string
    name: string
    items: CollectionItem[]
}

const STORAGE_KEY = 'neostream_collections'

let cache: Collection[] | null = null

export async function listCollections(): Promise<Collection[]> {
    if (cache) return cache
    try {
        const raw = await AsyncStorage.getItem(profileKey(STORAGE_KEY))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        cache = Array.isArray(parsed)
            ? parsed.filter((c): c is Collection =>
                !!c && typeof (c as Collection).id === 'string'
                && typeof (c as Collection).name === 'string'
                && Array.isArray((c as Collection).items))
            : []
    } catch {
        cache = []
    }
    return cache
}

async function persist(): Promise<void> {
    try {
        await AsyncStorage.setItem(profileKey(STORAGE_KEY), JSON.stringify(cache ?? []))
    } catch { /* best-effort */ }
}

export async function createCollection(name: string): Promise<Collection | null> {
    const clean = name.trim()
    if (!clean) return null
    const list = await listCollections()
    const collection: Collection = { id: `c${Date.now().toString(36)}`, name: clean, items: [] }
    cache = [...list, collection]
    await persist()
    return collection
}

export async function removeCollection(id: string): Promise<void> {
    cache = (await listCollections()).filter(collection => collection.id !== id)
    await persist()
}

/** Entra/sai da pasta; devolve true se o item ENTROU. */
export async function toggleInCollection(collectionId: string, item: CollectionItem): Promise<boolean> {
    const list = await listCollections()
    let added = false
    cache = list.map(collection => {
        if (collection.id !== collectionId) return collection
        const has = collection.items.some(existing => existing.kind === item.kind && existing.id === item.id)
        added = !has
        return {
            ...collection,
            items: has
                ? collection.items.filter(existing => !(existing.kind === item.kind && existing.id === item.id))
                : [...collection.items, item],
        }
    })
    await persist()
    return added
}

/** O item está numa pasta? (PURO — pro estado do botão nas fichas.) */
export function isInCollection(collections: Collection[], collectionId: string, kind: CollectionItem['kind'], id: string): boolean {
    const collection = collections.find(entry => entry.id === collectionId)
    return !!collection?.items.some(item => item.kind === kind && item.id === id)
}

// Pastas são por perfil — trocar de perfil zera o cache.
onProfileSwitch(() => { cache = null })

/** Só pra testes. */
export function resetCollectionsCache(): void {
    cache = null
}
