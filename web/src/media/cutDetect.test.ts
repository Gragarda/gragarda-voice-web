// npm test : cuts francs detectes, mouvement de camera rapide sans cut -> zero cut (spec 5.5)
import assert from 'node:assert/strict';
import { CutDetector, THUMB_H, THUMB_W } from './cutDetect.ts';

// Scene = degrade + motif aleatoire, vue a travers une camera qui panote de `pan` pixels par image
function scene(seed: number, pan: number, n: number): Uint8Array {
  const W = 400, g = new Uint8Array(THUMB_W * THUMB_H);
  for (let y = 0; y < THUMB_H; y++)
    for (let x = 0; x < THUMB_W; x++) {
      const u = (x + pan * n) % W;
      const h = Math.sin(u * 0.07 + seed) * Math.cos(y * 0.2 + seed * 3);
      g[y * THUMB_W + x] = Math.max(0, Math.min(255, 128 + 60 * h + 30 * Math.sin(u * 0.31 * seed) + seed * 10));
    }
  return g;
}

function run(frames: (n: number) => Uint8Array, count: number, fps = 30): number[] {
  const d = new CutDetector();
  for (let n = 0; n < count; n++) d.push(n / fps, frames(n));
  return d.cuts();
}

// 3 plans de 2 s, camera qui bouge doucement : 2 cuts a 2 s et 4 s
const cuts = run(n => scene(1 + Math.floor(n / 60), 1, n), 180);
console.log('cuts', cuts);
assert.equal(cuts.length, 2);
assert.ok(Math.abs(cuts[0] - 2) < 0.04 && Math.abs(cuts[1] - 4) < 0.04);

// Panoramique rapide (8 px / image a 64 px de large) sans cut : zero cut
const pan = run(n => scene(2, 8, n), 180);
console.log('panoramique', pan);
assert.equal(pan.length, 0);
console.log('OK');
