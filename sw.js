// Naikkan versi ini kalau mau memaksa cache dibersihkan (file HTML sekarang selalu diambil terbaru saat online)
const V = 'kasir-v16';
const FILES = ['./', 'index.html', 'dashboard.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
// Online: ambil versi terbaru (maks. 3 detik). Sinyal jelek/offline: pakai cache.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Manifest dinamis: nama app mengikuti nama cabang (?n=...)
  if (u.origin === location.origin && u.pathname.endsWith('/manifest.webmanifest') && u.searchParams.get('n')) {
    const n = u.searchParams.get('n');
    return e.respondWith(new Response(JSON.stringify({
      name: n, short_name: n, id: './', start_url: './', scope: './', display: 'standalone',
      background_color: '#f2f3ee', theme_color: '#1f3d33',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    }), { headers: { 'Content-Type': 'application/manifest+json' } }));
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const net = fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  });
  e.respondWith(
    Promise.race([net, new Promise((_, no) => setTimeout(no, 3000))])
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || net)));
});
