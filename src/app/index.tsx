import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { needsUnlock } from '../services/appLock'
import { initProfiles, shouldPickProfile } from '../services/profiles'
import { initTheme } from '../ui/theme'
import { loadAccount } from '../services/session'
import { Loading } from '../ui/components'

/** Porta de entrada: conta salva → app (ou tela de PIN, se o bloqueio está ativo). */
export default function Index() {
    const [state, setState] = useState<'checking' | 'in' | 'locked' | 'out' | 'welcome' | 'profiles' | 'live'>('checking')

    useEffect(() => {
        let alive = true
        void Promise.all([
            loadAccount(),
            needsUnlock(),
            AsyncStorage.getItem('neostream_onboarded').catch(() => null),
            initProfiles(),
            initTheme(),
            AsyncStorage.getItem('neostream_boot_tab').catch(() => null),
        ]).then(([account, locked, onboarded, , , bootTab]) => {
            if (!alive) return
            if (!account) setState(onboarded ? 'out' : 'welcome')
            else if (locked) setState('locked')
            else setState(shouldPickProfile() ? 'profiles' : bootTab === 'live' ? 'live' : 'in')
        })
        return () => { alive = false }
    }, [])

    if (state === 'checking') return <Loading />
    if (state === 'welcome') return <Redirect href="/welcome" />
    if (state === 'locked') return <Redirect href="/unlock" />
    if (state === 'profiles') return <Redirect href="/profiles" />
    if (state === 'live') return <Redirect href="/(tabs)/live" />
    return <Redirect href={state === 'in' ? '/(tabs)/home' : '/login'} />
}
