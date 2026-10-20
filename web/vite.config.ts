import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // GitHub Pages : chemins relatifs, marche a la racine comme dans un sous-dossier
  server: {
    fs: { allow: ['..'] }, // presets dans ../core/presets
    // en dev, isolation cross-origin comme la Transform Rule Cloudflare en prod (ffmpeg multithread)
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] }, // son worker interne doit rester un fichier separe
});
