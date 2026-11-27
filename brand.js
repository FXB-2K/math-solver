/* ============================================================
   首次打开 · 品牌色 3D 旋转拨盘（参考 velora.colorlib.com/themes）
   - 6 张主题卡排成 3D 圆环，可拖拽 / 滚轮 / 箭头 / 圆点切换
   - 选中卡正面放大、两侧后撤变暗，地面有品牌色光晕
   - 选择写 html[data-ramp]，全站强调色/极光/解题页渐变实时跟随
   - 持久化：localStorage 'm2:ramp' / 'm2:ramp_seen'
   ============================================================ */
(function () {
  'use strict';

  var PRESETS = [
    { id: 'blue', name: 'Velora Blue', desc: '默认。克制的蓝 → 天蓝渐变，像品牌而不是模板。', c: ['#2563eb', '#3b82f6', '#38bdf8'] },
    { id: 'violet', name: 'Aurora Violet', desc: '紫色经品红到青，极光能量最强。', c: ['#7c3aed', '#c026d3', '#06b6d4'] },
    { id: 'emerald', name: 'Emerald', desc: '绿 → 青，冷静、可信，适合工具类产品。', c: ['#059669', '#10b981', '#14b8a6'] },
    { id: 'rose', name: 'Rose', desc: '玫瑰 → 粉，温暖自信，偏消费/创意类。', c: ['#e11d48', '#ec4899', '#f472b6'] },
    { id: 'amber', name: 'Amber', desc: '琥珀 → 金，高能量，适合冲刺型场景。', c: ['#d97706', '#f59e0b', '#fbbf24'] },
    { id: 'slate', name: 'Slate Mono', desc: '无彩色，把注意力全部留给文字与排版。', c: ['#475569', '#64748b', '#94a3b8'] }
  ];

  var root = document.documentElement;
  var overlay = null;
  var plates = [];
  var inds = [];
  var ring = null;
  var dial = null;
  var index = 0;
  var angle = 0;
  var interacting = false;
  var autoTimer = null;
  var snapTimer = null;
  var drag = null;

  function presetOf(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  function applyRamp(id, persist) {
    var p = presetOf(id);
    index = PRESETS.indexOf(p);
    root.setAttribute('data-ramp', p.id);
    if (persist !== false) { try { localStorage.setItem('m2:ramp', p.id); } catch (e) {} }
    plates.forEach(function (pl) {
      pl.classList.toggle('on', pl.getAttribute('data-ramp') === p.id);
    });
    inds.forEach(function (d, i) { d.classList.toggle('on', i === index); });
    var cur = overlay && overlay.querySelector('#bwCurrent em');
    if (cur) cur.textContent = p.name;
  }

  /* ---------- 3D 旋转 ---------- */
  function norm(deg) {
    var d = deg % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function render() {
    if (!ring) return;
    ring.style.transform = 'rotateY(' + angle + 'deg)';
    plates.forEach(function (pl, i) {
      var rel = norm(i * 60 + angle);
      var abs = Math.abs(rel);
      var k = Math.min(abs / 180, 1);
      pl.style.setProperty('--s', (1 - 0.20 * k).toFixed(3));
      pl.style.setProperty('--dim', (0.46 * k).toFixed(3));
      pl.style.setProperty('--z', String(Math.round(100 - abs)));
    });
  }

  function rotateTo(idx, opts) {
    var p = PRESETS[((idx % PRESETS.length) + PRESETS.length) % PRESETS.length];
    var target = -60 * PRESETS.indexOf(p);
    if (!opts || !opts.immediate) {
      var diff = norm(target - angle);
      angle += diff;
    } else {
      angle = target;
    }
    applyRamp(p.id);
    render();
    restartAuto();
  }

  function step(delta) {
    // 以当前角度推算最近的一张卡，再走 delta 张
    var idx = Math.round(-angle / 60);
    rotateTo(idx + delta);
  }

  function markInteract() {
    interacting = true;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function restartAuto() {
    // 不做自动轮播：拨盘需要用户主动旋转，避免"自己乱转"
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  /* ---------- 构建 ---------- */
  function buildMeteors(box) {
    for (var i = 0; i < 14; i++) {
      var m = document.createElement('i');
      m.style.left = ((i * 7.3 + 4) % 96) + '%';
      m.style.animationDelay = '-' + ((i * 1.37) % 5).toFixed(2) + 's';
      m.style.animationDuration = (4 + (i % 5) * 0.6).toFixed(2) + 's';
      m.style.height = (100 + (i % 4) * 34) + 'px';
      m.style.opacity = (0.45 + (i % 4) * 0.12).toFixed(2);
      box.appendChild(m);
    }
  }

  function buildPlate(p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bw-plate' + (p.id === (root.getAttribute('data-ramp') || 'blue') ? ' on' : '');
    b.setAttribute('data-ramp', p.id);
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-label', p.name);
    b.innerHTML =
      '<span class="bw-pl-shine"></span>' +
      '<span class="bw-pl-art" style="background:linear-gradient(135deg,' + p.c[0] + ',' + p.c[1] + ' 55%,' + p.c[2] + ')"></span>' +
      '<span class="bw-pl-body">' +
      '  <span class="bw-dots">' + p.c.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' +
      '  <b class="bw-pl-name">' + p.name + '</b>' +
      '  <span class="bw-pl-desc">' + p.desc + '</span>' +
      '  <span class="bw-pl-mini">' +
      '    <i></i><i></i><b style="background:linear-gradient(90deg,' + p.c[0] + ',' + p.c[1] + ')"></b>' +
      '  </span>' +
      '</span>' +
      '<span class="bw-check">✓</span>';
    b.addEventListener('click', function () {
      markInteract();
      rotateTo(i);
    });
    return b;
  }

  function buildOverlay(app) {
    overlay = document.createElement('div');
    overlay.className = 'brand-welcome';
    overlay.id = 'brandWelcome';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('tabindex', '-1');
    overlay.innerHTML =
      '<div class="bw-meteors" aria-hidden="true"></div>' +
      '<div class="bw-inner">' +
      '  <div class="bw-head">' +
      '    <span class="bw-badge">品牌色 · 选择你的主题</span>' +
      '    <h2>转一下拨盘，<span class="bw-grad">整个界面跟着变</span></h2>' +
      '    <p>6 套品牌色排成一圈：拖拽、滚轮、箭头都能转。按钮、极光、解题页渐变、进度条都读取同一套 CSS 变量，选完可在左侧「品牌色」重选。</p>' +
      '  </div>' +
      '  <div class="bw-stage">' +
      '    <div class="bw-floor"></div>' +
      '    <div class="bw-dial" id="bwDial"><div class="bw-ring" id="bwRing"></div></div>' +
      '  </div>' +
      '  <div class="bw-controls">' +
      '    <button class="bw-arrow" id="bwPrev" type="button" aria-label="上一个主题">' +
      '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
      '    </button>' +
      '    <div class="bw-inds" id="bwInds"></div>' +
      '    <button class="bw-arrow" id="bwNext" type="button" aria-label="下一个主题">' +
      '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
      '    </button>' +
      '  </div>' +
      '  <div class="bw-drag-hint">拖拽 / 滚轮 / ← → 旋转 · 点击卡片选中</div>' +
      '  <div class="bw-current" id="bwCurrent">当前：<em>Velora Blue</em></div>' +
      '  <div class="bw-preview">' +
      '    <div class="bw-pre-title">Every effect follows <span class="bw-grad" id="bwPreGrad">your ramp</span></div>' +
      '    <div class="bw-pre-sub">旋转拨盘，下面的按钮、渐变与流光边框会立刻跟随。</div>' +
      '    <div class="bw-btns">' +
      '      <button class="bw-primary" type="button">主要操作</button>' +
      '      <button class="bw-secondary" type="button">次要操作</button>' +
      '    </div>' +
      '    <div class="bw-beam"><div class="bw-beam-in"><b>流光边框</b><span>连流动的光都跟随这套品牌色。</span></div></div>' +
      '  </div>' +
      '  <div class="bw-foot">' +
      '    <button class="bw-enter" id="bwEnter" type="button">进入题库</button>' +
      '    <span class="bw-hint">选择会自动保存</span>' +
      '  </div>' +
      '</div>';
    app.appendChild(overlay);

    ring = overlay.querySelector('#bwRing');
    dial = overlay.querySelector('#bwDial');
    var indsBox = overlay.querySelector('#bwInds');

    PRESETS.forEach(function (p, i) {
      var pl = buildPlate(p, i);
      plates.push(pl);
      ring.appendChild(pl);

      var d = document.createElement('button');
      d.type = 'button';
      d.setAttribute('aria-label', '主题 ' + (i + 1));
      d.addEventListener('click', function () { markInteract(); rotateTo(i); });
      inds.push(d);
      indsBox.appendChild(d);
    });

    buildMeteors(overlay.querySelector('.bw-meteors'));

    overlay.querySelector('#bwPrev').addEventListener('click', function () { markInteract(); step(-1); });
    overlay.querySelector('#bwNext').addEventListener('click', function () { markInteract(); step(1); });
    overlay.querySelector('#bwEnter').addEventListener('click', function () {
      try { localStorage.setItem('m2:ramp_seen', '1'); } catch (e) {}
      close();
    });

    /* 拖拽旋转 */
    dial.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      markInteract();
      drag = { x: e.clientX, start: angle, moved: false, captured: false };
      dial.classList.add('dragging');
    });
    dial.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) {
        drag.moved = true;
        if (!drag.captured) {
          drag.captured = true;
          try { dial.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }
      angle = drag.start + dx * 0.42;
      render();
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      dial.classList.remove('dragging');
      var idx = Math.round(-angle / 60);
      rotateTo(idx);
      if (!moved) { /* 点击由 plate 自己处理 */ }
    }
    dial.addEventListener('pointerup', endDrag);
    dial.addEventListener('pointercancel', endDrag);
    dial.addEventListener('pointerleave', function () { if (drag) endDrag(); });

    /* 滚轮 */
    dial.addEventListener('wheel', function (e) {
      e.preventDefault();
      markInteract();
      step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    /* 键盘 */
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); markInteract(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); markInteract(); step(1); }
      else if (e.key === 'Escape') { try { localStorage.setItem('m2:ramp_seen', '1'); } catch (x) {} close(); }
    });

    overlay.addEventListener('pointerdown', function () { markInteract(); }, { passive: true });
  }

  function open() {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    try { overlay.scrollTop = 0; overlay.focus({ preventScroll: true }); } catch (e) {}
    restartAuto();
  }
  function openInstant() {
    if (!overlay) return;
    overlay.classList.add('instant');
    open();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function addSidebarEntry() {
    var bar = document.getElementById('tabbar');
    if (!bar || bar.querySelector('.tab-brand')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab tab-brand';
    btn.innerHTML = '<span class="bw-dot"></span><span>品牌色</span>';
    btn.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      open();
    }, true);
    bar.appendChild(btn);
  }

  function init() {
    var app = document.getElementById('app');
    if (!app) return;

    var saved = 'blue';
    try { saved = localStorage.getItem('m2:ramp') || 'blue'; } catch (e) {}
    root.setAttribute('data-ramp', saved);

    buildOverlay(app);
    addSidebarEntry();

    index = PRESETS.indexOf(presetOf(saved));
    angle = -60 * index;
    render();
    applyRamp(saved, false);

    try {
      var qs = new URLSearchParams(location.search || '');
      var qr = qs.get('ramp');
      if (qr) {
        var p = presetOf(qr);
        index = PRESETS.indexOf(p);
        angle = -60 * index;
        render();
        applyRamp(p.id);
      }
      var seen = qs.get('welcome') === '0' || localStorage.getItem('m2:ramp_seen') === '1';
      if (qs.get('welcome') === '1') openInstant();
      else if (!seen) setTimeout(open, 300);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
