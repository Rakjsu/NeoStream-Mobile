/**
 * Auto-backup silencioso: a cada 3 dias de uso, uma cópia do backup cai em
 * documentDirectory/backups/ (sem perguntar nada), mantendo as 5 últimas.
 * A poda é PURA (testável); o resto é best-effort — backup nunca pode
 * atrapalhar o boot.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { collectBackup, serializeBackup } from './backup'
import { dayKey } from './usage'

const META_KEY = 'neostream_autobackup_at'
const CLOUD_KEY = 'neostream_backup_dir'
const DIR = `${FileSystem.documentDirectory}backups/`
const INTERVAL_MS = 3 * 24 * 3600_000
const KEEP = 5

/** Quais arquivos apagar pra sobrar `keep` (nomes têm a data → sort basta). */
export function pruneList(names: string[], keep = KEEP): string[] {
    return [...names].sort().slice(0, Math.max(0, names.length - keep))
}

export interface AutoBackupFile {
    name: string
    uri: string
}

export async function listAutoBackups(): Promise<AutoBackupFile[]> {
    try {
        const names = await FileSystem.readDirectoryAsync(DIR)
        return names
            .filter(name => name.endsWith('.json'))
            .sort()
            .reverse()
            .map(name => ({ name, uri: DIR + name }))
    } catch {
        return []
    }
}

export async function readAutoBackup(uri: string): Promise<string> {
    return FileSystem.readAsStringAsync(uri)
}

/** Pasta SAF escolhida pro espelho na nuvem ('' = desligado). */
export async function getCloudBackupDir(): Promise<string> {
    try {
        return (await AsyncStorage.getItem(CLOUD_KEY)) ?? ''
    } catch {
        return ''
    }
}

/** Pede a pasta (Drive/OneDrive via SAF) e guarda a permissão persistente. */
export async function chooseCloudBackupDir(): Promise<boolean> {
    try {
        const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
        if (!result.granted) return false
        await AsyncStorage.setItem(CLOUD_KEY, result.directoryUri)
        return true
    } catch {
        return false
    }
}

export async function clearCloudBackupDir(): Promise<void> {
    try {
        await AsyncStorage.removeItem(CLOUD_KEY)
    } catch { /* best-effort */ }
}

/** Chamado no boot: salva se passou o intervalo e poda as antigas. */
export async function runAutoBackup(nowMs = Date.now()): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(META_KEY)
        const lastAt = raw ? Number(raw) : 0
        if (Number.isFinite(lastAt) && nowMs - lastAt < INTERVAL_MS) return

        const json = serializeBackup(await collectBackup())
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined)
        // Hora no nome desempata dois backups no mesmo dia.
        const stamp = `${dayKey(nowMs)}-${String(new Date(nowMs).getHours()).padStart(2, '0')}${String(new Date(nowMs).getMinutes()).padStart(2, '0')}`
        await FileSystem.writeAsStringAsync(`${DIR}auto-${stamp}.json`, json)
        await AsyncStorage.setItem(META_KEY, String(nowMs))

        // Espelho na nuvem: mesma cópia cai na pasta SAF escolhida.
        try {
            const cloudDir = await AsyncStorage.getItem(CLOUD_KEY)
            if (cloudDir) {
                const uri = await FileSystem.StorageAccessFramework.createFileAsync(
                    cloudDir, `neostream-auto-${stamp}`, 'application/json')
                await FileSystem.writeAsStringAsync(uri, json)
            }
        } catch { /* nuvem indisponível não trava o backup local */ }

        const names = (await FileSystem.readDirectoryAsync(DIR)).filter(name => name.endsWith('.json'))
        for (const name of pruneList(names)) {
            await FileSystem.deleteAsync(DIR + name, { idempotent: true }).catch(() => undefined)
        }
    } catch { /* best-effort */ }
}
