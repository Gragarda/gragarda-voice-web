// Detection des changements de scene sur miniatures 64x36 en niveaux de gris (spec 5.2).
// Reproduit a l'identique dans tools/cut-calibration/cut_detect.py pour calibrer les seuils.

export const THUMB_W = 64, THUMB_H = 36;
const BINS = 32;
export const K_MAD = 6;          // a calibrer
export const MIN_GAP_S = 0.25;
export const MIN_SCORE = 0.08;   // plancher : video fixe -> MAD ~ 0, sinon le moindre bruit passerait

function histogram(g: Uint8Array): Float64Array {
  const h = new Float64Array(BINS);
  for (let i = 0; i < g.length; i++) h[g[i] >> 3]++;
  for (let i = 0; i < BINS; i++) h[i] /= g.length;
  return h;
}

// Score entre deux images : 0.6 * chi2 des histogrammes (0..1) + 0.4 * difference absolue moyenne (0..1)
export function frameScore(a: Uint8Array, b: Uint8Array): number {
  const ha = histogram(a), hb = histogram(b);
  let chi = 0;
  for (let i = 0; i < BINS; i++) {
    const s = ha[i] + hb[i];
    if (s > 0) chi += ((ha[i] - hb[i]) ** 2) / s;
  }
  let pix = 0;
  for (let i = 0; i < a.length; i++) pix += Math.abs(a[i] - b[i]);
  return 0.6 * (chi / 2) + 0.4 * (pix / a.length / 255);
}

function median(v: number[]): number {
  const s = [...v].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

// scores[n] = score entre l'image n-1 et n, au temps times[n] (s). Seuil adaptatif : mediane + K x MAD sur +-1 s.
export function findCuts(times: number[], scores: number[]): number[] {
  const cuts: number[] = [];
  let lo = 0, hi = 0;
  for (let n = 1; n < scores.length; n++) {
    while (times[lo] < times[n] - 1) lo++;
    while (hi + 1 < scores.length && times[hi + 1] <= times[n] + 1) hi++;
    const win: number[] = [];
    for (let k = lo; k <= hi; k++) if (k !== n && k > 0) win.push(scores[k]);
    const med = median(win);
    const mad = median(win.map(v => Math.abs(v - med)));
    const s = scores[n];
    if (s > med + K_MAD * mad && s > MIN_SCORE && (!cuts.length || times[n] - cuts[cuts.length - 1] >= MIN_GAP_S))
      cuts.push(times[n]);
  }
  return cuts;
}

// Accumule les miniatures image par image : ne garde que la precedente (memoire constante)
export class CutDetector {
  private prev: Uint8Array | null = null;
  readonly times: number[] = [];
  readonly scores: number[] = [];
  push(time: number, gray: Uint8Array) {
    this.times.push(time);
    this.scores.push(this.prev ? frameScore(this.prev, gray) : 0);
    this.prev = gray;
  }
  cuts(): number[] { return findCuts(this.times, this.scores); }
}

// RGBA -> gris (BT.601)
export function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const g = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < g.length; i++)
    g[i] = (rgba[4 * i] * 77 + rgba[4 * i + 1] * 150 + rgba[4 * i + 2] * 29) >> 8;
  return g;
}
