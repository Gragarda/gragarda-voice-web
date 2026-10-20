import { extractAudio, remux } from './media/ffmpeg';
import { AbPlayer } from './ui/abPlayer';

const MAX_SECONDS = 180, MAX_BYTES = 500e6; // limites v1 : memoire de Safari iOS

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['home', 'preset', 'work', 'result', 'error'];
const show = (id: string) => screens.forEach(s => ($(s).hidden = s !== id));

// Presets : core/presets/*.json, lus tels quels (le coeur C++ ignore label/hint)
const presets = Object.values(import.meta.glob('../../core/presets/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
  .map(json => ({ json, ...(JSON.parse(json) as { name: string; label: string; hint: string }) }));
const ORDER = ['voix-chaude', 'piece-qui-resonne', 'dehors-vent', 'voix-off'];
presets.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));

// Capacites : jamais de page blanche, toujours un mode degrade
const caps = {
  wasm: typeof WebAssembly === 'object',
  cuts: typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined',
};

let file: File | null = null;
let player: AbPlayer | null = null;
let outUrl = '';

function fail(msg: string) {
  $('error-text').textContent = msg;
  show('error');
}

function reset() {
  player?.close();
  player = null;
  if (outUrl) URL.revokeObjectURL(outUrl);
  outUrl = '';
  file = null;
  ($('file') as HTMLInputElement).value = '';
  $('home-error').hidden = true;
  show('home');
}
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', reset));

function videoDuration(f: File): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(f);
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(NaN); // format illisible par le lecteur : ffmpeg tranchera
    v.src = url;
  });
}

$('file').addEventListener('change', async e => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const err = $('home-error');
  const tooLong = 'Vidéo trop longue pour le navigateur, coupe-la en plusieurs morceaux (3 minutes max).';
  if (!caps.wasm) { err.textContent = 'Ce navigateur est trop ancien. Essaie avec Safari ou Chrome à jour.'; err.hidden = false; return; }
  if (f.size > MAX_BYTES) { err.textContent = tooLong; err.hidden = false; return; }
  const d = await videoDuration(f);
  if (d > MAX_SECONDS + 0.5) { err.textContent = tooLong; err.hidden = false; return; }
  file = f;
  show('preset');
});

const cards = $('presets');
for (const p of presets) {
  const b = document.createElement('button');
  b.className = 'card';
  b.innerHTML = '<b></b><span></span>';
  b.querySelector('b')!.textContent = p.label;
  b.querySelector('span')!.textContent = p.hint;
  b.addEventListener('click', () => file && run(file, p.json));
  cards.appendChild(b);
}

// ---- Traitement ----
const STEPS = [
  ['read', 'Lecture'], ['cuts', 'Recherche des cuts'], ['pops', 'Plops'],
  ['analysis', 'Analyse'], ['processing', 'Traitement'], ['export', 'Export'],
] as const;
type Step = (typeof STEPS)[number][0];
const WEIGHT: Record<Step, number> = { read: 0.15, cuts: 0, pops: 0.1, analysis: 0.1, processing: 0.35, export: 0.3 };
const progress: Partial<Record<Step, number>> = {};

function setStep(step: Step, state: 'active' | 'done' | 'skipped', p = state === 'active' ? 0 : 1) {
  $('step-' + step).className = state;
  progress[step] = p;
  const total = STEPS.reduce((s, [k]) => s + WEIGHT[k] * (progress[k] ?? 0), 0);
  $('bar-fill').style.transform = `scaleX(${total})`;
}

function detectCuts(f: File): Promise<number[]> {
  if (!caps.cuts) return Promise.reject(new Error('WebCodecs absent'));
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker/cuts.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = e => {
      if (e.data.progress !== undefined) return;
      w.terminate();
      e.data.cuts ? resolve(e.data.cuts) : reject(new Error(e.data.error));
    };
    w.onerror = ev => { w.terminate(); reject(new Error(ev.message)); };
    w.postMessage(f);
  });
}

function runDsp(audio: Float32Array, cuts: number[], preset: string): Promise<{ report: any; audio: Float32Array }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker/dsp.worker.ts', import.meta.url), { type: 'module' });
    let last: Step | null = null;
    w.onmessage = e => {
      if (e.data.stage) {
        if (last) setStep(last, 'done');
        setStep(last = e.data.stage as Step, 'active');
        return;
      }
      w.terminate();
      if (last) setStep(last, 'done');
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
    };
    w.onerror = ev => { w.terminate(); reject(new Error(ev.message)); };
    w.postMessage({ audio, cuts, preset }, [audio.buffer]);
  });
}

async function run(f: File, preset: string) {
  $('steps').innerHTML = STEPS.map(([k, label]) => `<li id="step-${k}">${label}</li>`).join('');
  for (const k in progress) delete progress[k as Step];
  setStep('read', 'active');
  show('work');
  try {
    // A et B en parallele ; si B echoue, le coeur passe en mode "scan seul"
    setStep('cuts', 'active');
    const cutsP = detectCuts(f).then(
      c => { setStep('cuts', 'done'); return c; },
      () => { setStep('cuts', 'skipped'); return [] as number[]; });
    const original = await extractAudio(f, p => setStep('read', 'active', p));
    setStep('read', 'done');
    const cuts = await cutsP;
    console.info('cuts video (s)', cuts);
    const { report, audio } = await runDsp(original.slice(), cuts, preset);
    setStep('export', 'active');
    const out = await remux(f, audio, p => setStep('export', 'active', p));
    setStep('export', 'done');
    showResult(out, original, audio, report.popsRemoved as number);
  } catch (err) {
    console.error(err);
    fail(err instanceof Error && err.message.startsWith('Cette') ? err.message
      : 'Le traitement a échoué. Si la vidéo est longue, coupe-la en morceaux plus courts et réessaie.');
  }
}

// ---- Resultat ----
function showResult(out: Blob, before: Float32Array, after: Float32Array, pops: number) {
  outUrl = URL.createObjectURL(out);
  const video = $<HTMLVideoElement>('player');
  video.src = outUrl;
  player = new AbPlayer(video, before, after);
  setAb(true);
  $('pops').textContent = pops === 0 ? '' : pops === 1 ? '1 plop supprimé' : `${pops} plops supprimés`;
  const name = (file?.name.replace(/\.[^.]+$/, '') || 'video') + '-gragarda.mp4';
  const outFile = new File([out], name, { type: 'video/mp4' });
  const dl = $<HTMLAnchorElement>('download');
  dl.href = outUrl;
  dl.download = name;
  const canShare = !!navigator.canShare?.({ files: [outFile] });
  $('share').hidden = !canShare;
  $('share').onclick = () => navigator.share({ files: [outFile] }).catch(() => { /* partage annule */ });
  show('result');
}

function setAb(after: boolean) {
  player?.setAfter(after);
  $('ab-after').classList.toggle('on', after);
  $('ab-before').classList.toggle('on', !after);
  $('ab-after').setAttribute('aria-pressed', String(after));
  $('ab-before').setAttribute('aria-pressed', String(!after));
}
$('ab-before').addEventListener('click', () => setAb(false));
$('ab-after').addEventListener('click', () => setAb(true));

// PWA : cache hors ligne apres la premiere visite
if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('sw.js').catch(() => {});
