import { extractAudio, remux } from './media/ffmpeg';
import { AbPlayer } from './ui/abPlayer';
import { LANGS, applyLang, currentLang, t } from './i18n';

const MAX_SECONDS = 180, MAX_BYTES = 500e6; // limites v1 : memoire de Safari iOS

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['home', 'preset', 'work', 'result', 'error'];
const show = (id: string) => screens.forEach(s => ($(s).hidden = s !== id));

// Presets : core/presets/*.json, passes tels quels au coeur ; nom et description affiches = i18n (p_<name>, h_<name>)
const presets = Object.values(import.meta.glob('../../core/presets/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
  .map(json => ({ json, name: (JSON.parse(json) as { name: string }).name }));
const ORDER = ['face-camera', 'voiture', 'dehors', 'a-plusieurs', 'piece-qui-resonne'];
presets.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));

// Capacites : jamais de page blanche, toujours un mode degrade
const caps = {
  wasm: typeof WebAssembly === 'object',
  cuts: typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined',
};

let file: File | null = null;
let player: AbPlayer | null = null;
let outUrl = '';

// Langue : selecteur (noms dans leur propre langue), tout le texte est retraduit sans recharger
const langSel = $<HTMLSelectElement>('lang');
for (const [code, { name }] of Object.entries(LANGS)) langSel.add(new Option(name, code));
langSel.value = currentLang();
langSel.addEventListener('change', () => { applyLang(langSel.value); renderCards(); renderAdvanced(); });
applyLang();

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

$('file').addEventListener('change', e => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void pick(f);
});

// Glisser-deposer : toute la page est une zone de depot tant que l'accueil est affiche
let dragDepth = 0;
const dropping = (on: boolean) => document.body.classList.toggle('dragging', on);
document.addEventListener('dragenter', e => { if (!$('home').hidden) { e.preventDefault(); dragDepth++; dropping(true); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropping(false); } });
document.addEventListener('dragover', e => e.preventDefault()); // sinon le navigateur ouvre la video
document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  dropping(false);
  const f = e.dataTransfer?.files[0];
  if (!f || $('home').hidden) return;
  if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) {
    $('home-error').textContent = t('errNotVideo');
    $('home-error').hidden = false;
    return;
  }
  void pick(f);
});

async function pick(f: File) {
  const err = $('home-error');
  const tooLong = t('errLong');
  if (!caps.wasm) { err.textContent = t('errOld'); err.hidden = false; return; }
  if (f.size > MAX_BYTES) { err.textContent = tooLong; err.hidden = false; return; }
  const d = await videoDuration(f);
  if (d > MAX_SECONDS + 0.5) { err.textContent = tooLong; err.hidden = false; return; }
  file = f;
  show('preset');
}

function renderCards() {
  const cards = $('presets');
  cards.replaceChildren();
  for (const p of presets) {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b')!.textContent = t(`p_${p.name}` as Parameters<typeof t>[0]);
    b.querySelector('span')!.textContent = t(`h_${p.name}` as Parameters<typeof t>[0]);
    b.addEventListener('click', () => file && run(file, withStages(p.json)));
    cards.appendChild(b);
  }
}
renderCards();

// ---- Options avancees : etages coupes = cles du coeur a 0, ajoutees en tete du preset (la 1re occurrence gagne).
// Memorises sur l'appareil ; stockage indisponible (navigation privee) = rien de coupe au prochain chargement.
const STAGES = ['pops', 'hpf', 'notch', 'denoise', 'dereverb', 'eq', 'deesser', 'leveler', 'compressor', 'loudness', 'limiter'] as const;
const off = new Set<string>((() => {
  try { return JSON.parse(localStorage.getItem('gv-off') ?? '[]') as string[]; } catch { return []; }
})());
// Anti-echo : menu (auto / coupe / force). "Coupe" reste dans gv-off ; la force est dans gv-dereverb (RT60 en s).
const FORCE = ['0.4', '0.7', '1'] as const;
let force = (() => { try { return localStorage.getItem('gv-dereverb') ?? ''; } catch { return ''; } })();
if (!(FORCE as readonly string[]).includes(force)) force = '';
const save = () => {
  try {
    localStorage.setItem('gv-off', JSON.stringify([...off]));
    localStorage.setItem('gv-dereverb', force);
  } catch { /* stockage bloque */ }
};
function renderAdvanced() {
  $('adv-list').replaceChildren(...STAGES.map(k => {
    const label = document.createElement('label');
    label.className = 'check';
    if (k === 'dereverb') {
      const sel = document.createElement('select');
      const opts: [string, Parameters<typeof t>[0]][] =
        [['auto', 'dr_auto'], ['off', 'dr_off'], ['0.4', 'dr_light'], ['0.7', 'dr_medium'], ['1', 'dr_strong']];
      for (const [v, key] of opts) sel.add(new Option(t(key), v));
      sel.value = off.has(k) ? 'off' : force || 'auto';
      sel.addEventListener('change', () => {
        if (sel.value === 'off') off.add(k); else off.delete(k);
        force = sel.value === 'off' || sel.value === 'auto' ? '' : sel.value;
        save();
      });
      label.append(t(`st_${k}`), sel);
      return label;
    }
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !off.has(k);
    box.addEventListener('change', () => {
      if (box.checked) off.delete(k); else off.add(k);
      save();
    });
    label.append(box, ' ' + t(`st_${k}`));
    return label;
  }));
}
renderAdvanced();
$('adv-open').addEventListener('click', () => $<HTMLDialogElement>('adv').showModal());
const withStages = (json: string) => {
  const keys = [...off].map(k => `"${k}": 0, `);
  if (force && !off.has('dereverb')) keys.push(`"dereverbRt60": ${force}, `);
  return keys.length ? '{' + keys.join('') + json.slice(json.indexOf('{') + 1) : json;
};

// ---- Traitement ----
const STEPS = ['read', 'cuts', 'pops', 'analysis', 'processing', 'export'] as const;
type Step = (typeof STEPS)[number];
const WEIGHT: Record<Step, number> = { read: 0.15, cuts: 0, pops: 0.1, analysis: 0.1, processing: 0.35, export: 0.3 };
const progress: Partial<Record<Step, number>> = {};

function setStep(step: Step, state: 'active' | 'done' | 'skipped', p = state === 'active' ? 0 : 1) {
  $('step-' + step).className = state;
  progress[step] = p;
  const total = STEPS.reduce((s, k) => s + WEIGHT[k] * (progress[k] ?? 0), 0);
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
  $('steps').innerHTML = STEPS.map(k => `<li id="step-${k}" data-i18n="s_${k}">${t(`s_${k}`)}</li>`).join('');
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
    showResult(out, original, audio, report.popsRemoved as number, report.process);
  } catch (err) {
    console.error(err);
    fail(t(err instanceof Error && err.message === 'NO_SOUND' ? 'errNoSound' : 'errFailed'));
  }
}

// ---- Resultat ----
function showResult(out: Blob, before: Float32Array, after: Float32Array, pops: number,
                    proc: { rt60: number; dereverb: boolean }) {
  outUrl = URL.createObjectURL(out);
  const video = $<HTMLVideoElement>('player');
  video.src = outUrl;
  player = new AbPlayer(video, before, after);
  setAb(true);
  $('pops').textContent = pops === 0 ? '' : pops === 1 ? t('pop1') : t('popN', { n: pops });
  // Voyant d'echo : vert = rien a faire, orange = de-reverb, rouge = piece tres reverberante (seuils du coeur, kRt60On/kRt60Red)
  const echo = $('echo');
  // Force manuelle ou RT60 non mesure : on affiche la force choisie (celle que le coeur a appliquee)
  const rt60 = force && proc.dereverb ? Number(force) : proc.rt60;
  echo.hidden = !(rt60 > 0);
  echo.dataset.level = rt60 > 0.6 ? 'red' : proc.dereverb ? 'orange' : 'green';
  echo.textContent = t(proc.dereverb ? 'echoCut' : 'echo', { s: rt60.toFixed(2) });
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
