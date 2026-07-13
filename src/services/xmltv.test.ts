import { describe, it, expect } from 'vitest'
import { lookupDaySchedule, lookupNowNext, normalizeChannelName, parseXmltv, parseXmltvDate } from './xmltv'

// 12:00 UTC de 2026-07-11 como "agora" dos testes.
const NOW = Date.UTC(2026, 6, 11, 12, 0, 0)

const XML = `<?xml version="1.0"?>
<tv>
  <channel id="globo.br">
    <display-name>Globo HD</display-name>
    <display-name>Globo</display-name>
  </channel>
  <channel id="sbt.br"><display-name>SBT</display-name></channel>
  <programme start="20260711113000 +0000" stop="20260711123000 +0000" channel="globo.br">
    <title>Jornal do Meio-Dia</title>
  </programme>
  <programme start="20260711123000 +0000" stop="20260711140000 +0000" channel="globo.br">
    <title>Sess&#227;o da Tarde &amp; Cia</title>
  </programme>
  <programme start="20260710080000 +0000" stop="20260710090000 +0000" channel="globo.br">
    <title>Programa de ontem (descartado)</title>
  </programme>
  <programme channel="sbt.br" stop="20260711130000 +0000" start="20260711110000 +0000">
    <title>Novela</title>
  </programme>
</tv>`

describe('parseXmltvDate', () => {
    it('converte com e sem fuso', () => {
        expect(parseXmltvDate('20260711120000 +0000')).toBe(NOW)
        expect(parseXmltvDate('20260711090000 -0300')).toBe(NOW) // 09:00-03:00 = 12:00 UTC
        expect(parseXmltvDate('20260711120000')).toBe(NOW) // sem fuso → UTC
        expect(parseXmltvDate('lixo')).toBeNaN()
    })
})

describe('normalizeChannelName', () => {
    it('ignora sufixos de qualidade e caixa', () => {
        expect(normalizeChannelName('Globo  HD')).toBe('globo')
        expect(normalizeChannelName('SBT 4K')).toBe('sbt')
    })
})

describe('parseXmltv / lookupNowNext', () => {
    const guide = parseXmltv(XML, NOW)

    it('acha o agora e o a seguir por id, com atributos em qualquer ordem', () => {
        const globo = guide.byChannelId.get('globo.br')!
        expect(globo.now?.title).toBe('Jornal do Meio-Dia')
        expect(globo.next?.title).toBe('Sessão da Tarde & Cia')
        expect(globo.next?.startMs).toBe(Date.UTC(2026, 6, 11, 12, 30))
        const sbt = guide.byChannelId.get('sbt.br')!
        expect(sbt.now?.title).toBe('Novela')
        expect(sbt.next).toBeNull()
    })

    it('cai no nome quando o tvg-id não bate (e vazio quando nada casa)', () => {
        expect(lookupNowNext(guide, 'id-que-nao-existe', 'GLOBO FHD').now?.title).toBe('Jornal do Meio-Dia')
        expect(lookupNowNext(guide, '', 'Canal Fantasma')).toEqual({ now: null, next: null })
    })
})

describe('lookupDaySchedule (grade do dia M3U)', () => {
    const xml = `<tv>
      <channel id="c1"><display-name>Canal Um HD</display-name></channel>
      <programme channel="c1" start="20260710200000 +0000" stop="20260710210000 +0000"><title>Velho demais</title></programme>
      <programme channel="c1" start="20260711090000 +0000" stop="20260711100000 +0000"><title>Replay</title></programme>
      <programme channel="c1" start="20260711130000 +0000" stop="20260711140000 +0000"><title>Futuro</title></programme>
      <programme channel="c1" start="20260711113000 +0000" stop="20260711123000 +0000"><title>Agora</title></programme>
      <programme channel="c1" start="20260712140000 +0000" stop="20260712150000 +0000"><title>Fora do horizonte</title></programme>
    </tv>`
    const guide = parseXmltv(xml, NOW)

    it('janela de 12h atrás a 24h à frente, ordenada', () => {
        expect(lookupDaySchedule(guide, 'c1', '').map(p => p.title)).toEqual(['Replay', 'Agora', 'Futuro'])
    })

    it('resolve pelo nome quando falta tvg-id; vazio quando nada casa', () => {
        expect(lookupDaySchedule(guide, '', 'CANAL UM 4K').map(p => p.title)).toEqual(['Replay', 'Agora', 'Futuro'])
        expect(lookupDaySchedule(guide, '', 'Canal Fantasma')).toEqual([])
    })

    it('programas encerrados continuam alimentando o agora/a seguir corretamente', () => {
        const nowNext = lookupNowNext(guide, 'c1', '')
        expect(nowNext.now?.title).toBe('Agora')
        expect(nowNext.next?.title).toBe('Futuro')
    })
})
