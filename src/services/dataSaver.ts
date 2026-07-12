/**
 * Economia de dados: em rede móvel, pôsteres e logos não carregam (o stream
 * o usuário pediu — capa de grade, não). A decisão precisa ser SÍNCRONA nos
 * componentes de lista, então o estado fica cacheado em módulo e é atualizado
 * no boot, na troca da opção e quando a rede muda de tipo.
 */
import * as Network from 'expo-network'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'neostream_datasaver'

let enabled = false
let onCellular = false

export async function isDataSaverEnabled(): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(STORAGE_KEY)) === '1'
    } catch {
        return false
    }
}

/** Recarrega opção + tipo de rede pro cache síncrono. */
export async function refreshDataSaver(): Promise<void> {
    enabled = await isDataSaverEnabled()
    try {
        const state = await Network.getNetworkStateAsync()
        onCellular = state.type === Network.NetworkStateType.CELLULAR
    } catch {
        onCellular = false
    }
}

export async function setDataSaver(value: boolean): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch { /* best-effort */ }
    await refreshDataSaver()
}

/** Consulta síncrona usada na renderização das grades/rails. */
export function skipImages(): boolean {
    return enabled && onCellular
}
