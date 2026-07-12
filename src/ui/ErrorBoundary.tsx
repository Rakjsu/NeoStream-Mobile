/**
 * Rede de segurança global: um erro de render em qualquer tela cai aqui em
 * vez de matar o app em tela branca. "Recarregar" remonta a árvore inteira
 * (key nova); o detalhe técnico fica atrás de um toque.
 */
import { Ionicons } from '@expo/vector-icons'
import { Component, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { recordError } from '../services/errorLog'
import { t } from '../i18n/strings'
import { colors, spacing } from './theme'

interface Props {
    children: ReactNode
}

interface State {
    error: Error | null
    showDetails: boolean
    generation: number
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null, showDetails: false, generation: 0 }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error }
    }

    componentDidCatch(error: Error): void {
        void recordError(error.message || String(error))
    }

    private reload = () => {
        this.setState(current => ({ error: null, showDetails: false, generation: current.generation + 1 }))
    }

    render() {
        if (!this.state.error) {
            return <View key={this.state.generation} style={styles.fill}>{this.props.children}</View>
        }
        return (
            <View style={styles.root}>
                <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
                <Text style={styles.title}>{t('errTitle')}</Text>
                <Text style={styles.hint}>{t('errHint')}</Text>
                <TouchableOpacity style={styles.btn} onPress={this.reload}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.btnText}>{t('errReload')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => this.setState(s => ({ showDetails: !s.showDetails }))}>
                    <Text style={styles.detailsToggle}>{t('errDetails')}</Text>
                </TouchableOpacity>
                {this.state.showDetails ? (
                    <ScrollView style={styles.details}>
                        <Text style={styles.detailsText}>{this.state.error.stack ?? this.state.error.message}</Text>
                    </ScrollView>
                ) : null}
            </View>
        )
    }
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    root: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    hint: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        borderRadius: 10,
        paddingHorizontal: spacing.xl,
        paddingVertical: 12,
        marginTop: spacing.sm,
    },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    detailsToggle: { color: colors.textDim, fontSize: 13, textDecorationLine: 'underline' },
    details: {
        maxHeight: 200,
        alignSelf: 'stretch',
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: spacing.md,
    },
    detailsText: { color: colors.textDim, fontSize: 11, fontFamily: 'monospace' },
})
