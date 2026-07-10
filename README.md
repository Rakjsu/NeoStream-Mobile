# NeoStream Mobile 📱

Player IPTV pra celular (Android primeiro) — o irmão mobile do [NeoStream desktop](https://github.com/Rakjsu/NeoStream). Adicione sua lista **Xtream Codes** e assista TV ao vivo, filmes e séries direto no aparelho.

> **Status: v0** — login Xtream, TV ao vivo (HLS), filmes, séries com temporadas/episódios, busca em tudo e player nativo (ExoPlayer). M3U, EPG, favoritos e "continuar assistindo" vêm nas próximas rodadas.

## Stack

- **Expo SDK 57** + React Native 0.86 + TypeScript (expo-router, tabs)
- **expo-video** (ExoPlayer no Android) — toca `.m3u8` ao vivo e VOD direto do provedor
- Conta salva no aparelho (AsyncStorage); nenhum dado sai pra terceiros
- Lógica de protocolo pura em `src/services/` testada com **vitest**

## Rodar em desenvolvimento

```bash
npm install
npx expo start
```

Escaneie o QR com o app **Expo Go** (Android) na mesma rede Wi-Fi.

## Gerar APK

```bash
# automático: crie uma tag e o GitHub Actions publica a release com o APK
git tag v0.2.0 && git push origin v0.2.0

# via EAS (precisa de conta Expo gratuita)
npm install -g eas-cli
eas build --platform android --profile preview

# ou build local (precisa do Android SDK)
npx expo run:android --variant release
```

O APK das releases é assinado com a keystore de debug — instala direto no aparelho (sideload); assinatura de loja fica pra quando formos pra Play Store.

O app já vem com `usesCleartextTraffic` habilitado (provedores IPTV costumam ser `http://`).

## Validar

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (services puros)
npm run lint        # eslint (config do Expo)
npx expo export --platform android   # smoke test do bundle
```

## Estrutura

```
src/
  app/            # telas (expo-router)
    login.tsx     # entrada da conta Xtream
    (tabs)/       # TV ao vivo · Filmes · Séries · Ajustes
    series/[id]   # temporadas + episódios
    player.tsx    # expo-video em tela cheia
  services/       # protocolo Xtream (puro, testado) + sessão/cache
  ui/             # tema e componentes compartilhados
```
