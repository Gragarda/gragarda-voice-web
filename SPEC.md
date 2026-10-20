# Gragarda Voice Web — Spécification de démarrage

> Document de référence pour Claude Code. À placer à la racine du repo (`gragarda-voice-web`).
> Les décisions marquées **[À VALIDER]** sont des hypothèses par défaut que Romain peut changer.

---

## 1. Le produit en une phrase

Une **web app gratuite** (PWA hébergée sur GitHub Pages) qui prend une vidéo déjà tournée sur téléphone, **répare et embellit la voix**, puis la renvoie prête à publier sur TikTok / Instagram / CapCut, **sans réencoder l'image**.

**Tout le traitement se fait dans le navigateur du téléphone.** Zéro serveur, zéro stockage, zéro coût. La vidéo ne quitte jamais l'appareil (argument RGPD et confiance à mettre en avant sur la page).

### Parcours utilisateur (3 gestes)

1. **Choisir** une vidéo (bouton qui ouvre la galerie du téléphone).
2. **Choisir un preset** : "Voix chaude", "Pièce qui résonne", "Dehors / vent", "Voix-off".
3. **Partager** : le menu de partage natif du téléphone s'ouvre (TikTok, Insta, CapCut, Enregistrer dans la galerie…).

Écran de prévisualisation : lecteur vidéo + **bouton Avant / Après** (bascule instantanée entre audio original et traité, à la même position de lecture). C'est l'argument de vente, il doit être fluide.

### Hors périmètre v1
- Traitement temps réel / micro virtuel (impossible sur iOS et Android sans root).
- Montage vidéo, sous-titres, musique.
- Compte utilisateur, serveur, cloud, paiement.

### Feuille de route produit
- **v1 — Web app gratuite (ce document)** : valider l'algo, faire connaître le nom.
- **v2 — App native iOS / Android** (optionnelle, éventuellement payante) : même cœur C++, avec en plus l'extension "Partager vers Gragarda Voice" et une meilleure gestion des longues vidéos.

---

## 2. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Hébergement | **GitHub Pages**, derrière Cloudflare (sous-domaine type `app.voice.gragarda.fr` [À VALIDER]) | Gratuit ; Cloudflare permet d'ajouter les en-têtes HTTP nécessaires |
| Type d'app | **PWA** (manifest + service worker) | Installable sur l'écran d'accueil, fonctionne hors ligne |
| Cœur DSP | **C++17 portable**, compilé en **WebAssembly** via Emscripten | Rapide ; le même code servira à l'app native en v2 |
| Démux / remux | **ffmpeg.wasm** (`@ffmpeg/ffmpeg`) | Extraire l'audio, puis recoller l'audio traité avec `-c:v copy` |
| Lecture des images (cuts) | **WebCodecs** (`VideoDecoder`) ; repli : `<video>` + `canvas` en sautant d'image en image | Rapide et sans réencodage |
| Partage | **Web Share API** niveau 2 (`navigator.share({ files })`) ; repli : téléchargement du fichier | Ouvre la vraie feuille de partage du téléphone |
| UI | TypeScript + framework léger (Svelte ou Preact) [À VALIDER] + Vite | Bundle petit, chargement rapide en 4G |
| Loudness | libebur128 (MIT), compilée en WASM | Mesure LUFS / true peak conforme EBU R128 |
| Débruitage | RNNoise (BSD), compilé en WASM | Léger, tourne sans problème dans un navigateur |
| Calcul | Tout dans un **Web Worker** | L'interface ne se fige jamais pendant le traitement |

### Règle d'or vidéo
La piste vidéo est **copiée telle quelle** (`-c:v copy`) : zéro perte de qualité, export en quelques secondes. Seule la piste audio est remplacée (AAC 48 kHz, 192 kbps).

### Contraintes navigateur à respecter
1. **En-têtes COOP / COEP** : nécessaires pour `SharedArrayBuffer` (ffmpeg.wasm multithread et WASM avec threads). GitHub Pages ne permet pas de les définir. Solution principale : **Transform Rule Cloudflare** qui ajoute
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`

   Repli : `coi-serviceworker`. Repli ultime : ffmpeg.wasm monothread (le remux en `-c:v copy` reste rapide).
   **L'app doit détecter `crossOriginIsolated` au démarrage et choisir automatiquement le mode.**
2. **Mémoire limitée sur Safari iOS** : durée max v1 = **3 minutes** et taille max ≈ **500 Mo** (couvre TikTok / Reels). Au-delà, message clair : "Vidéo trop longue pour le navigateur, coupe-la en plusieurs morceaux". Le DSP traite l'audio **par blocs**, jamais tout le fichier converti d'un coup en plusieurs copies.
3. **Pas d'import depuis "Partager vers"** sur iOS : l'utilisateur ouvre l'app et choisit sa vidéo. Sur Android, prévoir plus tard la `share_target` du manifest PWA (supportée par Chrome).
4. **Compatibilité visée** : Safari iOS 17+, Chrome Android récent, et navigateurs desktop (bonus gratuit : ça marche aussi sur PC).

---

## 3. Architecture du repo

```
gragarda-voice-web/
├── core/                    # C++ portable, AUCUNE dépendance navigateur ni OS
│   ├── include/gv/
│   │   ├── Pipeline.h       # point d'entrée unique
│   │   ├── AudioBuffer.h
│   │   ├── PopDetector.h
│   │   ├── PopRepair.h
│   │   ├── Analysis.h       # passe 1 : bruit, loudness, stats
│   │   └── Processing.h     # passe 2 : chaîne de traitement
│   ├── src/
│   ├── presets/*.json
│   └── tests/               # tests unitaires + fichiers de test générés
├── wasm/                    # bindings Emscripten (embind) + script de build
├── web/                     # PWA : UI, Web Worker, intégration ffmpeg.wasm + WebCodecs
│   ├── src/
│   │   ├── worker/          # orchestre tout le pipeline hors du thread UI
│   │   ├── media/           # extraction audio, détection des cuts, remux
│   │   └── ui/
│   ├── public/manifest.webmanifest
│   └── vite.config.ts
├── tools/
│   ├── gv-cli/              # ligne de commande : wav + cuts.json en entrée → wav + rapport JSON
│   └── cut-calibration/     # prototype Python + OpenCV pour calibrer les seuils de cuts
└── .github/workflows/       # build WASM + web, déploiement GitHub Pages
```

**`gv-cli` est prioritaire** : il permet de développer et tester tout le DSP sur le PC avec des fichiers réels, avant même d'avoir l'interface. Tout le traitement doit être validable sans navigateur.

La **détection des cuts** est écrite en TypeScript dans `web/src/media/` (elle travaille sur des images), et reproduite à l'identique dans `tools/cut-calibration/` pour calibrer les seuils.

---

## 4. Pipeline de traitement

Le traitement complet se fait **hors temps réel**, sur le fichier entier. On peut donc regarder en avant et en arrière autant qu'on veut.

```
Vidéo choisie par l'utilisateur
   │
   ├─► [A] ffmpeg.wasm : piste audio → PCM float 48 kHz
   ├─► [B] WebCodecs : images miniatures → liste de timestamps de cuts
   │
   ▼            (tout ce qui suit = cœur C++ en WASM)
[C] Détection des plops (audio, guidée par les cuts de B)
[D] Réparation des plops
   │
   ▼
[E] PASSE 1 – Analyse : profil de bruit, loudness, plage dynamique, sibilance
   │
   ▼
[F] PASSE 2 – Traitement, paramètres calculés à partir de E
   │
   ▼
[G] ffmpeg.wasm : vidéo d'origine (-c:v copy) + nouvel audio AAC → .mp4
   │
   ▼
[H] Avant / Après → Web Share API
```

A et B peuvent tourner en parallèle.

Barre de progression avec étapes nommées : **Lecture → Recherche des cuts → Plops → Analyse → Traitement → Export**.

### Ordre important
**La réparation des plops se fait AVANT tout traitement dynamique.** Un compresseur et une normalisation de loudness amplifient les plops ; si on les répare après, ils sont plus gros et plus difficiles à masquer.

---

## 5. Détection et suppression des plops aux changements de scène

### 5.1 Pourquoi il y a un plop
Quand on coupe deux clips bout à bout, la forme d'onde audio "saute" d'une valeur à une autre entre deux échantillons consécutifs (par exemple de +0,3 à −0,2). Ce saut instantané est entendu comme un **clic sec** ou un **plop sourd** si le niveau moyen (offset DC) change aussi. Les apps de montage mobiles ne posent presque jamais de micro fondu à cet endroit.

### 5.2 Étape B — trouver les changements de scène (image)

Décoder chaque image avec WebCodecs et la réduire en **miniature 64×36 en niveaux de gris** (via `OffscreenCanvas`), pas besoin de plus. Libérer chaque `VideoFrame` immédiatement après usage (`frame.close()`), sinon la mémoire explose sur iOS.

Pour chaque image `n`, calculer une distance avec l'image `n-1` :
- `d_hist` = distance entre histogrammes de luminance (32 cases), distance chi-carré ;
- `d_pix` = différence absolue moyenne des pixels.

Score combiné : `s(n) = 0.6 * d_hist_norm + 0.4 * d_pix_norm`.

Seuil **adaptatif** : un cut est déclaré si `s(n) > médiane(s sur ±1 s) + k × MAD` avec `k = 6` (à calibrer), et au moins 0,25 s après le cut précédent. Sans seuil adaptatif, une vidéo où la caméra bouge beaucoup produit des faux positifs partout.

Sortie : liste de timestamps en secondes, transmise au cœur C++. Le cœur ne touche jamais à l'image.

**Pourquoi l'image aide** : elle dit *où chercher*, ce qui permet d'être plus sensible à ces endroits sans détruire les consonnes explosives ("p", "t", "k") ailleurs.

**Si WebCodecs n'est pas disponible** ou échoue : on saute l'étape B, le cœur passe en mode "scan seul" (section 5.3) et l'app reste fonctionnelle.

### 5.3 Étape C — détecter le plop (audio)

Pour chaque cut au temps `t`, fenêtre de recherche `[t − 60 ms, t + 60 ms]` (le décalage audio/vidéo vaut souvent jusqu'à une image, soit 33 ms à 30 fps).

On calcule pour chaque échantillon `i` :
1. **Saut de discontinuité** : `j(i) = |x[i] − prédiction(i)|`, où la prédiction est une extrapolation linéaire à partir des 2 échantillons précédents (`2·x[i−1] − x[i−2]`). Dans une voix normale, la forme d'onde est lisse et cette erreur est petite ; au point de coupe, elle explose.
2. **Référence locale** : médiane de `j` sur les 20 ms autour (en excluant la zone testée).
3. **Saut de niveau moyen (DC)** : moyenne sur 5 ms avant vs 5 ms après.

Un plop est déclaré si :
- `j(i) > 8 × référence locale` (seuil "zone de cut"), **ou**
- le saut DC dépasse 0,02 (−34 dBFS environ).

**Hors des zones de cut**, on lance aussi un scan sur tout le fichier, mais avec un seuil beaucoup plus strict (`× 20`) pour attraper les plops de montage dont le cut vidéo n'a pas été détecté (par exemple deux plans quasi identiques), sans toucher aux consonnes.

Sortie : pour chaque plop, `{ position_échantillon, type: CLIC | DC_STEP | LES_DEUX, sévérité, origine: CUT | SCAN }`.

### 5.4 Étape D — réparer

Selon le type :

| Type | Réparation |
|---|---|
| **Clic** (saut ponctuel) | Supprimer 1 à 3 ms autour du point et **reconstruire** par interpolation AR/LPC (ordre ~32) à partir de ce qui précède et suit. Pour une première version, une interpolation cubique d'Hermite sur ≤ 1 ms suffit. |
| **Saut DC** | Appliquer une rampe de correction de l'offset sur 10–20 ms pour raccorder les deux niveaux, puis le passe-haut de la passe 2 nettoie le reste. |
| **Les deux** | Fondu croisé à puissance constante (equal-power) de 8 ms centré sur le point de coupe, après correction DC. |
| **Coupe en plein silence** | Micro fondu sortant / entrant de 5 ms : le plus simple et totalement inaudible. |

Garde-fou : après réparation, recalculer `j(i)` sur la zone. Si le pic dépasse toujours 3 × la référence, passer à la méthode suivante (interpolation → fondu croisé).

Le rapport de traitement liste chaque plop réparé avec son horodatage. L'app affiche à la fin : **"3 plops supprimés"** (petit argument de fierté pour l'utilisateur).

### 5.5 Fichiers de test (à générer dans `core/tests/`)
- Voix enregistrée, coupée et recollée à 5 endroits sans fondu.
- Même chose avec un saut d'offset DC volontaire.
- Coupe en plein silence.
- Phrase riche en "p" et "t" **sans** aucune coupe → doit ressortir avec **zéro** plop détecté (test anti-faux positif).
- Vidéo avec mouvement de caméra rapide sans cut → zéro cut détecté.

---

## 6. Passe 1 — Analyse

Sur la piste déjà dé-plopée, on mesure :
- **Profil de bruit** : on repère les segments les plus calmes (20 % des fenêtres de 50 ms les moins énergétiques), on en tire le spectre du bruit de fond et son niveau.
- **Loudness intégrée** (LUFS) et **true peak**, via libebur128.
- **Plage dynamique** : écart entre le 10e et le 95e percentile du niveau court terme. Ça règle la force du compresseur.
- **Énergie de sibilance** : ratio d'énergie 5–9 kHz sur les passages de voix. Ça règle le de-esser.
- **Résonance de la pièce** (estimation simple de la queue de réverbération après les fins de mots), utilisée par le preset "Pièce qui résonne".

Sortie : un objet `AnalysisResult` sérialisable en JSON, inclus dans le rapport.

---

## 7. Passe 2 — Traitement

Chaîne dans l'ordre :

1. **Passe-haut** 80 Hz (pente 18 dB/oct) : supprime les grondements et les restes de DC.
2. **Débruitage** (RNNoise), dosage selon le niveau de bruit mesuré. Pas de débruitage si le fond est déjà propre : ça évite l'effet "voix sous l'eau".
3. **EQ** selon le preset (ex. "Voix chaude" : +2 dB à 150 Hz, −2 dB à 400 Hz, +2 dB en étagère à 10 kHz).
4. **De-esser** dont le seuil dépend de l'analyse.
5. **Compresseur** (ratio 3:1, attaque 10 ms, relâchement 120 ms), seuil calculé pour réduire la plage dynamique mesurée.
6. **Normalisation de loudness** vers **−14 LUFS** intégrés (cible des réseaux sociaux).
7. **Limiteur true peak** à **−1 dBTP**, avec lookahead (on peut regarder en avant puisqu'on est hors temps réel).

Les paramètres de chaque preset sont dans `core/presets/*.json`, pas codés en dur.

**Note RNNoise** : il fonctionne à 48 kHz par trames de 10 ms, ce qui tombe bien avec le format interne.

---

## 8. Web app (v1)

### Écrans
1. **Accueil** : grand bouton "Choisir une vidéo", phrase "Ta vidéo ne quitte jamais ton téléphone", lien vers voice.gragarda.fr (le plugin OBS).
2. **Preset** : 4 grosses cartes avec un nom et une phrase concrète ("Tu as filmé dans une pièce vide qui fait écho").
3. **Traitement** : barre de progression avec les étapes nommées.
4. **Résultat** : lecteur vidéo, interrupteur **Avant / Après**, mention "X plops supprimés", bouton **Partager**, bouton secondaire **Télécharger**.

### Avant / Après
Deux éléments audio (ou deux `AudioBufferSourceNode` via Web Audio) synchronisés sur le `<video>` muet ; la bascule change seulement les gains. Pas de rechargement, pas de saut de position.

### Partage
`navigator.canShare({ files: [file] })` → `navigator.share({ files: [file] })`. Si non supporté : téléchargement direct du `.mp4`.

### PWA
- `manifest.webmanifest` : nom, icônes aux couleurs Gragarda, `display: standalone`.
- Service worker : met en cache l'app, le WASM et ffmpeg.wasm (~30 Mo) après la première visite → fonctionne ensuite hors ligne.
- Écran d'aide "Ajouter à l'écran d'accueil" (instructions différentes iOS / Android).

### Détection des capacités au démarrage
Vérifier `crossOriginIsolated`, `WebAssembly`, `VideoDecoder`, `navigator.share`, et adapter le mode (multithread ou non, cuts ou scan seul, partage ou téléchargement). Jamais de page blanche : toujours un mode dégradé fonctionnel.

### Statistiques (optionnel)
Si besoin de mesurer l'usage : un compteur sans cookie et respectueux de la vie privée (ex. Cloudflare Web Analytics, gratuit). Aucune donnée audio ou vidéo envoyée, jamais.

---

## 9. Ordre de développement (jalons)

1. **`gv-cli` + cœur C++ minimal** : lecture/écriture WAV, passe-haut, normalisation −14 LUFS, limiteur. ✅ quand un WAV ressort à −14 LUFS / −1 dBTP mesurés.
2. **Détection + réparation des plops (audio seul, mode scan)** sur les fichiers de test. ✅ quand tous les tests de la section 5.5 passent, y compris le zéro faux positif.
3. **Calibration des cuts** avec `tools/cut-calibration/` (Python + OpenCV) sur de vraies vidéos TikTok, puis mode "guidé par les cuts" dans le cœur.
4. **Passe 1 + passe 2 complètes** avec les 4 presets.
5. **Build WASM** du cœur + tests dans Node pour vérifier un résultat identique à `gv-cli`.
6. **Web app minimale** : choisir vidéo → ffmpeg.wasm extrait l'audio → traitement → remux → téléchargement. Déployée sur GitHub Pages avec la Transform Rule Cloudflare.
7. **Détection des cuts WebCodecs** dans le navigateur.
8. **Avant / Après + Web Share + PWA**.
9. **Tests sur vrais appareils** : iPhone récent, iPhone ancien (mémoire), Android milieu de gamme.
10. *(v2, plus tard)* App native avec le même `core/`.

---

## 10. Questions ouvertes

- **[À VALIDER]** Sous-domaine : `app.voice.gragarda.fr`, ou intégré directement à `voice.gragarda.fr/app` ?
- **[À VALIDER]** Framework UI : Svelte ou Preact ?
- Peut-on reprendre directement du code DSP de `gragarda-voice` (plugin OBS) dans `core/` ? Si oui, il faut l'isoler de toute dépendance OBS.
- ~~Repo séparé ou dossier dans `gragarda-voice` ?~~ **Décidé : repo séparé `gragarda-voice-web`.** Un frontend par usage (OBS, Wave Link, web/mobile).
- Partage du DSP entre repos : copie indépendante dans chaque repo, ou à terme un repo `gragarda-voice-core` intégré en sous-module git ?
- Lien de don (Ko-fi, Tipeee…) ou mention du plugin OBS sur l'écran de résultat ?
