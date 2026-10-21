// Cloudflare Worker, route : voice.gragarda.fr/app*
// Sert la web app (GitHub Pages de gragarda-voice-web) sous voice.gragarda.fr/app/
// et ajoute COOP/COEP -> crossOriginIsolated -> ffmpeg.wasm multithread.
const ORIGIN = 'https://gragarda.github.io/gragarda-voice-web';

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.slice('/app'.length);
    if (path === '') return Response.redirect(`${url.origin}/app/${url.search}`, 301);

    const upstream = await fetch(ORIGIN + path + url.search, req);
    const res = new Response(upstream.body, upstream);
    res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    return res;
  },
};
