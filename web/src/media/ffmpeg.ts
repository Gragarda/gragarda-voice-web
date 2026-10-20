// Etapes A et G : ffmpeg.wasm (dans son propre worker). La video n'est jamais reencodee (-c:v copy).
import { FFmpeg } from '@ffmpeg/ffmpeg';

let ff: FFmpeg | null = null;

// Multithread seulement si la page est isolee (COOP/COEP, Transform Rule Cloudflare) ; sinon monothread,
// le remux en -c:v copy reste rapide.
async function get(): Promise<FFmpeg> {
  if (ff) return ff;
  const f = new FFmpeg();
  const base = new URL(`ffmpeg/${crossOriginIsolated ? 'mt' : 'st'}/`, document.baseURI).href;
  await f.load({
    coreURL: base + 'ffmpeg-core.js',
    wasmURL: base + 'ffmpeg-core.wasm',
    ...(crossOriginIsolated ? { workerURL: base + 'ffmpeg-core.worker.js' } : {}),
  });
  ff = f;
  return f;
}

// Fichier monte en WORKERFS : lu a la demande, pas copie dans la memoire de ffmpeg
async function withInput<T>(file: File, run: (f: FFmpeg, path: string) => Promise<T>): Promise<T> {
  const f = await get();
  await f.createDir('/in').catch(() => {});
  await f.mount('WORKERFS' as any, { files: [file] }, '/in');
  try {
    return await run(f, `/in/${file.name}`);
  } finally {
    await f.unmount('/in');
  }
}

async function exec(f: FFmpeg, args: string[], onProgress?: (p: number) => void) {
  const cb = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
  const logs: string[] = [];
  const log = ({ message }: { message: string }) => { logs.push(message); if (logs.length > 30) logs.shift(); };
  f.on('progress', cb);
  f.on('log', log);
  try {
    if ((await f.exec(args)) !== 0) throw new Error(`ffmpeg : ${logs.slice(-5).join(' | ')}`);
  } finally {
    f.off('progress', cb);
    f.off('log', log);
  }
}

// A : piste audio -> PCM float mono 48 kHz
// ponytail: downmix mono (voix) ; garder la stereo si des utilisateurs filment avec un micro stereo
export async function extractAudio(file: File, onProgress?: (p: number) => void): Promise<Float32Array> {
  return withInput(file, async (f, path) => {
    await exec(f, ['-i', path, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '/audio.f32'], onProgress)
      .catch(e => { throw /does not contain any stream|matches no streams/.test(e.message) ? new Error('NO_SOUND') : e; });
    const data = (await f.readFile('/audio.f32')) as Uint8Array;
    await f.deleteFile('/audio.f32');
    if (!data.byteLength) throw new Error('NO_SOUND');
    return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  });
}

// G : video d'origine copiee telle quelle + nouvel audio AAC 48 kHz 192 kbps -> .mp4
export async function remux(file: File, audio: Float32Array, onProgress?: (p: number) => void): Promise<Blob> {
  return withInput(file, async (f, path) => {
    // copie : writeFile transfere (detache) le buffer, et l'appelant garde `audio` pour l'Avant/Apres
    await f.writeFile('/proc.f32', new Uint8Array(audio.slice().buffer));
    await exec(f, [
      '-i', path, '-f', 'f32le', '-ar', '48000', '-ac', '1', '-i', '/proc.f32',
      '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', '/out.mp4',
    ], onProgress);
    await f.deleteFile('/proc.f32');
    const out = (await f.readFile('/out.mp4')) as Uint8Array;
    await f.deleteFile('/out.mp4');
    return new Blob([out as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  });
}
