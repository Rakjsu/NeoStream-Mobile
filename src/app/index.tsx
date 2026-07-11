import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { needsUnlock } from '../services/appLock'
import { loadAccount } from '../services/session'
import { Loading } from '../ui/components'

/** Porta de entrada: conta salva → app (ou tela de PIN, se o bloqueio está ativo). */
export default function Index() {
    const [state, setState] = useState<'checking' | 'in' | 'locked' | 'out'>('checking')

    useEffect(() => {
        let alive = true
        void Promise.all([loadAccount(), needsUnlock()]).then(([account, locked]) => {
            if (!alive) return
            if (!account) setState('out')
            else setState(locked ? 'locked' : 'in')
        })
        return () => { alive = false }
    }, [])

    if (state === 'checking') return <Loading />
    if (state === 'locked') return <Redirect href="/unlock" />
    return <Redirect href={state === 'in' ? '/(tabs)/home' : '/login'} />
}
