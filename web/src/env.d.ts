declare module 'mp4box'; // ponytail: pas de types officiels pour la 0.5 ; usage limite a cuts.worker.ts

declare module '*/wasm/gv.js' {
  interface Gv {
    run(channels: Float32Array[], sampleRate: number, cuts: number[], presetJson: string,
        onProgress: (stage: string) => void): { report: string; channels: Float32Array[] };
  }
  const createGv: () => Promise<Gv>;
  export default createGv;
}
