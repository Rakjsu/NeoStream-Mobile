# 📺 Testando o NeoStream na Android TV (dev build)

A mesma APK serve celular e TV — o app detecta `uiMode: television`
(`Platform.isTV`) e liga o layout 10-foot (escala, barra lateral, foco
forte, overscan ajustável e protetor de tela).

## Emulador de TV

1. No Android Studio → Device Manager → **Create device** → categoria
   **TV** (ex.: *Television (1080p)*), API 34+.
2. `npx expo run:android` com o emulador de TV aberto instala o dev build
   direto nele (ou `adb install` da APK de release).

## D-pad por adb (sem controle físico)

O foco/D-pad pode ser dirigido inteiramente pelo `adb shell input keyevent`:

| Tecla            | keyevent               | Código |
| ---------------- | ---------------------- | ------ |
| ⬆ cima           | `KEYCODE_DPAD_UP`      | 19     |
| ⬇ baixo          | `KEYCODE_DPAD_DOWN`    | 20     |
| ⬅ esquerda       | `KEYCODE_DPAD_LEFT`    | 21     |
| ➡ direita        | `KEYCODE_DPAD_RIGHT`   | 22     |
| OK (centro)      | `KEYCODE_DPAD_CENTER`  | 23     |
| Voltar           | `KEYCODE_BACK`         | 4      |
| Play/Pause       | `KEYCODE_MEDIA_PLAY_PAUSE` | 85 |
| Canal + / −      | `KEYCODE_CHANNEL_UP/DOWN`  | 166/167 |

Exemplos:

```bash
adb shell input keyevent 20   # desce o foco
adb shell input keyevent 23   # "OK" no item focado
adb shell input keyevent --longpress 23   # OK longo (menu de contexto)
```

Segurar OK (`--longpress 23`) nas grades de filmes/séries abre o menu de
contexto leanback; no player, OK reabre os controles.

## Checagens rápidas

- `adb shell dumpsys uimode` → deve mostrar `mCurUiMode=0x11` (television)
  no emulador de TV.
- O protetor de tela dispara após 5 min sem interação fora do player
  (Ajustes → 📺 TV desliga).
- O overscan é ajustável em Ajustes → 📺 TV (0–64 px).

## Maestro (E2E)

- `maestro test .maestro/smoke.yml` — o app abre e chega na primeira tela.
- `maestro test .maestro/login-seeded.yml` — login Xtream completo com
  conta seedada via `MAESTRO_XTREAM_URL/USER/PASS` (ver o cabeçalho do
  flow). No CI, o workflow **Maestro E2E** roda a tag `seeded` só quando
  os secrets estiverem configurados.
