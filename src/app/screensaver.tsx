import { Image } from 'expo-image'
import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { t } from '../i18n/strings'
import { pingActivity } from '../services/idle'
import { cachedFetch, getClient } from '../services/session'
import { TvTouchable } from '../ui/components'
import { colors } from '../ui/theme'
import { tvSize } from '../ui/tv'

/** Relógio HH:MM sem depender de locale. */
function clockText(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 🌙 Tela ambiente da TV: relógio grande + capas do catálogo trocando
 * devagar. Qualquer OK/toque volta pra onde estava.
 */
export default function Screensaver() {
    const [now, setNow] = useState<Date | null>(null)
    const [covers, setCovers] = useState<string[]>([])
    const [coverIndex, setCoverIndex] = useState(0)

    useEffect(() => {
        const tick = () => setNow(new Date())
        queueMicrotask(tick)
        const timer = setInterval(tick, 10_000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                const client = await getClient()
                if (!client) return
                const movies = await cachedFetch('vod', () => client.getVodMovies()).catch(() => [])
                const icons = movies.map(movie => movie.stream_icon).filter((icon): icon is string => !!icon)
                setCovers(icons.slice(0, 40))
            })()
        })
    }, [])

    useEffect(() => {
        if (covers.length < 2) return
        const timer = setInterval(() => setCoverIndex(index => (index + 1) % covers.length), 12_000)
        return () => clearInterval(timer)
    }, [covers])

    const leave = () => { pingActivity(); router.back() }

    return (
        <TvTouchable style={styles.root} activeOpacity={1} hasTVPreferredFocus focusStyle={{}} accessibilityLabel={t('cancel')} onPress={leave}>
            <Stack.Screen options={{ headerShown: false }} />
            {covers[coverIndex] ? (
                <Image source={{ uri: covers[coverIndex] }} style={[styles.fill, styles.backdrop]} contentFit="cover" transition={800} />
            ) : null}
            <View style={[styles.fill, styles.shade]} />
            <Text style={styles.clock}>{now ? clockText(now) : ''}</Text>
            <Text style={styles.brand}>NeoStream</Text>
        </TvTouchable>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    fill: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 },
    backdrop: { opacity: 0.3 },
    shade: { backgroundColor: 'rgba(0,0,0,0.35)' },
    clock: { color: colors.text, fontSize: tvSize(72), fontWeight: '200', letterSpacing: 2 },
    brand: { color: colors.textDim, fontSize: tvSize(13), marginTop: 8, letterSpacing: 4, textTransform: 'uppercase' },
})
