/* 数二解答题 · Service Worker
   注意：发布平台对未携带 sharecode 的请求返回 403，
   所以缓存与回落都要保留访问凭证。
*/
const SELF_URL = new URL(self.location.href);
const SC = SELF_URL.searchParams.get('sharecode') || '';

function withSC(u) {
  if (!SC) return u;
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(SC);
}

const CACHE = 'math2-cf-11271653';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './solver.css',
  './web.css',
  './brand.css',
  './bg.js',
  './web.js',
  './brand.js',
  './tiku.css',
  './english.html',
  './home.html',
  './home.css',
  './home.js',
  './english.css',
  './english.js',
  './english/words.json',
  './english/words_more.json',
  './tiku.js',
  './deploy-mode.js',
  './clean-url.js',
  './app.js',
  './solver.js',
  './vendor/nerdamer.js',
  './vendor/math.js',
  './solver-core.js',
  './problem-parse.js',
  './ocr.css',
  './ocr-proof.css',
  './ocr.js',
  './choice-parse.js',
  './problem-parse.css',
  './solver-kb.js',
  './solver-kb.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './vendor/mathjax-tex-svg.js',
  './vendor/cloud-sdk.js',
  './data/math/index.json',
  './data/math/meta.json',
  './data/math/kp/index.json',
  './data/math/chp.json',
  './data/politics/index.json',
  './data/politics/meta.json',
  './data/english/index.json',
  './data/english/y2018.json'
].map(withSC);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(r => {
      if (r && r.ok && r.type === 'basic') {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return r;
    });
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 页面导航：网络优先；403 / 断网都回落缓存，
  // 这样装到桌面后即使不带 sharecode 也能打开
  if (req.mode === 'navigate') {
    // 三个主页面都进离线缓存：index.html / home.html / english.html
    // 其他页面（如 stat.html）直连网络，避免把管理页内容盖到主页面缓存上
    const url = new URL(req.url);
    const pn = url.pathname.replace(/\/+$/, '');
    const key = /\/home\.html$/.test(pn) ? './home.html'
      : /\/english\.html$/.test(pn) ? './english.html'
      : (/\/(index\.html)?$/.test(pn) ? './index.html' : null);
    e.respondWith(
      fetch(req).then(r => {
        if (!r || !r.ok) throw new Error('bad');
        if (key) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(withSC(key), copy)).catch(() => {});
        }
        return r;
      }).catch(() => {
        if (!key) {
          return new Response('这个页面需要联网打开。', {
            status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        return caches.match(withSC(key), { ignoreSearch: true })
          .then(h => h || caches.match(key, { ignoreSearch: true }))
          .then(h => h || new Response('离线，且尚未缓存内容。请在联网状态下首次打开一次。', {
            status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }));
      })
    );
    return;
  }

  e.respondWith(cacheFirst(req));
});

























