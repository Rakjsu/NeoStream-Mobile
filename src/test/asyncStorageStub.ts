/**
 * Stub em memória do @react-native-async-storage/async-storage pro vitest.
 * O pacote 3.x não resolve em Node puro (imports sem extensão em lib/module),
 * então o vitest.config aponta o módulo inteiro pra cá — os testes que
 * precisam de comportamento específico continuam livres pra vi.mock por cima.
 */

const store = new Map<string, string>()

const AsyncStorage = {
    async getItem(key: string): Promise<string | null> {
        return store.get(key) ?? null
    },
    async setItem(key: string, value: string): Promise<void> {
        store.set(key, value)
    },
    async removeItem(key: string): Promise<void> {
        store.delete(key)
    },
    async getAllKeys(): Promise<string[]> {
        return [...store.keys()]
    },
    async clear(): Promise<void> {
        store.clear()
    },
}

export default AsyncStorage
