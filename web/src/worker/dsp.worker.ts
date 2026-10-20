// Etapes C-F : coeur C++ (WASM) hors du thread UI, debruitage DeepFilterNet 3 (WASM Rust).
// Entrant : { audio: Float32Array (mono 48 kHz), cuts: number[], preset: string }
// Sortant : { stage } pendant le calcul, puis { report, audio } (audio transfere, pas copie).
import createGv from '../wasm/gv.js';
import initDfn, { denoise } from '../wasm/dfn/gv_dfn.js';

const gvReady = createGv();
// DeepFilterNet (~10 Mo) : s'il ne se charge pas (memoire, vieux navigateur), le coeur retombe sur RNNoise
const dfnReady = initDfn().then(() => true, err => { console.warn('DeepFilterNet indisponible', err); return false; });

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; cuts: number[]; preset: string }>) => {
  try {
    const [gv, dfn] = await Promise.all([gvReady, dfnReady]);
    const { report, channels } = gv.run([e.data.audio], 48000, e.data.cuts, e.data.preset,
      (stage: string) => self.postMessage({ stage }),
      dfn ? (x: Float32Array) => denoise(x, 100) : undefined);
    const audio: Float32Array = channels[0];
    (self as unknown as Worker).postMessage({ report: JSON.parse(report), audio }, [audio.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
