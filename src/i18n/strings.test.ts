import { describe, it, expect, vi } from 'vitest'
import { STRINGS, detectLang, t, tf } from './strings'

// Hoisted pelo vitest — o getLocales roda no import do módulo.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'pt' }] }))

describe('STRINGS (paridade pt/en/es)', () => {
    it('os 3 idiomas têm exatamente as mesmas chaves, sem valores vazios', () => {
        const pt = Object.keys(STRINGS.pt).sort()
        expect(Object.keys(STRINGS.en).sort()).toEqual(pt)
        expect(Object.keys(STRINGS.es).sort()).toEqual(pt)
        for (const lang of ['pt', 'en', 'es'] as const) {
            for (const [key, value] of Object.entries(STRINGS[lang])) {
                expect(value.length, `${lang}.${key}`).toBeGreaterThan(0)
            }
        }
    })

    it('placeholders {x} existem nos 3 idiomas quando existem em um', () => {
        for (const [key, value] of Object.entries(STRINGS.pt)) {
            const holders = (value.match(/\{[a-z]+\}/g) ?? []).sort()
            for (const lang of ['en', 'es'] as const) {
                const other = ((STRINGS[lang] as Record<string, string>)[key].match(/\{[a-z]+\}/g) ?? []).sort()
                expect(other, `${lang}.${key}`).toEqual(holders)
            }
        }
    })
})

describe('detectLang / t / tf', () => {
    it('pt e es diretos; o resto cai em inglês', () => {
        expect(detectLang('pt')).toBe('pt')
        expect(detectLang('es')).toBe('es')
        expect(detectLang('fr')).toBe('en')
        expect(detectLang(undefined)).toBe('en')
    })

    it('t resolve no idioma detectado e tf preenche placeholders', () => {
        expect(t('tabHome')).toBe('Início') // mock: sistema em pt
        expect(tf('updateBanner', { version: 'v9.9.9' })).toContain('v9.9.9')
    })
})
