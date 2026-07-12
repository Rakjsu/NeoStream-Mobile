/**
 * Spike Android TV: faz o APK aparecer no launcher da TV (leanback) sem
 * exigir touchscreen. Copia o banner pro res/ e ajusta o AndroidManifest.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

function withTvBanner(config) {
    return withDangerousMod(config, [
        'android',
        cfg => {
            const src = path.join(cfg.modRequest.projectRoot, 'assets', 'tv-banner.png')
            const destDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable')
            fs.mkdirSync(destDir, { recursive: true })
            fs.copyFileSync(src, path.join(destDir, 'tv_banner.png'))
            return cfg
        },
    ])
}

function withLeanbackManifest(config) {
    return withAndroidManifest(config, cfg => {
        const manifest = cfg.modResults.manifest

        // TV não tem touchscreen; leanback é opcional (o mesmo APK serve pro celular).
        manifest['uses-feature'] = [
            ...(manifest['uses-feature'] ?? []),
            { $: { 'android:name': 'android.software.leanback', 'android:required': 'false' } },
            { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'false' } },
        ]

        const app = manifest.application?.[0]
        if (app) {
            app.$['android:banner'] = '@drawable/tv_banner'
            const mainActivity = (app.activity ?? []).find(a => a.$['android:name'] === '.MainActivity')
            const intentFilter = mainActivity?.['intent-filter']?.find(f =>
                f.action?.some(a => a.$['android:name'] === 'android.intent.action.MAIN'))
            if (intentFilter) {
                intentFilter.category = [
                    ...(intentFilter.category ?? []),
                    { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
                ]
            }
        }
        return cfg
    })
}

module.exports = config => withLeanbackManifest(withTvBanner(config))
