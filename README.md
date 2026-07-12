# NeoStream Mobile 📱

Player IPTV pra celular (Android primeiro) — o irmão mobile do [NeoStream desktop](https://github.com/Rakjsu/NeoStream). Adicione sua lista **Xtream Codes** ou **M3U** e assista TV ao vivo, filmes e séries direto no aparelho.

> **Status: v0.3** — app completo pro dia a dia: catálogo, player, downloads offline, multi-conta e 3 idiomas.

## Funcionalidades

- **Contas**: login Xtream Codes ou lista M3U (séries detectadas por `SxxEyy`), multi-conta com troca rápida
- **Início**: continuar assistindo, favoritos, canais favoritos, filmes/séries recém-adicionados
- **TV ao vivo**: categorias, EPG agora/a seguir sob demanda, zapping por gesto dentro do player
- **Filmes/Séries**: ficha com sinopse/elenco/trailer, temporadas e episódios, episódios vistos (✓), ordenação (recentes · A-Z · nota), grade adaptável a tablet/paisagem
- **Player** (ExoPlayer via expo-video): retomar do ponto, faixas de áudio 🎧 e legenda 💬, **autoplay do próximo episódio** com contagem regressiva
- **Downloads offline**: filme ou episódio no aparelho, com progresso, cancelamento e player apontando pro arquivo local
- **Busca global**: canais + filmes + séries numa consulta só
- **Proteções**: controle parental por categorias (PIN) e **bloqueio do app com PIN** ao abrir
- **Backup**: exporta/importa contas, favoritos, progresso e ajustes como texto
- **Idiomas**: português, inglês e espanhol (segue o idioma do sistema)
- **Aviso de atualização**: banner no Início quando sai release nova no GitHub

## Stack

- **Expo SDK 57** + React Native 0.86 + TypeScript (expo-router, tabs)
- **expo-video** (ExoPlayer no Android) — toca `.m3u8` ao vivo e VOD direto do provedor
- Tudo fica no aparelho (AsyncStorage); nenhum dado sai pra terceiros
- Lógica pura em `src/services/` testada com **vitest** (63 testes)

## Rodar em desenvolvimento

```bash
npm install
npx expo start
```

Escaneie o QR com o app **Expo Go** (Android) na mesma rede Wi-Fi.

## Gerar APK

Toda tag `v*` dispara o workflow **release-apk** e publica o APK assinado no
[GitHub Releases](https://github.com/Rakjsu/NeoStream-Mobile/releases) — é só baixar e instalar.

Local, se preferir:

```bash
# via EAS (precisa de conta Expo gratuita)
npm install -g eas-cli
eas build --platform android --profile preview

# ou build local (precisa do Android SDK)
npx expo run:android --variant release
```

O app já vem com `usesCleartextTraffic` habilitado (provedores IPTV costumam ser `http://`).

## Validar

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (services puros)
npm run lint        # eslint (config do Expo)
npx expo export --platform android   # smoke test do bundle
```

> `npm audit`: as pendências moderadas atuais são todas transitivas do toolchain
> de build do Expo (`@expo/config*`); não têm superfície no app em runtime e se
> resolvem no próximo bump do SDK.

## Estrutura

```
src/
  app/            # telas (expo-router)
    login.tsx     # conta Xtream ou lista M3U
    unlock.tsx    # PIN do bloqueio do app
    (tabs)/       # Início · TV ao vivo · Filmes · Séries · Busca · Ajustes
    series/[id]   # temporadas + episódios (vistos, downloads, continuar)
    movie/[id]    # ficha do filme (trailer, download, retomar)
    player.tsx    # expo-video em tela cheia (faixas, zapping, autoplay)
    downloads.tsx # baixados + em andamento
  services/       # lógica pura testada (Xtream, M3U, progresso, downloads…)
  i18n/           # dicionário pt/en/es
  ui/             # tema e componentes compartilhados
```
