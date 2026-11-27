/* ============================================================
   星云首页 · Canvas 星云 + 鼠标黑洞引力透镜 + 功能卡运镜
   纯 Canvas 2D，无 WebGL 依赖；DPR 上限 2，移动端降低粒子数
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('nxCanvas');
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1;

  var COLORS = [
    [129, 140, 248], [96, 165, 250], [34, 211, 238],
    [192, 38, 211], [244, 114, 182], [250, 204, 21]
  ];
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  var blobs = [];
  var stars = [];
  var px = 0, py = 0, tx = 0, ty = 0;
  var mx = 0, my = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  }

  function seed() {
    blobs = [];
    var nb = W < 700 ? 5 : 8;
    for (var i = 0; i < nb; i++) {
      blobs.push({
        x: Math.random(), y: Math.random(),
        r: 0.24 + Math.random() * 0.5,
        c: pick(COLORS),
        a: 0.08 + Math.random() * 0.10,
        phase: Math.random() * 6.28,
        speed: 0.25 + Math.random() * 0.65,
        depth: 0.2 + Math.random() * 0.6
      });
    }
    stars = [];
    var count = W < 700 ? 460 : 1300;
    for (var j = 0; j < count; j++) {
      var z = 0.2 + Math.random() * 0.8;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: z,
        r: 0.35 + z * 1.5,
        c: pick(COLORS),
        a: 0.22 + Math.random() * 0.65,
        tw: Math.random() * 6.28
      });
    }
  }

  resize();
  window.addEventListener('resize', resize);

  px = tx = W / 2;
  py = ty = H * 0.42;

  var moved = false;
  function idlePos() {
    if (W < 700) return [W * 0.84, H * 0.12];
    return [W * 0.74, H * 0.40];
  }
  function resetIdle() {
    var p = idlePos();
    tx = p[0]; ty = p[1];
    mx = 0; my = 0;
    moved = false;
  }
  resetIdle();
  px = tx; py = ty;

  window.addEventListener('pointermove', function (e) {
    tx = e.clientX;
    ty = e.clientY;
    mx = e.clientX / W - 0.5;
    my = e.clientY / H - 0.5;
    moved = true;
  }, { passive: true });
  window.addEventListener('pointerleave', resetIdle, { passive: true });

  var start = performance.now();

  function frame(now) {
    var t = (now - start) / 1000;
    var ease = reduce ? 1 : 0.09;
    px += (tx - px) * ease;
    py += (ty - py) * ease;
    var time = t * 0.08;
    var cx = Math.sin(time * 0.7) * 26 - mx * 38;
    var cy = Math.cos(time * 0.6) * 20 - my * 28;

    /* 背景 */
    ctx.globalCompositeOperation = 'source-over';
    var bg = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, Math.max(W, H) * 0.85);
    bg.addColorStop(0, '#0a0a18');
    bg.addColorStop(0.55, '#06060f');
    bg.addColorStop(1, '#030308');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 星云层 */
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = b.x * W + Math.sin(time * b.speed + b.phase) * 90 + cx * b.depth;
      var by = b.y * H + Math.cos(time * b.speed * 0.8 + b.phase) * 70 + cy * b.depth;
      var rr = b.r * Math.min(W, H);
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      g.addColorStop(0, rgba(b.c, b.a));
      g.addColorStop(0.45, rgba(b.c, b.a * 0.28));
      g.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, rr, 0, 6.283);
      ctx.fill();
    }

    /* 星群 + 引力透镜 */
    var horizon = Math.min(W, H) * 0.045;
    var lens = Math.max(W, H) * 0.32;
    for (var k = 0; k < stars.length; k++) {
      var s = stars[k];
      var x = s.x + Math.sin(time * 1.3 + s.tw) * 2.2 + cx * s.z;
      var y = s.y + Math.cos(time * 1.1 + s.tw) * 2.2 + cy * s.z;
      if (x < -30) x += W + 60; else if (x > W + 30) x -= W + 60;
      if (y < -30) y += H + 60; else if (y > H + 30) y -= H + 60;

      var dx = x - px, dy = y - py;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < horizon) continue;

      var alpha = s.a;
      var r = s.r;
      if (d < lens) {
        var q = 1 - d / lens;
        var ang = Math.atan2(dy, dx) + q * 1.15;
        var rr2 = horizon + (d - horizon) * (1 + 0.7 * q);
        x = px + Math.cos(ang) * rr2;
        y = py + Math.sin(ang) * rr2;
        alpha *= 0.55 + 0.45 * (1 - q);
        r *= 1 + 0.65 * q;
      }
      ctx.fillStyle = rgba(s.c, alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    }

    /* 吸积盘光晕 */
    var halo = ctx.createRadialGradient(px, py, horizon * 0.8, px, py, horizon * 4.4);
    halo.addColorStop(0, 'rgba(170,195,255,.55)');
    halo.addColorStop(0.22, 'rgba(120,130,255,.30)');
    halo.addColorStop(0.55, 'rgba(80,80,220,.10)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(px, py, horizon * 4.4, 0, 6.283);
    ctx.fill();

    /* 事件视界 */
    ctx.globalCompositeOperation = 'source-over';
    var voidG = ctx.createRadialGradient(px, py, horizon * 1.02, px, py, horizon * 2.1);
    voidG.addColorStop(0, 'rgba(0,0,0,1)');
    voidG.addColorStop(0.7, 'rgba(0,0,0,.96)');
    voidG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = voidG;
    ctx.beginPath();
    ctx.arc(px, py, horizon * 2.1, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(px, py, horizon, 0, 6.283);
    ctx.fill();

    /* 光子环 */
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1, horizon * 0.13);
    ctx.strokeStyle = 'rgba(200,225,255,.85)';
    ctx.beginPath();
    ctx.arc(px, py, horizon * 1.07, 0, 6.283);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, horizon * 0.34);
    ctx.strokeStyle = 'rgba(129,140,248,.32)';
    ctx.beginPath();
    ctx.arc(px, py, horizon * 1.34, 0, 6.283);
    ctx.stroke();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- 功能卡：视差 + 运镜 ---------- */
  var cards = Array.prototype.slice.call(document.querySelectorAll('.nx-card'));
  var diving = false;

  document.addEventListener('pointermove', function (e) {
    var rx = e.clientX / W - 0.5;
    var ry = e.clientY / H - 0.5;
    cards.forEach(function (card) {
      var d = parseFloat(card.getAttribute('data-depth')) || 1;
      card.style.transform = 'translate3d(' + (rx * d * 18) + 'px,' + (ry * d * 13) + 'px,0)';
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / Math.max(r.width, 1) * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / Math.max(r.height, 1) * 100) + '%');
    });
  }, { passive: true });

  function dive(card) {
    if (diving) return;
    diving = true;
    var r = card.getBoundingClientRect();
    var ox = r.left + r.width / 2;
    var oy = r.top + r.height / 2;
    document.body.style.setProperty('--ox', ox + 'px');
    document.body.style.setProperty('--oy', oy + 'px');
    document.body.classList.add('diving');
    var target = card.getAttribute('data-href');
    if (window.__withShareCode__) target = window.__withShareCode__(target);
    if (window.__cleanUrl__) target = String(target).replace(/(^|\/)index\.html/, '$1').replace(/\/(home|english)\.html/, '/$1');
    setTimeout(function () { window.location.href = target; }, 700);
  }

  cards.forEach(function (card) {
    card.addEventListener('mouseenter', function () { card.classList.add('hov'); });
    card.addEventListener('mouseleave', function () { card.classList.remove('hov'); });
    card.addEventListener('click', function () { dive(card); });
  });

  /* 键盘 1-5 进入对应功能；Esc 回题库 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var r = 'index.html?app=1'; if (window.__withShareCode__) r = window.__withShareCode__(r); window.location.href = r; return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= cards.length) dive(cards[n - 1]);
  });
})();


