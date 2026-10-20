# Gragarda Voice Web

Web app gratuite (PWA) qui répare et embellit la voix d'une vidéo de téléphone, puis la renvoie prête à publier,
**sans réencoder l'image**. Tout le traitement se fait dans le navigateur : la vidéo ne quitte jamais l'appareil.
Spécification complète : [SPEC.md](SPEC.md).

## Organisation

| Dossier | Contenu |
|---|---|
| `core/` | submodule [gragarda-voice-core](https://github.com/Gragarda/gragarda-voice-core) (branche `feature/offline`) : `offline/` = pipeline fichier entier (plops, analyse, traitement), `presets/*.json` |
| `wasm/` | bindings Emscripten (`Module.run`), test Node « WASM = gv-cli » |
| `web/` | PWA Vite + TypeScript : UI, workers (DSP, cuts WebCodecs), ffmpeg.wasm |
| `tools/gv-cli/` | `gv-cli in.wav out.wav --preset p.json [--cuts cuts.json] [--report r.json]` |
| `tools/cut-calibration/` | même détection de cuts qu'en TS, en Python + ffmpeg, pour calibrer les seuils |

## Build

```sh
git submodule update --init
# natif : tests du coeur + gv-cli
cmake -S . -B build -DGV_CORE_TESTS=ON && cmake --build build --config Release
ctest --test-dir build/core -C Release
# WASM (emsdk activé) -> web/src/wasm/
emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm
# web
cd web && npm ci && npm test && npm run dev
```

Le CI (`.github/workflows/build.yml`) enchaîne tout et déploie `web/dist` sur GitHub Pages.

## Déploiement : en-têtes COOP / COEP

GitHub Pages ne permet pas d'ajouter d'en-têtes. Derrière Cloudflare, une Transform Rule (Modify response header)
sur le sous-domaine de l'app ajoute :

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Sans ces en-têtes, l'app fonctionne quand même : `crossOriginIsolated` est faux, donc ffmpeg.wasm passe en monothread
(le remux en `-c:v copy` reste rapide). Le DSP est monothread dans tous les cas.

## Décisions prises (points [À VALIDER] de la spec)

- **UI sans framework** (TypeScript + DOM) : 4 écrans, JS de l'app ≈ 14 Ko. Svelte ou Preact se justifieront si l'UI grossit.
- **Audio traité en mono** (downmix), réencodé en AAC 48 kHz stéréo 192 kbps.
- **Pas de coi-serviceworker** : le mode monothread suffit comme repli.
- **Calibration des cuts sans OpenCV** : ffmpeg décode et réduit déjà les images.

## Limites connues

- Détection des plops calibrée sur voix synthétiques + enregistrements freesound (assets DeepFilterNet). Résultats
  mesurés : 0 faux positif en scan seul, 9 à 12 raccords sur 20 trouvés quand ils sont guidés par les cuts (les ratés
  sont surtout des sauts faibles devant la voix), 1 à 4 fausses détections sur 20 cuts vidéo posés au hasard.
  **À recalibrer sur de vrais montages TikTok/CapCut.**
- Seuils de cuts (`K_MAD = 6`) non calibrés sur de vraies vidéos.
- Pas encore testé sur de vrais téléphones (jalon 9 de la spec) : iOS Safari (mémoire), Android milieu de gamme.
- `share_target` Android (import « Partager vers ») : prévu plus tard.
