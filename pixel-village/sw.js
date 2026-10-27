/*
 * 缓存管家（Service Worker）：GitHub Pages 让浏览器把每个文件缓存 10 分钟，刚发布完打开会新旧文件混着用
 * （新的 index.html 配旧的 main.js，按钮点了没反应）。这里让代码和页面每次都先问一下服务器有没有更新
 * （没改过的服务器回 304，很快），连不上再用缓存；声音、字体、图片这些大文件照常走浏览器缓存。
 */
const FRESH = /\.(js|mjs|css|html|json)$|\/$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || !FRESH.test(u.pathname)) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match(e.request).then((r) => r ?? Response.error())));
});
