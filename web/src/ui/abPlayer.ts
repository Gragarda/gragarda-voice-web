// Avant / Apres : la <video> joue muette, deux AudioBufferSourceNode suivent sa position ;
// la bascule ne change que les gains -> pas de rechargement, pas de saut.
// La piste de la <video> est captee par Web Audio sans etre branchee (donc muette) : le volume et le
// bouton son natifs restent utilisables et pilotent le gain de sortie.
export class AbPlayer {
  private ctx = new AudioContext({ sampleRate: 48000 });
  private bufs: AudioBuffer[];
  private gains: GainNode[];
  private srcs: AudioBufferSourceNode[] = [];
  private master = this.ctx.createGain();
  private after = true;

  constructor(private video: HTMLVideoElement, before: Float32Array, after: Float32Array) {
    this.ctx.createMediaElementSource(video); // non connectee : la piste originale ne sort plus
    this.master.connect(this.ctx.destination);
    const volume = () => { this.master.gain.value = video.muted ? 0 : video.volume; };
    volume();
    video.addEventListener('volumechange', volume);
    this.bufs = [before, after].map(d => {
      const b = this.ctx.createBuffer(1, d.length, 48000);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      return b;
    });
    this.gains = this.bufs.map(() => {
      const g = this.ctx.createGain();
      g.connect(this.master);
      return g;
    });
    this.applyGains(0);
    const restart = () => this.start();
    video.addEventListener('play', restart);
    video.addEventListener('seeked', () => { if (!video.paused) restart(); });
    video.addEventListener('ratechange', () => { if (!video.paused) restart(); });
    video.addEventListener('pause', () => this.stop());
    video.addEventListener('waiting', () => this.stop());
    video.addEventListener('playing', restart);
    // les horloges video et audio derivent : on recale au-dela de 60 ms
    video.addEventListener('timeupdate', () => {
      if (video.paused || !this.srcs.length) return;
      const pos = this.startAt + (this.ctx.currentTime - this.startCtx) * video.playbackRate;
      if (Math.abs(pos - video.currentTime) > 0.06) restart();
    });
  }
  private startAt = 0;
  private startCtx = 0;

  setAfter(after: boolean) {
    this.after = after;
    this.applyGains(0.015); // 15 ms : pas de clic a la bascule
  }

  private applyGains(ramp: number) {
    const t = this.ctx.currentTime;
    this.gains.forEach((g, i) => g.gain.setTargetAtTime((i === 1) === this.after ? 1 : 0, t, ramp || 0.0001));
  }

  private start() {
    this.stop();
    void this.ctx.resume();
    const at = this.video.currentTime;
    this.startAt = at;
    this.startCtx = this.ctx.currentTime;
    this.srcs = this.bufs.map((b, i) => {
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.playbackRate.value = this.video.playbackRate;
      s.connect(this.gains[i]);
      s.start(0, Math.min(at, b.duration));
      return s;
    });
  }

  private stop() {
    for (const s of this.srcs) { try { s.stop(); } catch { /* deja arrete */ } s.disconnect(); }
    this.srcs = [];
  }

  close() {
    this.stop();
    void this.ctx.close();
    // une <video> ne se capte qu'une fois par Web Audio : element neuf (et sans nos ecouteurs) pour la suivante
    this.video.replaceWith(this.video.cloneNode());
  }
}
