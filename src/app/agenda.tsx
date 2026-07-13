import { Ionicons } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { cancelScheduled, listScheduled, type ScheduledReminder } from '../services/notify'
import { listRecurring, removeRecurring, type RecurringReminder } from '../services/recurring'
import { listScheduledRecs, removeScheduledRec, type ScheduledRec } from '../services/schedRec'
import { EmptyState, TvTouchable } from '../ui/components'
import { colors, spacing } from '../ui/theme'
import { t } from '../i18n/strings'

const hhmm = (ms: number) => {
    const date = new Date(ms)
    return `${date.toLocaleDateString()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Agenda unificada: lembretes, avisos recorrentes e gravações agendadas. */
export default function Agenda() {
    const [reminders, setReminders] = useState<ScheduledReminder[]>([])
    const [recurring, setRecurring] = useState<RecurringReminder[]>([])
    const [recs, setRecs] = useState<ScheduledRec[]>([])

    const refresh = () => {
        void listScheduled().then(setReminders)
        void listRecurring().then(setRecurring)
        void listScheduledRecs().then(setRecs)
    }

    useEffect(() => { queueMicrotask(refresh) }, [])

    const total = reminders.length + recurring.length + recs.length

    const row = (icon: string, label: string, meta: string, onCancel: () => void, key: string) => (
        <View key={key} style={styles.row}>
            <Ionicons name={icon as 'alarm-outline'} size={16} color={colors.accent} />
            <View style={{ flex: 1 }}>
                <Text style={styles.label} numberOfLines={1}>{label}</Text>
                <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
            </View>
            <TvTouchable accessibilityLabel={t('cancel')} onPress={onCancel}>
                <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
            </TvTouchable>
        </View>
    )

    return (
        <ScrollView style={styles.root} contentContainerStyle={total === 0 ? { flexGrow: 1 } : { padding: spacing.lg }}>
            <Stack.Screen options={{ title: t('agendaTitle') }} />
            {total === 0 ? (
                <EmptyState icon="calendar-outline" label={t('remindersNone')} />
            ) : (
                <>
                    {recs.length > 0 ? <Text style={styles.section}>{t('agendaRecs')}</Text> : null}
                    {recs.map(rec => row('recording-outline', rec.title, `${hhmm(rec.startMs)} · ${rec.channelName}`,
                        () => { void removeScheduledRec(rec.channelId, rec.startMs).then(setRecs) },
                        `r${rec.channelId}${rec.startMs}`))}

                    {reminders.length > 0 ? <Text style={styles.section}>{t('remindersSection')}</Text> : null}
                    {reminders.map(reminder => row('alarm-outline', reminder.title, hhmm(reminder.atMs),
                        () => { void cancelScheduled(reminder.id).then(listScheduled).then(setReminders) },
                        `n${reminder.id}`))}

                    {recurring.length > 0 ? <Text style={styles.section}>{t('agendaRecurring')}</Text> : null}
                    {recurring.map(reminder => row('repeat-outline', reminder.title, reminder.channelName,
                        () => { void removeRecurring(reminder).then(setRecurring) },
                        `c${reminder.channelId}${reminder.title}`))}
                </>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    section: {
        color: colors.textDim,
        fontSize: 13,
        textTransform: 'uppercase',
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 9,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    label: { color: colors.text, fontSize: 14 },
    meta: { color: colors.textDim, fontSize: 12 },
})
