/* ============================================================
   网页版动态背景（Velora 风格 · 极光 + 网格 + 颗粒 + 鼠标微光）
   - 纯 CSS 动画 + 一个轻量 pointermove（桌面才有）
   - 尊重 prefers-reduced-motion；手机自动降级
   ============================================================ */
(function () {
  'use strict';
  if (!document || !document.body) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // 1) 极光层（3 个模糊光斑）
  var bg = document.createElement('div');
  bg.className = 'v-bg';
  bg.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < 3; i++) bg.appendChild(document.createElement('i'));
  document.body.insertBefore(bg, document.body.firstChild);

  // 2) 颗粒噪点层（极轻，提质感）
  var grain = document.createElement('div');
  grain.className = 'v-grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(grain, bg.nextSibling);

  // 2.5) 全局流光（Meteors，稀疏、低透明度）
  var meteors = document.createElement('div');
  meteors.className = 'v-meteors-global';
  meteors.setAttribute('aria-hidden', 'true');
  for (var k = 0; k < 9; k++) {
    var m = document.createElement('i');
    m.style.left = ((k * 11.7 + 6) % 94) + '%';
    m.style.animationDelay = '-' + ((k * 0.83) % 6).toFixed(2) + 's';
    m.style.animationDuration = (5.2 + (k % 3) * 0.9).toFixed(2) + 's';
    m.style.opacity = (0.10 + (k % 3) * 0.05).toFixed(2);
    meteors.appendChild(m);
  }
  document.body.insertBefore(meteors, grain.nextSibling);

  // 3) 鼠标微光（仅桌面；rAF 节流）
  var raf = null;
  function onMove(e) {
    if (window.innerWidth < 960) return;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      var x = (e.clientX / window.innerWidth) * 100;
      var y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty('--v-mx', x.toFixed(2) + '%');
      document.documentElement.style.setProperty('--v-my', y.toFixed(2) + '%');
    });
  }
  window.addEventListener('pointermove', onMove, { passive: true });
})();
