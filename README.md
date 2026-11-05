# Gragarda Voice Web — fix the voice of your phone videos, in the browser

**Gragarda Voice:** [OBS filter](https://github.com/Gragarda/gragarda-voice) · [VST3 / standalone](https://github.com/Gragarda/gragarda-voice-vst) · **Web app** · [DSP core](https://github.com/Gragarda/gragarda-voice-core)

🇫🇷 [Version française](#version-française)

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/gragarda)

Gragarda Voice is free and open source. If it helps you, you can support its development on [Ko-fi](https://ko-fi.com/gragarda).

A free web app (PWA) that repairs and enhances the voice of a phone video, then gives it back ready to post,
**without re-encoding the picture**. All processing happens in the browser: the video never leaves your device.
**Use the app: https://voice.gragarda.fr/app**

Full specification (French): [SPEC.md](SPEC.md).

## Made with AI
To be transparent: **most of this app's code was written by an AI** (Claude, by Anthropic), under my direction.
I chose the processing chain, the settings and the features, and tested every version by ear.
The noise-removal engines it uses (DeepFilterNet, RNNoise) are third-party open-source projects not written by AI.
Bugs or doubts? Please open an [issue](../../issues).

## Noise removal

The web app uses **DeepFilterNet 3** (~10 MB compressed, loaded once then cached): it separates speech from everything
else, including a camera operator breathing near the mic while others speak. If it fails to load, the core falls back
to RNNoise (dosed according to the measured noise). `gv-cli` uses RNNoise.
Before it, stable tonal lines in the background noise (hiss, fan, mains hum) are detected and notched out.
After it, a slow leveler brings every speaker to the same volume, near or far from the mic (±10 dB).

## Repository layout

| Folder | Contents |
|---|---|
| `core/` | submodule [gragarda-voice-core](https://github.com/Gragarda/gragarda-voice-core) (`main` branch): `offline/` = whole-file pipeline (plosives, analysis, processing), `presets/*.json` |
| `wasm/` | Emscripten bindings (`Module.run`), Node test "WASM = gv-cli", `dfn/` = DeepFilterNet 3 in WASM (Rust, embedded model) |
| `web/` | Vite + TypeScript PWA: UI, workers (DSP, WebCodecs cuts), ffmpeg.wasm |
| `tools/gv-cli/` | `gv-cli in.wav out.wav --preset p.json [--cuts cuts.json] [--report r.json]` |
| `tools/cut-calibration/` | same cut detection as in TS, in Python + ffmpeg, to calibrate thresholds |

## Build

```sh
git submodule update --init
# native: core tests + gv-cli
cmake -S . -B build -DGV_CORE_TESTS=ON && cmake --build build --config Release
ctest --test-dir build/core -C Release
# WASM (emsdk activated) -> web/src/wasm/
emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm
# DeepFilterNet (rustup target add wasm32-unknown-unknown ; cargo install wasm-bindgen-cli --version 0.2.92)
cd wasm/dfn && cargo build --release --target wasm32-unknown-unknown &&   wasm-bindgen --target web --out-dir ../../web/src/wasm/dfn target/wasm32-unknown-unknown/release/gv_dfn.wasm && cd ../..
# web
cd web && npm ci && npm test && npm run dev
```

CI (`.github/workflows/build.yml`) runs all of it and deploys `web/dist` to GitHub Pages.

## Deployment: COOP / COEP headers

GitHub Pages cannot add headers. Behind Cloudflare, a Transform Rule (Modify response header) on the app's subdomain adds:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers the app still works: `crossOriginIsolated` is false, so ffmpeg.wasm runs single-threaded
(the `-c:v copy` remux stays fast). The DSP is single-threaded in every case.

## Decisions (open points of the spec)

- **No UI framework** (TypeScript + DOM): 4 screens, app JS ≈ 14 KB. Svelte or Preact will be justified if the UI grows.
- **Audio processed in mono** (downmix), re-encoded as AAC 48 kHz stereo 192 kbps.
- **No coi-serviceworker**: single-threaded mode is enough as a fallback.
- **Cut calibration without OpenCV**: ffmpeg already decodes and downscales the frames.

## Known limitations

- Plosive detection calibrated on synthetic voices + freesound recordings (DeepFilterNet assets). Measured results:
  0 false positives in scan-only mode, 9 to 12 splices out of 20 found when guided by cuts (misses are mostly weak
  jumps under the voice), 1 to 4 false detections out of 20 randomly placed video cuts.
  **To be recalibrated on real TikTok/CapCut edits.**
- Cut thresholds (`K_MAD = 6`) not calibrated on real videos.
- Not yet tested on real phones (spec milestone 9): iOS Safari (memory), mid-range Android.
- Android `share_target` ("Share to" import): planned later.

---

# Version française

🇬🇧 [English version](#gragarda-voice-web--fix-the-voice-of-your-phone-videos-in-the-browser)

**Gragarda Voice :** [Filtre OBS](https://github.com/Gragarda/gragarda-voice) · [VST3 / autonome](https://github.com/Gragarda/gragarda-voice-vst) · **Application web** · [Cœur DSP](https://github.com/Gragarda/gragarda-voice-core)

[![Me soutenir sur Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/gragarda)

Gragarda Voice est gratuit et open source. S'il vous est utile, vous pouvez soutenir son développement sur [Ko-fi](https://ko-fi.com/gragarda).

Web app gratuite (PWA) qui répare et embellit la voix d'une vidéo de téléphone, puis la renvoie prête à publier,
**sans réencoder l'image**. Tout le traitement se fait dans le navigateur : la vidéo ne quitte jamais l'appareil.
**Utiliser l'app : https://voice.gragarda.fr/app**

Spécification complète : [SPEC.md](SPEC.md).

## Fait avec l'IA
Par transparence : **l'essentiel du code de cette app a été écrit par une IA** (Claude, d'Anthropic), sous ma direction.
J'ai choisi la chaîne de traitement, les réglages et les fonctionnalités, et j'ai testé chaque version à l'écoute.
Les moteurs de débruitage utilisés (DeepFilterNet, RNNoise) sont des projets open source tiers, non écrits par une IA.
Un bug ou un doute ? Ouvrez une [issue](../../issues).

## Débruitage

Le web utilise **DeepFilterNet 3** (~10 Mo compressés, chargé une fois puis en cache) : il sépare la parole de tout le
reste, y compris un caméraman qui respire près du micro pendant que d'autres parlent. S'il ne se charge pas, le cœur
retombe sur RNNoise (dosé selon le bruit mesuré). `gv-cli` utilise RNNoise.
Avant lui, les raies tonales stables du bruit de fond (sifflement, ventilation, secteur) sont repérées et coupées.
Après, un nivellement lent ramène chaque personne au même volume, qu'elle soit près ou loin du micro (±10 dB).

## Organisation

| Dossier | Contenu |
|---|---|
| `core/` | submodule [gragarda-voice-core](https://github.com/Gragarda/gragarda-voice-core) (branche `main`) : `offline/` = pipeline fichier entier (plops, analyse, traitement), `presets/*.json` |
| `wasm/` | bindings Emscripten (`Module.run`), test Node « WASM = gv-cli », `dfn/` = DeepFilterNet 3 en WASM (Rust, modèle intégré) |
| `web/` | PWA Vite + TypeScript : UI, workers (DSP, cuts WebCodecs), ffmpeg.wasm |
| `tools/gv-cli/` | `gv-cli in.wav out.wav --preset p.json [--cuts cuts.json] [--report r.json]` |
| `tools/cut-calibration/` | même détection de cuts qu'en TS, en Python + ffmpeg, pour calibrer les seuils |

## Build

Voir les commandes de la [section Build anglaise](#build) (identiques).

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
