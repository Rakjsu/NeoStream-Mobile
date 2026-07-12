import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { needsUnlock } from '../services/appLock'
import { loadAccount } from '../services/session'
import { Loading } from '../ui/components'

/** Porta de entrada: conta salva → app (ou tela de PIN, se o bloqueio está ativo). */
export default function Index() {
    const [state, setState] = useState<'checking' | 'in' | 'locked' | 'out' | 'welcome'>('checking')

    useEffect(() => {
        let alive = true
        void Promise.all([
            loadAccount(),
            needsUnlock(),
            AsyncStorage.getItem('neostream_onboarded').catch(() => null),
        ]).then(([account, locked, onboarded]) => {
            if (!alive) return
            if (!account) setState(onboarded ? 'out' : 'welcome')
            else setState(locked ? 'locked' : 'in')
        })
        return () => { alive = false }
    }, [])

    if (state === 'checking') return <Loading />
    if (state === 'welcome') return <Redirect href="/welcome" />
    if (state === 'locked') return <Redirect href="/unlock" />
    return <Redirect href={state === 'in' ? '/(tabs)/home' : '/login'} />
}
