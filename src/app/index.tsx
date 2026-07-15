import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { needsUnlock } from '../services/appLock'
import { initProfiles, shouldPickProfile } from '../services/profiles'
import { initTheme } from '../ui/theme'
import { getClient, loadAccount } from '../services/session'
import { listRecentChannels } from '../services/recents'
import { Loading } from '../ui/components'

/** Porta de entrada: conta salva → app (ou tela de PIN, se o bloqueio está ativo). */
export default function Index() {
    const [state, setState] = useState<'checking' | 'in' | 'locked' | 'out' | 'welcome' | 'profiles' | 'live' | 'm3ulink' | 'channel'>('checking')
    const [playerParams, setPlayerParams] = useState<Record<string, string> | null>(null)
    const [m3uLink, setM3uLink] = useState('')

    useEffect(() => {
        let alive = true
        void Promise.all([
            loadAccount(),
            needsUnlock(),
            AsyncStorage.getItem('neostream_onboarded').catch(() => null),
            initProfiles(),
            initTheme(),
            AsyncStorage.getItem('neostream_boot_tab').catch(() => null),
            Linking.getInitialURL().catch(() => null),
        ]).then(([account, locked, onboarded, , , bootTab, initialUrl]) => {
            if (!alive) return
            // Lista .m3u aberta de fora (navegador/arquivos) → login preenchido.
            const sharedM3u = typeof initialUrl === 'string'
                && (/\.m3u8?($|\?)/i.test(initialUrl.split('#')[0] ?? '') || initialUrl.startsWith('content://'))
                ? initialUrl : null
            if (sharedM3u && !locked) {
                setM3uLink(sharedM3u)
                setState('m3ulink')
                return
            }
            if (!account) setState(onboarded ? 'out' : 'welcome')
            else if (locked) setState('locked')
            else if (shouldPickProfile()) setState('profiles')
            else if (bootTab === 'channel') {
                // 📺 Modo zapeador: liga já tocando o último canal assistido.
                void (async () => {
                    const [recents, client] = await Promise.all([listRecentChannels(), getClient()])
                    const last = recents[0]
                    if (!alive) return
                    if (client && last) {
                        setPlayerParams({ url: client.liveStreamUrl(last.id), title: last.name, live: '1' })
                        setState('channel')
                    } else {
                        setState('live')
                    }
                })()
            } else {
                setState(bootTab === 'live' ? 'live' : 'in')
            }
        })
        return () => { alive = false }
    }, [])

    if (state === 'checking') return <Loading />
    if (state === 'welcome') return <Redirect href="/welcome" />
    if (state === 'locked') return <Redirect href="/unlock" />
    if (state === 'profiles') return <Redirect href="/profiles" />
    if (state === 'live') return <Redirect href="/(tabs)/live" />
    if (state === 'channel' && playerParams) return <Redirect href={{ pathname: '/player', params: playerParams }} />
    if (state === 'm3ulink') return <Redirect href={{ pathname: '/login', params: { m3u: m3uLink } }} />
    return <Redirect href={state === 'in' ? '/(tabs)/home' : '/login'} />
}
