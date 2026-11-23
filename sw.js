// This source code is by https://github.com/Penguins111 https://discord.gg/2TnE3nEEVc penguins r cool
const BUILD = '10af6ec1d79a';
const CACHE = `assets-${BUILD}`;
const SCOPE = new URL(self.registration.scope).pathname;
const LOCAL = new Set(['', 'index.html', 'game.html', 'sw.js']);
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', js: 'text/javascript', css: 'text/css',
  json: 'application/json', txt: 'text/plain', html: 'text/html', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };
const MAX_WHOLE = 6;
const RETRIES = 4;
let index = null, ranges = true;
const whole = new Map();

const loadIndex = () => index ||= fetch(`packs/index.json?${BUILD}`).then(r => { if (!r.ok) throw r.status; return r.json(); }).then(d => {
  const lower = new Map();
  for (const k of Object.keys(d.f)) lower.set(k.toLowerCase(), k);
  return { ...d, lower };
}).catch(e => { index = null; throw e; });

self.addEventListener('install', e => { e.waitUntil(loadIndex().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(L => Promise.all(L.filter(k => k.startsWith('assets-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

function wholePack(name){
  if (!whole.has(name)) {
    if (whole.size >= MAX_WHOLE) whole.delete(whole.keys().next().value);
    whole.set(name, fetch(`packs/${name}?${BUILD}`).then(r => { if (!r.ok) throw r.status; return r.arrayBuffer(); }).catch(e => { whole.delete(name); throw e; }));
  }
  return whole.get(name);
}

async function once(name, off, len){
  if (ranges) {
    try {
      const r = await fetch(`packs/${name}?${BUILD}`, { headers: { Range: `bytes=${off}-${off + len - 1}` } });
      if (r.status === 206) { const d = await r.arrayBuffer(); if (d.byteLength === len) return d; }
      else if (r.ok) { ranges = false; if (!whole.has(name)) whole.set(name, r.arrayBuffer()); }
    } catch (e) {}
  }
  return (await wholePack(name)).slice(off, off + len);
}

async function bytes(name, off, len){
  for (let i = 1; ; i++) {
    try { return await once(name, off, len); }
    catch (e) { whole.delete(name); if (i >= RETRIES) throw e; await new Promise(r => setTimeout(r, 400 * i)); }
  }
}

async function asset(key, entry, packs){
  const cache = await caches.open(CACHE).catch(() => null), id = `asset/${key}`;
  const hit = cache && await cache.match(id);
  if (hit) return hit.arrayBuffer();
  const data = await bytes(packs[entry[0]], entry[1], entry[2]);
  if (cache) cache.put(id, new Response(data.slice(0))).catch(() => {});
  return data;
}

async function serve(req, rel){
  const d = await loadIndex();
  const key = d.f[rel] ? rel : d.lower.get(rel.toLowerCase());
  if (!key) return fetch(req);
  const data = await asset(key, d.f[key], d.p);
  const type = TYPES[key.split('.').pop().toLowerCase()] || 'application/octet-stream';
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') || '');
  if (m) {
    const a = +m[1], b = Math.min(m[2] ? +m[2] : data.byteLength - 1, data.byteLength - 1);
    return new Response(data.slice(a, b + 1), { status: 206, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(b - a + 1), 'Content-Range': `bytes ${a}-${b}/${data.byteLength}` } });
  }
  return new Response(data, { headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(data.byteLength) } });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  const rel = decodeURIComponent(url.pathname.slice(SCOPE.length));
  if (LOCAL.has(rel) || rel.startsWith('packs/') || rel.endsWith('.js')) return;
  e.respondWith(serve(e.request, rel));
});
