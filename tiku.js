/* ============================================================
   题库页大改版 · wobble-card 交互
   - 注入 Bento 首屏 + 知识点跑马灯
   - 年份卡/题目卡 3D 指针倾斜 + 聚光跟随
   - 依据 listWrap 状态自动切换 Bento / 列表模式
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var TAGS = ['极限', '导数与微分', '不定积分', '定积分', '二重积分', '微分方程', '无穷级数', '偏导数', '极值与最值', '证明题', '反常积分', '参数方程', '渐近线', '泰勒展开'];

  var current = null;
  var raf = null;

  function page() { return document.getElementById('page-tiku'); }
  function wrap() { return document.getElementById('listWrap'); }

  /* ---------- Bento 首屏 ---------- */
  function buildHero() {
    var pg = page();
    if (!pg || pg.querySelector('.tk-hero')) return;

    var hero = document.createElement('div');
    hero.className = 'tk-hero';
    hero.innerHTML =
      '<div class="tk-hero-main">' +
      '  <span class="tk-eyebrow"><i></i>数二真题 · 2008–2025</span>' +
      '  <h2 class="tk-title">18 年真题，<span>按年份拆开练</span></h2>' +
      '  <p class="tk-sub">377 道题已录入，逐题详解 + 考点。从最近一年开始，或在顶部直接搜题号 / 知识点。</p>' +
      '  <div class="tk-stats">' +
      '    <div class="tk-stat"><b data-tk-years>18</b><span>年份</span></div>' +
      '    <div class="tk-stat"><b data-tk-total>377</b><span>题目</span></div>' +
      '    <div class="tk-stat"><b>6</b><span>板块</span></div>' +
      '    <div class="tk-stat"><b>100%</b><span>本地</span></div>' +
      '  </div>' +
      '</div>' +
      '<div class="tk-hero-side">' +
      '  <div class="tk-orbit"></div>' +
      '  <button class="tk-go" type="button" data-tk-go>从 2025 开始' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>' +
      '  </button>' +
      '  <span class="tk-go-note" data-tk-note>6 题 · 最新录入</span>' +
      '</div>';
    pg.insertBefore(hero, pg.firstChild);

    var mq = document.createElement('div');
    mq.className = 'tk-marquee';
    mq.innerHTML = '<div class="tk-track">' +
      TAGS.map(function (t) { return '<b>' + t + '</b><i>·</i>'; }).join('') +
      TAGS.map(function (t) { return '<b>' + t + '</b><i>·</i>'; }).join('') +
      '</div>';
    pg.insertBefore(mq, hero.nextSibling);

    hero.querySelector('[data-tk-go]').addEventListener('click', function () {
      var y = document.querySelector('#listWrap .ycell[data-y="2025"]');
      if (y) y.click();
    });

    updateStats();
  }

  function updateStats() {
    var pg = page();
    if (!pg) return;
    var sub = document.getElementById('pageSub');
    var text = sub ? sub.textContent : '';
    var m = text.match(/(\d{4})[–-](\d{4})\s*·\s*(\d+)\s*年\s*·\s*(\d+)\s*题/);
    var yearsEl = pg.querySelector('[data-tk-years]');
    var totalEl = pg.querySelector('[data-tk-total]');
    if (m) {
      if (yearsEl && yearsEl.textContent !== m[3]) yearsEl.textContent = m[3];
      if (totalEl && totalEl.textContent !== m[4]) totalEl.textContent = m[4];
    }
  }

  /* ---------- 年份卡装饰 ---------- */
  function decorate() {
    var pg = page(), w = wrap();
    if (!pg || !w) return;
    var isGrid = w.classList.contains('year-grid');
    w.classList.toggle('tk-grid', isGrid);
    pg.classList.toggle('tk-listview', !isGrid);

    if (isGrid) {
      var cells = w.querySelectorAll('.ycell');
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        c.style.setProperty('--i', i);
        var hues = ['var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)'];
        c.style.setProperty('--tk-c', hues[i % 3]);
        if (!c.querySelector('.tk-badge')) {
          var y = c.getAttribute('data-y');
          var badge = document.createElement('em');
          badge.className = 'tk-badge';
          badge.textContent = y === '2025' ? '最新' : (y === '2024' ? '新' : '真题');
          c.appendChild(badge);
        }
      }
      updateStats();
    }
  }

  /* ---------- 3D 倾斜 ---------- */
  function cardOf(el) {
    if (!el || !el.closest) return null;
    return el.closest('#listWrap .ycell, #listWrap .qcard, .tk-hero');
  }

  function maxDeg(el) {
    if (el.classList.contains('tk-hero')) return 2;
    if (el.classList.contains('qcard')) return 3.2;
    return 8;
  }

  function move(e) {
    if (!fine || reduce) return;
    var card = cardOf(e.target);
    if (!card) return;
    if (current && current !== card) reset(current);
    var r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var px = (e.clientX - r.left) / r.width;
    var py = (e.clientY - r.top) / r.height;
    var max = maxDeg(card);
    current = card;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      if (!current) return;
      var c = current;
      var rx = ((0.5 - py) * 2 * max).toFixed(2);
      var ry = ((px - 0.5) * 2 * max).toFixed(2);
      c.style.setProperty('--rx', rx + 'deg');
      c.style.setProperty('--ry', ry + 'deg');
      c.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      c.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      c.classList.add('tk-tilt');
    });
  }

  function reset(card) {
    if (!card) return;
    card.classList.remove('tk-tilt');
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
    card.style.removeProperty('--mx');
    card.style.removeProperty('--my');
    if (current === card) current = null;
  }

  function bindPointer() {
    if (!fine || reduce) return;
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var card = cardOf(e.target);
      if (!card) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest('#listWrap .ycell, #listWrap .qcard, .tk-hero') === card) return;
      reset(card);
    }, { passive: true });
    window.addEventListener('scroll', function () { if (current) reset(current); }, { passive: true });
  }

  /* ---------- 观察列表变化 ---------- */
  function observe() {
    var w = wrap();
    if (!w) return;
    var mo = new MutationObserver(function () { decorate(); });
    mo.observe(w, { attributes: true, attributeFilter: ['class'], childList: true });
    var sub = document.getElementById('pageSub');
    if (sub) {
      new MutationObserver(function () { updateStats(); })
        .observe(sub, { childList: true, characterData: true, subtree: true });
    }
    decorate();
  }

  function init() {
    buildHero();
    bindPointer();
    observe();
    // 首屏渲染完成后再装饰一次（数据异步加载）
    setTimeout(decorate, 300);
    setTimeout(decorate, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
