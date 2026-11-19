// Zinc Grenadine mobile — fonctionnement hors connexion de l'interface (les données passent par Google Drive)
const CACHE = 'zgm-1.5.0';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'js/app.js', 'js/ui.js', 'js/drive.js', 'manifest.webmanifest',
  'img/logo.png', 'img/icon-192.png', 'img/icon-180.png', 'fonts/amatic-sc-latin-700-normal.woff2', 'fonts/amatic-sc-latin-ext-700-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Google : jamais mis en cache ici
  // réseau d'abord (mises à jour du site), copie locale si pas de réseau
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
