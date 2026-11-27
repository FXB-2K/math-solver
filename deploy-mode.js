/* ============================================================
   部署模式（公网静态托管时自动生效）
   1) 公网域名：隐藏「解题」tab（解题依赖本地 8765 服务）
   2) 根路径进入时先进星云首页 home.html；带 ?app=1 直接进题库
   3) 全程保留 sharecode（WorkBuddy 托管缺它会 403）
   4) 本地 localhost / 127.0.0.1 / 局域网 完全不受影响
   ============================================================ */
(function () {
  'use strict';

  var host = location.hostname || '';
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || /^192\.168\./.test(host) || /^10\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || location.protocol === 'file:';

  var forced = /[?&]deploy=1/.test(location.search);   // 本地测试用
  if (isLocal && !forced) { window.__DEPLOY_MODE__ = false; return; }
  window.__DEPLOY_MODE__ = true;
  /* /home.html 会被平台 308 到 /home 的托管（如 Cloudflare Pages）标记为 clean */
  window.__DEPLOY_MODE_CLEAN__ = /\.pages\.dev$/.test(host);

  /* ---------- sharecode 透传 ---------- */
  var params = new URLSearchParams(location.search);
  var sc = params.get('sharecode') || '';
  function withSC(url) {
    if (!sc) return url;
    if (/^https?:|^\/\/|^#|^mailto:/i.test(url)) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(sc);
  }
  window.__withShareCode__ = withSC;

  /* ---------- 根路径 → 星云首页 ---------- */
  var raw = location.pathname || '/';   // 目录 URL 可能以 / 结尾
  var path = raw.replace(/\/+$/, '');
  var atRoot = path === '' || /\/index\.html$/.test(path) || /\/$/.test(raw);
  var hasApp = /[?&]app=1/.test(location.search);
  if (atRoot && !hasApp) {
    location.replace(withSC('home.html') + (location.hash || ''));
    return;
  }

  /* ---------- 解题 tab 现在纯浏览器计算，公网保留 ---------- */
  function hideSolver() {
    return;  // 引擎已改为纯浏览器计算，公网可用
    var tab = document.querySelector('.tab[data-tab="solver"]');
    if (tab && tab.parentNode) tab.parentNode.removeChild(tab);
    var page = document.getElementById('page-solver');
    if (page && page.parentNode) page.parentNode.removeChild(page);
    var cur = document.querySelector('.tab.on');
    if (cur && cur.getAttribute('data-tab') === 'solver') {
      var tiku = document.querySelector('.tab[data-tab="tiku"]');
      if (tiku) tiku.click();
    }
  }

  /* ---------- 给所有站内链接补 sharecode ---------- */
  function patchLinks() {
    if (!sc) return;
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var h = as[i].getAttribute('href');
      if (!h || h.charAt(0) === '#') continue;
      if (/^(https?:)?\/\//i.test(h) || /^mailto:/i.test(h)) continue;
      if (/[?&]sharecode=/.test(h)) continue;
      as[i].setAttribute('href', withSC(h));
    }
  }

  function boot() {
    hideSolver();
    patchLinks();
    /* 侧栏动态注入的入口也要补 */
    setTimeout(patchLinks, 300);
    setTimeout(patchLinks, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();


