/* 離線快取：頁面與資料用「網路優先」，函式庫與地圖圖磚用「快取優先」 */
const VERSION = 'ysm-v8';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'data/villages.json', 'manifest.webmanifest', 'icons/icon-192.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/chartjs/chart.umd.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (/tile\.openstreetmap\.org/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
});
