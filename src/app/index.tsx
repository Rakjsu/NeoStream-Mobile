import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { loadAccount } from '../services/session'
import { Loading } from '../ui/components'

/** Porta de entrada: com conta salva vai direto pro app, senão pro login. */
export default function Index() {
    const [state, setState] = useState<'checking' | 'in' | 'out'>('checking')

    useEffect(() => {
        let alive = true
        loadAccount().then(account => { if (alive) setState(account ? 'in' : 'out') })
        return () => { alive = false }
    }, [])

    if (state === 'checking') return <Loading />
    return <Redirect href={state === 'in' ? '/(tabs)/home' : '/login'} />
}
