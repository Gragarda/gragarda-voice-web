// Etape B : demux (mp4box) -> VideoDecoder (WebCodecs, materiel) -> miniatures 64x36 gris -> cuts.
// Message entrant : File. Sortant : { progress } puis { cuts } ou { error } (l'app passe alors en "scan seul").
import MP4Box from 'mp4box';
import { CutDetector, THUMB_H, THUMB_W, toGray } from '../media/cutDetect';

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

// avcC / hvcC / vpcC / av1C -> champ `description` du VideoDecoder
function description(trak: any): Uint8Array | undefined {
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const s = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(s);
      return new Uint8Array(s.buffer, 8); // sans l'en-tete de boite
    }
  }
}

async function detect(file: File): Promise<number[]> {
  const mp4 = MP4Box.createFile();
  const canvas = new OffscreenCanvas(THUMB_W, THUMB_H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const det = new CutDetector();
  let total = 0, done = 0, decodeError: unknown = null, t0: number | null = null;

  const decoder = new VideoDecoder({
    output: frame => {
      // Origine = 1re image affichee : les B-frames decalent les cts (compense par l'edit list MP4,
      // que mp4box n'applique pas). ponytail: edit lists exotiques (debut coupe) non gerees
      t0 ??= frame.timestamp;
      ctx.drawImage(frame, 0, 0, THUMB_W, THUMB_H);
      det.push((frame.timestamp - t0) / 1e6, toGray(ctx.getImageData(0, 0, THUMB_W, THUMB_H).data));
      frame.close(); // indispensable : sinon la memoire explose sur iOS
      if (++done % 30 === 0) post({ progress: done / total });
    },
    error: e => { decodeError = e; },
  });

  const samples: any[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    mp4.onError = (e: string) => reject(new Error(e));
    mp4.onReady = async (info: any) => {
      const track = info.videoTracks[0];
      if (!track) return reject(new Error('pas de piste video'));
      const config: VideoDecoderConfig = {
        codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec,
        codedWidth: track.video.width,
        codedHeight: track.video.height,
        description: description(mp4.getTrackById(track.id)),
        optimizeForLatency: false,
      };
      if (!(await VideoDecoder.isConfigSupported(config)).supported) return reject(new Error(`codec ${config.codec} non supporte`));
      decoder.configure(config);
      total = track.nb_samples;
      mp4.setExtractionOptions(track.id, null, { nbSamples: 100 });
      mp4.onSamples = (_id: number, _user: unknown, s: any[]) => { samples.push(...s); };
      mp4.start();
      resolve();
    };
  });

  // Lecture par morceaux de 4 Mo : le fichier n'est jamais charge en entier
  const CHUNK = 4 << 20;
  for (let off = 0; off < file.size; off += CHUNK) {
    const buf = (await file.slice(off, off + CHUNK).arrayBuffer()) as ArrayBuffer & { fileStart: number };
    buf.fileStart = off;
    mp4.appendBuffer(buf);
    await feed();
  }
  mp4.flush();
  await ready;
  await feed();
  await decoder.flush();
  decoder.close();
  if (decodeError) throw decodeError;
  return det.cuts();

  async function feed() {
    while (samples.length) {
      const s = samples.shift();
      decoder.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: (1e6 * s.cts) / s.timescale,
        duration: (1e6 * s.duration) / s.timescale,
        data: s.data,
      }));
      mp4.releaseUsedSamples(s.track_id, s.number);
      // contre-pression : pas plus de 10 images en attente dans le decodeur
      while (decoder.decodeQueueSize > 10) await new Promise(r => setTimeout(r, 5));
    }
  }
}

self.onmessage = async (e: MessageEvent<File>) => {
  try {
    if (typeof VideoDecoder === 'undefined') throw new Error('WebCodecs absent');
    post({ cuts: await detect(e.data) });
  } catch (err) {
    post({ error: String(err) });
  }
};
