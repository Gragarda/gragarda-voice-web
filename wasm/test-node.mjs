// Jalon 5 : le WASM donne le meme resultat que gv-cli.
// node wasm/test-node.mjs in.wav cli-out.wav cli-report.json preset.json [cuts.json]
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import createGv from '../web/src/wasm/gv.js';

// WAV float 32 (ce que gv-cli et test_offline --wav ecrivent)
function readWav(path) {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 12, nch = 0, sr = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') { nch = dv.getUint16(p + 10, true); sr = dv.getUint32(p + 12, true); }
    if (id === 'data') {
      const n = size / 4 / nch, ch = Array.from({ length: nch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) ch[c][i] = dv.getFloat32(p + 8 + (i * nch + c) * 4, true);
      return { sr, ch };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('WAV invalide');
}

const [inWav, cliWav, cliReport, presetPath, cutsPath] = process.argv.slice(2);
const gv = await createGv();
const input = readWav(inWav);
const stages = [];
const cuts = cutsPath ? JSON.parse(readFileSync(cutsPath, 'utf8')) : [];
const { report, channels } = gv.run(input.ch, input.sr, cuts, readFileSync(presetPath, 'utf8'), s => stages.push(s), undefined);
assert.deepEqual(stages, ['pops', 'analysis', 'processing']);

const cli = readWav(cliWav);
let maxDiff = 0;
for (let c = 0; c < cli.ch.length; c++)
  for (let i = 0; i < cli.ch[c].length; i++) maxDiff = Math.max(maxDiff, Math.abs(cli.ch[c][i] - channels[c][i]));
const a = JSON.parse(report), b = JSON.parse(readFileSync(cliReport, 'utf8'));
console.log(`plops ${a.popsRemoved}/${b.popsRemoved}, LUFS ${a.process.outLufs}/${b.process.outLufs}, ecart max ${maxDiff.toExponential(2)}`);
assert.equal(a.popsRemoved, b.popsRemoved);
assert.ok(Math.abs(a.process.outLufs - b.process.outLufs) < 0.05);
assert.ok(maxDiff < 1e-3, 'sortie audio differente'); // flottants MSVC /fp vs clang : pas bit a bit
console.log('OK');
