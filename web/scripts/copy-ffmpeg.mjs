// Copie les coeurs ffmpeg.wasm dans public/ : servis par l'app elle-meme (meme origine, mis en cache
// par le service worker -> hors ligne apres la premiere visite). st = monothread, mt = multithread (COOP/COEP).
import { cpSync, mkdirSync } from 'node:fs';

for (const [pkg, dir] of [['core', 'st'], ['core-mt', 'mt']]) {
  mkdirSync(`public/ffmpeg/${dir}`, { recursive: true });
  cpSync(`node_modules/@ffmpeg/${pkg}/dist/esm`, `public/ffmpeg/${dir}`, { recursive: true });
}
