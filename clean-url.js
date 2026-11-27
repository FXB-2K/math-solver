/* ============================================================
   干净 URL 补丁（Cloudflare Pages 等托管会自动去掉 .html）
   - home.html → ./home      english.html → ./english
   - index.html?... → ./?... （根目录）
   - 只在 __DEPLOY_MODE_CLEAN__ 时启用，本地 / WorkBuddy 不受影响
   ============================================================ */
(function () {
  'use strict';
  if (!window.__DEPLOY_MODE__ || !window.__DEPLOY_MODE_CLEAN__) return;

  function clean(u) {
    if (!u) return u;
    if (/^(https?:)?\/\/|^#|^mailto:|^javascript:/i.test(u)) return u;
    var m = u.match(/^(?:\.\/)?(index|home|english)\.html(\?[^#]*)?(#.*)?$/i);
    if (!m) return u;
    var name = m[1].toLowerCase();
    var q = m[2] || '';
    var h = m[3] || '';
    if (name === 'index') return './' + q + h;      // 始终指向根目录
    return './' + name + q + h;
  }
  window.__cleanUrl__ = clean;

  function rewrite() {
    var i, h, c;
    var as = document.querySelectorAll('a[href]');
    for (i = 0; i < as.length; i++) {
      h = as[i].getAttribute('href');
      c = clean(h);
      if (c !== h) as[i].setAttribute('href', c);
    }
    var ds = document.querySelectorAll('[data-href]');
    for (i = 0; i < ds.length; i++) {
      h = ds[i].getAttribute('data-href');
      c = clean(h);
      if (c !== h) ds[i].setAttribute('data-href', c);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewrite);
  } else {
    rewrite();
  }
  setTimeout(rewrite, 350);
  setTimeout(rewrite, 1200);
})();
