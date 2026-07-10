# NeoStream Mobile — instruções do projeto

App IPTV pra celular (Expo SDK 57 / React Native / TypeScript, expo-router). Irmão do NeoStream desktop (`Rakjsu/NeoStream`), que é a referência de produto e de protocolo (Xtream em `electron/xtreamClient.ts` lá).

## Convenções

- Responder e escrever strings de UI em **português (BR)**.
- Commits em pt-BR no padrão `feat|fix|test|chore(escopo): resumo`. **Sem** trailers `Co-authored-by` e **sem** rodapé "Generated with Claude Code".
- PRs sempre com base na `main`; nunca empilhar PR em branch de outro PR.
- Lógica de protocolo/parse fica **pura** em `src/services/` (sem imports de React Native) pra ser testável com vitest. Telas não carregam regra de negócio.
- Release só quando o usuário pedir explicitamente.

## Validação antes de commitar

```bash
npm run typecheck                      # tsc --noEmit
npm test                               # vitest (src/services)
npm run lint                           # eslint (expo lint)
npx expo export --platform android     # smoke test: bundle fecha sem erro
```

## Armadilhas conhecidas

- Provedores IPTV são `http://` → o cleartext fica habilitado via `expo-build-properties` no `app.json`; não remover.
- TV ao vivo usa a URL `.m3u8` do Xtream (ExoPlayer não abre `.ts` cru por http de forma confiável).
- `expo-video`: a prop `allowsFullscreen` NÃO existe nesta versão (fullscreen já vem dos controles nativos).
- A regra `react-hooks/set-state-in-effect` implica em `useEffect(() => { queueMicrotask(() => { void load() }) }, [load])` pra carregar dados no mount.
