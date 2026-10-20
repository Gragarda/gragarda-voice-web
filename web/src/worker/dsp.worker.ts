// Etapes C-F : coeur C++ (WASM) hors du thread UI.
// Entrant : { audio: Float32Array (mono 48 kHz), cuts: number[], preset: string }
// Sortant : { stage } pendant le calcul, puis { report, audio } (audio transfere, pas copie).
import createGv from '../wasm/gv.js';

const gvReady = createGv();

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; cuts: number[]; preset: string }>) => {
  try {
    const gv = await gvReady;
    const { report, channels } = gv.run([e.data.audio], 48000, e.data.cuts, e.data.preset,
      (stage: string) => self.postMessage({ stage }));
    const audio: Float32Array = channels[0];
    (self as unknown as Worker).postMessage({ report: JSON.parse(report), audio }, [audio.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
