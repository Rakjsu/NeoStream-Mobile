/**
 * Update dentro do app: baixa o APK da release e abre o instalador do
 * Android (precisa da permissão REQUEST_INSTALL_PACKAGES — está no app.json).
 * Qualquer falha devolve false e o chamador cai pro navegador.
 */
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'

export async function downloadAndInstall(apkUrl: string, version: string): Promise<boolean> {
    try {
        const fileUri = `${FileSystem.cacheDirectory}NeoStream-${version}.apk`
        const result = await FileSystem.downloadAsync(apkUrl, fileUri)
        if (!result?.uri) return false
        const contentUri = await FileSystem.getContentUriAsync(result.uri)
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            type: 'application/vnd.android.package-archive',
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        })
        return true
    } catch {
        return false
    }
}
