/* ============================================================
   数二真题全解 · App 逻辑 v2
   数据：data/index.json（轻量索引）+ data/y{year}.json（按年懒加载）
   ============================================================ */
(function () {
  'use strict';

  const VERSION = '3.18.0';
  const SHARE = location.search || '';

  /* 学科板块：数学、政治已上线，英语占位 */
  const SUBJECTS = [
    { id: 'math',     name: '数学',  full: '数学二', ready: true,
      note: '1987–2025 全国统考 · 逐年整卷', plan: '',
      ui: { foldFx: '用到的公式', foldStep: '计算过程', foldAns: '标准答案',
            tabFormula: '公式', tabMap: '规律' } },
    { id: 'politics', name: '政治',  full: '思想政治理论', ready: true,
      note: '100 分 · 单选 16 / 多选 17 / 分析 5',
      plan: '',
      ui: { foldFx: '用到的考点', foldStep: '解题思路', foldAns: '参考答案',
            tabFormula: '考点', tabMap: '规律' } },
    { id: 'english',  name: '英语',  full: '英语（二）', ready: true,
      note: '100 分 · 完形 10 / 阅读 40 / 新题型 10 / 翻译 15 / 写作 25',
      plan: '',
      ui: { foldFx: '难点词', foldStep: '解析', foldAns: '答案',
            tabFormula: '词汇', tabMap: '规律' } }
  ];

  const MATH_TYPES = [
    '极限与连续', '导数与微分', '中值定理·证明', '不定积分', '定积分与反常积分',
    '积分应用', '多元函数微分', '二重积分', '微分方程',
    '行列式与矩阵', '向量与线性方程组', '特征值·二次型', '综合题'
  ];
  const POL_TYPES = [
    '马原·唯物论', '马原·辩证法', '马原·认识论', '马原·唯物史观',
    '马原·政治经济学', '马原·科学社会主义',
    '毛中特', '史纲', '思修法基', '形势与政策'
  ];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s);

  /* ---------------- 存储 ---------------- */
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('m2:' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem('m2:' + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------------- 状态 ---------------- */
  const state = {
    tab: 'tiku',
    sub: store.get('sub', 'math'),   // 当前学科板块
    year: null,          // null = 年份总览
    q: '',
    done: new Set(store.get('done', [])),
    ticked: store.get('ticked', {}),
    kp: store.get('kpOn', {}),
    theme: store.get('theme', 'auto'),
    fs: store.get('fs', 'm'),
    idx: null,           // index.json
    meta: null,
    years: {},           // {1989: {y, qs}}
    list: [],            // 当前列表（完整题目对象数组）
    cur: -1,
    paperYear: null
  };

  const keyOf = p => p.y + '-' + p.no;

  /* ---------------- MathJax ---------------- */
  let mjxReady = false;
  const pending = new Set();
  // 判断容器里是否还有没被 MathJax 处理的源码
  const hasRaw = el => /\$[^$]+\$/.test(el.textContent || '');
  function typeset(el, n) {
    if (!el) return Promise.resolve();
    n = n || 0;
    if (!mjxReady) { pending.add(el); return Promise.resolve(); }
    // 只有"标记已排版"且内部确实没有残留 $...$ 源码时才跳过。
    // 详情页/整卷页复用同一个容器并重写 innerHTML，只认标记会把新内容整片漏掉。
    if (el.dataset.ts === '1' && !hasRaw(el)) return Promise.resolve();
    el.dataset.ts = '1';
    try { MathJax.typesetClear([el]); } catch (e) {}
    // 容器刚显示或引擎刚就绪时，typesetPromise 可能静默失败（既不排版也不报错），
    // 所以排完自检一次：还有源码就退避重试，最多 5 次。
    const retry = () => {
      if (n >= 5 || !el.isConnected || !hasRaw(el)) return;
      delete el.dataset.ts;
      setTimeout(() => typeset(el, n + 1), 120 * (n + 1));
    };
    const done = () => {
      if (hasRaw(el)) { retry(); return; }
      // 等一帧，折叠块展开动画结束后再量，否则量到的是隐藏态
      requestAnimationFrame(() => requestAnimationFrame(() => fixWide(el)));
    };
    try { return MathJax.typesetPromise([el]).then(done, retry); } catch (e) { retry(); return Promise.resolve(); }
  }
  // 长公式：MathJax 的 SVG 带 max-width，超宽时会被整体等比缩小，超得多就糊成一片。
  // 这里量自然宽度：轻微超出（≤1.25 倍）仍走缩小，保住行末标点；超出一截的改成可横向滚动。
  function fixWide(el) {
    if (!el.querySelectorAll) return;
    el.querySelectorAll('mjx-container').forEach(c => {
      const svg = c.querySelector('svg');
      const host = c.parentElement;
      if (!svg || !host) return;
      const avail = host.clientWidth - 6;
      if (avail <= 0) return;
      svg.style.maxWidth = 'none';
      c.style.maxWidth = 'none';
      const nat = svg.getBoundingClientRect().width;
      svg.style.maxWidth = '';
      c.style.maxWidth = '';
      if (!nat) return;
      c.classList.toggle('fxc', nat > avail * 1.25);
    });
  }
  function flushPending() {
    pending.forEach(el => { if (el.isConnected) typeset(el); });
    pending.clear();
  }
  // 折叠块内容在展开时才排版（MathJax 对 display:none 的元素排版会算错宽度）
  function typesetLazy(box) {
    const body = box.querySelector('.fold-body');
    if (body) typeset(body);
  }

  /* ---------------- 主题 / 字号 ---------------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effectiveTheme() { return state.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : state.theme; }
  function applyTheme() {
    const t = effectiveTheme();
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#000000' : '#F2F3F7');
  }
  mq.addEventListener('change', () => { if (state.theme === 'auto') applyTheme(); });
  function applyFs() { document.documentElement.dataset.fs = state.fs; }

  /* ---------------- 数据加载 ---------------- */
  const loading = new Set();
  const dp = p => 'data/' + state.sub + '/' + p;   // 按学科分目录
  const curSubject = () => SUBJECTS.find(s => s.id === state.sub) || SUBJECTS[0];
  const curUI = () => curSubject().ui || SUBJECTS[0].ui;
  const curTypes = () => (state.sub === 'politics' ? POL_TYPES : MATH_TYPES);
  async function getJSON(url) {
    const r = await fetch(url + SHARE, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  async function loadIndex() {
    if (state.idx) return state.idx;
    const d = await getJSON(dp('index.json'));
    state.idx = d;
    return d;
  }
  async function loadMeta() {
    if (state.meta) return state.meta;
    state.meta = await getJSON(dp('meta.json'));
    return state.meta;
  }
  async function loadYear(y) {
    if (state.years[y]) return state.years[y];
    if (loading.has(y)) { await new Promise(r => setTimeout(r, 80)); return loadYear(y); }
    loading.add(y);
    try {
      const d = await getJSON(dp('y' + y + '.json'));
      (d.qs || []).forEach(q => { q.y = d.y || y; });
      state.years[y] = d;
      return d;
    } finally { loading.delete(y); }
  }

  /* 切换学科：清空已加载的索引与年份缓存 */
  function switchSubject(id) {
    if (state.sub === id) return;
    state.sub = id;
    store.set('sub', id);
    state.idx = null; state.meta = null;
    state.years = {}; state.year = null; state.list = [];
    syncTabLabels();
    syncSearchWrap();
    $('#main').scrollTop = 0;
    if (state.tab === 'tiku') renderTiku();
    else if (state.tab === 'type') renderTypes();
    else if (state.tab === 'formula') renderFormula();
    else if (state.tab === 'map') renderMap();
    else if (state.tab === 'me') renderMe();
  }

  /* 底部 tab 文案随学科变化 */
  function syncTabLabels() {
    const f = $('.tab[data-tab="formula"] span');
    if (f) f.textContent = curUI().tabFormula;
  }

  /* ---------------- Tab ---------------- */
  const PAGE_META = {
    tiku:    { title: '题库', sub: '' },
    type:    { title: '题型', sub: '按题型归类 · 知识点标注' },
    formula: { title: '公式', sub: '按教材章节顺序 · 高数 / 线代 / 概率' },
    map:     { title: '规律', sub: '题位表与历年观察' },
    solver:  { title: '解题', sub: '输入题目 · 自动计算 · 步骤与考点' },
    me:      { title: '我的', sub: '进度与设置' }
  };

  function syncSearchWrap() {
    const on = (state.tab === 'tiku' || state.tab === 'type') && state.sub !== 'english';
    const w = $('#searchWrap');
    if (w) w.classList.toggle('on', on);
  }

  function switchTab(t) {
    state.tab = t;
    $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.page').forEach(p => { p.hidden = (p.id !== 'page-' + t); });
    $('#pageTitle').textContent = t === 'formula' ? curUI().tabFormula
      : (t === 'map' && state.sub === 'politics' ? '考频' : PAGE_META[t].title);
    $('#pageSub').textContent = PAGE_META[t].sub;
    syncSearchWrap();
    syncTabLabels();
    $('#main').scrollTop = 0;
    if (t === 'tiku') renderTiku();
    if (t === 'type') renderTypes();
    if (t === 'formula') renderFormula();
    if (t === 'map') renderMap();
    if (t === 'me') renderMe();
    if (t === 'solver' && window.MathSolverUI) window.MathSolverUI.mount();
  }

  /* ---------------- 题库 ---------------- */
  function yearStats() {
    const m = {};
    (state.idx ? state.idx.items : []).forEach(p => {
      const s = m[p.y] || (m[p.y] = { y: p.y, n: 0, done: 0 });
      s.n++;
      if (state.done.has(p.y + '-' + p.no)) s.done++;
    });
    return m;
  }

  /* ---------------- 学科板块条 ---------------- */
  function renderSubBar(show) {
    const bar = $('#subBar');
    if (!bar) return;
    if (show === false) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = SUBJECTS.map(s => {
      const on = s.id === state.sub;
      return `<button class="subchip${on ? ' on' : ''}${s.ready ? '' : ' soon'}" data-sub="${s.id}">
        <b>${s.name}</b>${s.ready ? '' : '<em>筹备</em>'}
      </button>`;
    }).join('');
  }

  function renderPlanned(subj) {
    $('#yearChips').innerHTML = '';
    $('#paperBar').hidden = true;
    $('#pageTitle').textContent = subj.name + '真题';
    $('#pageSub').textContent = subj.note;
    $('#listWrap').className = 'list';
    $('#listWrap').innerHTML = `<div class="planned">
      <div class="pl-ic">${subj.name.slice(0, 1)}</div>
      <h3>${subj.full} 板块正在筹备</h3>
      <p>${subj.plan}</p>
      <p class="pl-note">先把数学二补齐，再按同一套结构接这个板块——题目、用到的公式、计算过程、标准答案，四块分开折叠，一样可以整卷模拟。</p>
    </div>`;
    $('#listEnd').textContent = '';
  }

  function renderTabSoon(wrapId, leadId, kind) {
    const s = curSubject();
    const en = s.id === 'english';
    const label = kind === 'type' ? '题型分类'
      : kind === 'formula' ? (en ? '词汇本' : '公式库')
      : '规律分析';
    const ld = leadId ? $('#' + leadId) : null;
    if (en) $('#pageSub').textContent = kind === 'type' ? '按题型看整卷' : '历年规律';
    if (ld) ld.textContent = en
      ? (kind === 'type' ? '题型总览还在做，先按年份看整卷。' : '规律分析还在做，先看整卷。')
      : `${s.name}板块正在筹备，先看数学。`;
    $('#' + wrapId).innerHTML = `<div class="planned">
      <div class="pl-ic">${s.name.slice(0, 1)}</div>
      <h3>${s.full} · ${label}待录入</h3>
      <p>${s.plan}</p>
      <p class="pl-note">${en ? '先去「题库」按年份看整卷。' : '切回「数学」可以继续用。'}</p>
    </div>`;
  }

  function renderTiku() {
    renderSubBar(!state.year);
    const subj = curSubject();
    if (!subj.ready) { renderPlanned(subj); return; }
    if (state.sub === 'english') { renderEnTiku(); return; }
    if (!state.idx) {
      $('#listWrap').innerHTML = '<div class="empty">正在加载题库…</div>';
      loadIndex().then(() => renderTiku()).catch(() => {
        $('#listWrap').innerHTML = '<div class="empty">题库加载失败<br><span style="font-size:12.5px;opacity:.7">点「我的 → 检查更新」重试</span></div>';
      });
      return;
    }
    if (state.year) renderYearList(); else renderYearGrid();
  }

  function renderYearGrid() {
    const st = yearStats();
    const subj = curSubject();
    const years = Object.keys(st).map(Number).sort((a, b) => b - a);
    const total = state.idx.items.length;
    const sub = $('#pageSub');
    if (sub) sub.textContent = `${years[years.length - 1]}–${years[0]} · ${years.length} 年 · ${total} 题`;
    $('#pageTitle').textContent = subj.name + '真题';

    $('#yearChips').innerHTML = '';
    $('#paperBar').hidden = true;
    $('#listWrap').className = 'list year-grid';
    $('#listWrap').innerHTML = years.map(y => {
      const s = st[y];
      const pct = s.n ? Math.round(s.done / s.n * 100) : 0;
      return `<button class="ycell${pct === 100 ? ' full' : ''}" data-y="${y}">
        <b>${y}</b>
        <span>${s.n} 题${s.done ? ' · ' + s.done + ' 已掌握' : ''}</span>
        <i class="ybar"><em style="width:${pct}%"></em></i>
      </button>`;
    }).join('');
    $('#listEnd').textContent = '点亮年份看当年全部题目';
  }

  async function renderYearList() {
    const y = state.year;
    $('#listWrap').className = 'list';
    $('#listWrap').innerHTML = '<div class="empty">读取 ' + y + ' 年题目…</div>';
    let d;
    try { d = await loadYear(y); }
    catch (e) {
      $('#listWrap').innerHTML = '<div class="empty">这一年还没录入<br><span style="font-size:12.5px;opacity:.7">点返回换个年份</span></div>';
      return;
    }
    const qs = d.qs;
    state.list = qs;
    const secCount = qs.reduce((a, q) => (a[q.sec] = (a[q.sec] || 0) + 1, a), {});
    const secTxt = Object.keys(secCount).map(k => k + ' ' + secCount[k]).join(' · ');

    $('#yearChips').innerHTML = `<button class="back-chip" id="yearBack">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      全部年份</button><span class="chip-year">${y} 年 · ${qs.length} 题</span>`;

    const bar = $('#paperBar');
    bar.hidden = false;
    $('#paperInfo').textContent = secTxt;
    $('#btnPaper').textContent = '整卷模拟';

    $('#pageSub').textContent = `${y} 年 · ${qs.length} 题`;
    $('#pageTitle').textContent = curSubject().name + '真题';

    $('#listWrap').innerHTML = qs.map((p, i) => {
      const k = keyOf(p);
      const done = state.done.has(k);
      const topics = (p.topics || []).slice(0, 3)
        .map(t => `<i class="tp">${esc(t)}</i>`).join('');
      return `<button class="qcard${done ? ' done' : ''}" data-i="${i}">
        <span class="qno"><b>${p.no}</b><span>${p.sec === '解答' ? '解答' : p.sec}</span></span>
        <span class="qmid">
          <span class="qt">${esc(p.title || p.type)}</span>
          <span class="qm"><i class="tg">${esc(p.type)}</i><i class="dot"></i><span>${p.pts} 分</span></span>
          <span class="qtopics">${topics}</span>
        </span>
        <span class="qstat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></span>
      </button>`;
    }).join('');

    const doneN = qs.filter(p => state.done.has(keyOf(p))).length;
    $('#listEnd').textContent = `共 ${qs.length} 题 · 已掌握 ${doneN} 题`;
    typeset($('#listWrap'));
  }

  /* ---------------- 折叠块 ---------------- */
  function foldBlock(title, icon, innerHTML, opened) {
    return `<div class="fold${opened ? ' open' : ''}">
      <button class="fold-head">
        <span class="fold-ic">${icon}</span>
        <span class="fold-tt">${title}</span>
        <span class="fold-ar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
      </button>
      <div class="fold-body">${innerHTML}</div>
    </div>`;
  }

  function fxFold(fxs, opened) {
    if (!fxs || !fxs.length) return '';
    return foldBlock(curUI().foldFx, 'ƒ',
      `<ol class="fx-list">${fxs.map(x => `<li>${x}</li>`).join('')}</ol>`, opened);
  }

  /* ================= 基础巩固 · 知识点卡 ================= */
  const KP2 = { idxP: null, cache: {} };
  function kp2Index() {
    if (!KP2.idxP) KP2.idxP = getJSON('data/math/kp/index.json').catch(() => null);
    return KP2.idxP;
  }
  function kp2Ids(idx, obj) {
    if (!idx || !idx.map) return [];
    const out = [];
    (obj.topics || []).forEach(t => {
      (idx.map[t] || []).forEach(id => { if (out.indexOf(id) < 0) out.push(id); });
    });
    return out;
  }
  function kp2Fold() {
    if (state.sub !== 'math') return '';
    return `<div class="fold k2-fold" data-k2="1" hidden>
      <button class="fold-head">
        <span class="fold-ic">◈</span>
        <span class="fold-tt">先补基础 · <b class="k2-cnt">…</b></span>
        <span class="fold-ar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
      </button>
      <div class="fold-body">
        <div class="k2-tip">忘了先看这里：每个知识点都是「是什么 → 公式 → 怎么套 → 练 2 题」，基础题的解法和本题同一套路。</div>
        <div class="k2-list"></div>
      </div>
    </div>`;
  }
  async function kp2Fill(root, obj) {
    if (!root || state.sub !== 'math') return;
    const fold = root.querySelector('.k2-fold[data-k2]');
    if (!fold) return;
    const idx = await kp2Index();
    const ids = idx ? kp2Ids(idx, obj) : [];
    if (!ids.length) { fold.remove(); return; }
    fold.hidden = false;
    fold.querySelector('.k2-cnt').textContent = ids.length + ' 个知识点';
    fold.querySelector('.k2-list').innerHTML = ids.map(id => {
      const it = (idx.items || {})[id] || {};
      return `<div class="k2-card" data-id="${esc(id)}" data-loaded="0">
        <button class="k2-head">
          <span class="k2-nm">${esc(it.name || id)}</span>
          ${it.cat ? `<i class="k2-cat">${esc(it.cat)}</i>` : ''}
          <span class="k2-ar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
        </button>
        <div class="k2-body" hidden></div>
      </div>`;
    }).join('');
  }
  function kp2DrillHTML(dr, i) {
    return `<div class="k2-dr">
      <div class="k2-drh"><b>练 ${i + 1}</b>${dr.link ? `<i class="k2-link">${dr.link}</i>` : ''}</div>
      <div class="k2-think"><i>思路</i><span>${dr.think}</span></div>
      ${dr.use ? `<div class="k2-use"><i>用的公式</i><span>${dr.use}</span></div>` : ''}
      <div class="k2-q">${dr.q}</div>
      <button class="k2-btn">看解法</button>
      <div class="k2-sol" hidden>
        <ol class="k2-steps">${(dr.steps || []).map(s => `<li>${s}</li>`).join('')}</ol>
        <div class="k2-ans"><i>答案</i><span>${dr.ans}</span></div>
      </div>
    </div>`;
  }
  function kp2BodyHTML(d) {
    return `${d.brief ? `<p class="k2-brief">${d.brief}</p>` : ''}
      ${(d.figs || []).length ? `<div class="k2-sec"><div class="k2-sh">看图分辨</div><div class="k2-figs">${
        d.figs.map(f => `<figure class="k2-fig"><div class="kf-box">${f.svg}</div><figcaption><b>${f.t}</b><span>${f.d}</span></figcaption></figure>`).join('')}</div></div>` : ''}
      ${(d.body || []).length ? `<div class="k2-sec"><div class="k2-sh">是什么</div>${
        d.body.map(x => `<p class="k2-p">${x}</p>`).join('')}</div>` : ''}
      ${(d.formulas || []).length ? `<div class="k2-sec"><div class="k2-sh">公式<button class="k2-go" data-go="chp">公式手册 ›</button></div><ul class="k2-fx">${
        d.formulas.map(f => `<li><b>${f[0]}</b><span>${f[1]}</span></li>`).join('')}</ul></div>` : ''}
      ${(d.howto || []).length ? `<div class="k2-sec"><div class="k2-sh">怎么套用</div><ol class="k2-how">${
        d.howto.map(x => `<li>${x}</li>`).join('')}</ol></div>` : ''}
      ${(d.drills || []).length ? `<div class="k2-sec"><div class="k2-sh">练 ${d.drills.length} 题</div>${
        d.drills.map(kp2DrillHTML).join('')}</div>` : ''}`;
  }
  async function kp2Open(card) {
    const body = card.querySelector('.k2-body');
    const open = !card.classList.contains('on');
    card.classList.toggle('on', open);
    body.hidden = !open;
    if (!open || card.dataset.loaded === '1') return;
    const id = card.dataset.id;
    let d = KP2.cache[id];
    if (!d) {
      body.innerHTML = '<div class="k2-load">加载中…</div>';
      d = await getJSON('data/math/kp/' + id + '.json').catch(() => null);
      if (!d) { body.innerHTML = '<div class="k2-load">这个知识点还没写好。</div>'; return; }
      KP2.cache[id] = d;
    }
    body.innerHTML = kp2BodyHTML(d);
    card.dataset.loaded = '1';
    typeset(body);
  }
  function kp2Click(e) {
    const go = e.target.closest('.k2-go');
    if (go) {
      closeDetail();
      switchTab('formula');
      return true;
    }
    const hd = e.target.closest('.k2-head');
    if (hd) { kp2Open(hd.closest('.k2-card')); return true; }
    const bt = e.target.closest('.k2-btn');
    if (bt) {
      const sol = bt.parentNode.querySelector('.k2-sol');
      const show = sol.hidden;
      sol.hidden = !show;
      bt.classList.toggle('on', show);
      bt.textContent = show ? '收起解法' : '看解法';
      if (show) typeset(sol);
      return true;
    }
    return false;
  }
  function stepFold(steps, opened) {
    if (!steps || !steps.length) return '';
    const ticks = state.ticked[keyOf(state.curObj || {})] || [];
    return foldBlock(curUI().foldStep, '▸',
      `<div class="steps">${steps.map((s, n) =>
        `<button class="step${ticks.indexOf(n) >= 0 ? ' tick' : ''}" data-n="${n}"><span class="step-num">${n + 1}</span><span class="step-txt">${s}</span></button>`
      ).join('')}</div>`, opened);
  }
  function ansFold(obj, opened) {
    if (!obj || !obj.ans) return '';
    const kp = obj.kp || [];
    if (!kp.length) {
      return foldBlock(curUI().foldAns, '✓',
        `<div class="ans-box"><div class="v">${cleanAns(obj.ans)}</div></div>`, opened);
    }
    const key = keyOf(obj);
    return foldBlock(curUI().foldAns, '✓',
      `<div class="ans-box kpbox" data-ans="${key}">
        ${kpHead(kp)}
        <div class="v kpv">${markKp(cleanAns(obj.ans), kp)}</div>
        ${kpList(kp, obj)}
      </div>`, opened);
  }
  function cleanAns(a) { return (a || '').replace(/^\s*<em>\s*答案\s*<\/em>\s*/i, ''); }

  /* ---------- 分析题踩分点 ---------- */
  // 正文里把踩分点原文包成 <mark>，其余纯文本包成 .kpo（供「只看踩分点」淡化）
  function markKp(html, kp) {
    const src = String(html || '');
    let plain = '';
    const map = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '<') {
        const j = src.indexOf('>', i);
        if (j > i) { i = j; continue; }
      }
      plain += src[i]; map.push(i);
    }
    const hits = [];
    kp.forEach((it, idx) => {
      const w = it && it[0];
      if (!w) return;
      const pos = plain.indexOf(w);
      if (pos < 0) return;
      let s = map[pos], e = map[pos + w.length - 1] + 1;
      if (s == null || e == null) return;
      // 对齐到标签边界，避免 <mark> 与 <b> 交叉
      let g = 0;
      while (g++ < 6) {
        const back = src.slice(0, s).match(/<[a-z][^>]*>$/i);
        if (!back) break;
        s -= back[0].length;
      }
      g = 0;
      while (g++ < 6) {
        const fwd = src.slice(e).match(/^<\/[a-z]+>/i);
        if (!fwd) break;
        e += fwd[0].length;
      }
      if (hits.some(h => s < h.e && e > h.s)) return;
      hits.push({ s, e, i: idx });
    });
    hits.sort((a, b) => a.s - b.s);
    const out = [];
    let cur = 0;
    hits.forEach(h => {
      out.push(kpoWrap(src.slice(cur, h.s)));
      out.push('<mark class="kp" data-k="' + h.i + '">' + src.slice(h.s, h.e) +
        '<sup class="kpn">' + (h.i + 1) + '</sup></mark>');
      cur = h.e;
    });
    out.push(kpoWrap(src.slice(cur)));
    return out.join('');
  }
  function kpoWrap(s) {
    if (!s) return '';
    return s.replace(/<[^>]+>|[^<]+/g, m =>
      (m.charAt(0) === '<' || !m.trim()) ? m : '<span class="kpo">' + m + '</span>');
  }

  function kpHead(kp) {
    const sum = kp.reduce((a, b) => a + (Number(b && b[1]) || 0), 0);
    return `<div class="kp-head">
        <span class="kp-sum"><b>${kp.length}</b> 个踩分点 · 合计 <b>${sum}</b> 分</span>
        <button class="kp-toggle">只看踩分点</button>
      </div>
      <div class="kp-tip">考场按点给分：下列语句要<em>一字不差</em>写出来，换字、漏字、换语序都不得分；写满但不沾点，也是零分。</div>`;
  }

  function kpList(kp, obj) {
    const key = keyOf(obj);
    const on = state.kp[key] || [];
    return `<div class="kp-list">
        <div class="kp-list-h">
          <span>踩分点清单</span>
          <span class="kp-prog"><b>${on.length}</b>/${kp.length} 已记</span>
        </div>
        <ol>${kp.map((it, i) => {
          const w = esc(it[0]), p = it[1] || '', bad = it[2] || '';
          const ok = on.indexOf(i) >= 0;
          return `<li class="kp-item${ok ? ' on' : ''}" data-kp="${i}" data-kpk="${key}">
            <button class="kp-chk" data-kp="${i}" data-kpk="${key}" aria-label="标记已记住">${ok ? '✓' : ''}</button>
            <span class="kp-n">${i + 1}</span>
            <span class="kp-t">${w}</span>
            <span class="kp-p">${p} 分</span>
            ${bad ? `<span class="kp-b">${bad}</span>` : ''}
          </li>`;
        }).join('')}</ol>
      </div>`;
  }

  function toggleKp(key, i) {
    const arr = state.kp[key] || (state.kp[key] = []);
    const at = arr.indexOf(i);
    if (at >= 0) arr.splice(at, 1); else arr.push(i);
    store.set('kpOn', state.kp);
    const on = arr.indexOf(i) >= 0;
    $$('.kp-item[data-kpk="' + key + '"][data-kp="' + i + '"]').forEach(li => {
      li.classList.toggle('on', on);
      const b = li.querySelector('.kp-chk');
      if (b) b.textContent = on ? '✓' : '';
    });
    $$('.ans-box[data-ans="' + key + '"] .kp-prog b').forEach(el => {
      el.textContent = arr.length;
    });
    if (navigator.vibrate) navigator.vibrate(6);
  }

  function toggleKpOnly(btn) {
    const box = btn.closest('.ans-box');
    if (!box) return;
    const on = box.classList.toggle('only');
    btn.textContent = on ? '看全文' : '只看踩分点';
  }

  // 详情页 / 整卷页共用的踩分点点击处理；返回 true 表示已消费
  function handleKpClick(e) {
    const chk = e.target.closest('.kp-chk');
    if (chk) { toggleKp(chk.dataset.kpk, +chk.dataset.kp); return true; }
    const tg = e.target.closest('.kp-toggle');
    if (tg) { toggleKpOnly(tg); return true; }
    const mk = e.target.closest('mark.kp');
    if (mk) {
      const box = mk.closest('.ans-box');
      const li = box && box.querySelector('.kp-item[data-kp="' + mk.dataset.k + '"]');
      if (li) {
        const sc = li.closest('.dscroll');
        if (sc) {
          const d = li.getBoundingClientRect().top - sc.getBoundingClientRect().top;
          const top = sc.scrollTop + d - sc.clientHeight / 2 + li.offsetHeight / 2;
          sc.scrollTop = Math.max(0, top);
        }
        li.classList.add('hit');
        setTimeout(() => li.classList.remove('hit'), 1400);
      }
      return true;
    }
    return false;
  }

  function topicLine(p) {
    const ts = (p.topics || []).map(t => `<i class="tp">${esc(t)}</i>`).join('');
    return ts ? `<div class="dtopics">${ts}</div>` : '';
  }

  /* ---------------- 详情 ---------------- */
  let curObj = null;
  function openDetail(obj) {
    if (!obj) return;
    curObj = obj; state.curObj = obj;
    trackView(obj.y + '-' + obj.no);
    const k = keyOf(obj);
    $('#dNo').textContent = obj.y + ' · 第 ' + obj.no + ' 题';
    const marked = state.done.has(k);
    $('#dMark').classList.toggle('on', marked);
    $('#dMark').setAttribute('aria-pressed', marked ? 'true' : 'false');

    const isPaper = obj.fromPaper;
    $('#dContent').innerHTML = `
      <h2 class="dtitle">${esc(obj.title || obj.type)}</h2>
      <div class="dmeta"><i class="tg">${esc(obj.type)}</i><i class="dot"></i><span>${esc(obj.sec)}题 · ${obj.pts} 分</span></div>
      ${topicLine(obj)}

      <div class="blk-label">题目</div>
      <div class="stem-box" id="dStem">${obj.stem}</div>

      <div class="fold-tools">
        <button class="ft" data-fold="all">全部展开</button>
        <button class="ft" data-fold="none">全部收起</button>
      </div>

      ${kp2Fold()}
      ${fxFold(obj.fxs, false)}
      ${stepFold(obj.steps, !isPaper)}
      ${ansFold(obj, !isPaper)}
      ${fbBarHTML(obj.y + '-' + obj.no)}
    `;
    kp2Fill($('#dContent'), obj);

    const d = $('#detail');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#dScroll').scrollTop = 0;
    typeset($('#dContent'));
    // 默认展开的折叠块要排版
    $$('#dContent .fold.open .fold-body').forEach(b => typeset(b));
  }

  function closeDetail() {
    $('#detail').classList.remove('open');
    $('#detail').setAttribute('aria-hidden', 'true');
    state.cur = -1; curObj = null;
    // 返回时刷新列表状态
    if (state.tab === 'tiku' && state.sub === 'english') renderEnSections();
    else if (state.tab === 'tiku' && state.year) renderYearList();
    if (state.tab === 'type') renderTypes();
  }

  /* ---------------- 整卷模式 ---------------- */
  async function openPaper(y) {
    const d = await loadYear(y).catch(() => null);
    if (!d) return;
    state.paperYear = y;
    state.paperQs = d.qs;
    trackView('paper-' + y);
    $('#pTitle').textContent = y + ' 年 · ' + d.qs.length + ' 题';
    $('#pAll').textContent = '全展开';
    $('#pAll').dataset.mode = 'open';

    $('#pBody').innerHTML = `
      <div class="paper-tip">模拟测试：先自己算，算完点「展开」。也可以直接点右上角一次性全展开对答案。</div>
      ${d.qs.map((p, i) => `
        <div class="pq" data-i="${i}">
          <div class="pq-head">
            <span class="pq-no">${p.no}</span>
            <span class="pq-meta"><i class="tg">${esc(p.sec)}</i><i class="dot"></i>${p.pts} 分<i class="dot"></i>${esc(p.type)}</span>
          </div>
          ${topicLine(p)}
          <div class="pq-stem">${p.stem}</div>
          <div class="fold-tools"><button class="ft ft-one" data-i="${i}">展开本题解析</button></div>
          <div class="pq-body" hidden>
            ${kp2Fold()}
            ${fxFold(p.fxs, false)}
            ${foldBlock(curUI().foldStep, '▸', `<div class="steps">${(p.steps || []).map((s, n) => `<button class="step" data-n="${n}"><span class="step-num">${n + 1}</span><span class="step-txt">${s}</span></button>`).join('')}</div>`, true)}
            ${ansFold(p, true)}
          </div>
        </div>`).join('')}`;

    const el = $('#paper');
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    $('#pScroll').scrollTop = 0;
    typeset($('#pBody'));
  }

  function closePaper() {
    $('#paper').classList.remove('open');
    $('#paper').setAttribute('aria-hidden', 'true');
  }

  /* ---------------- 题型页 ---------------- */

  function renderTypes() {
    if (!curSubject().ready || state.sub === 'english') { renderTabSoon('typeWrap', 'typeLead', 'type'); return; }
    if (!state.idx) { $('#typeWrap').innerHTML = '<div class="empty">加载中…</div>'; loadIndex().then(renderTypes).catch(() => {}); return; }
    const items = state.idx.items;
    const groups = {};
    items.forEach(p => { (groups[p.type] || (groups[p.type] = [])).push(p); });
    const TYPE_ORDER = curTypes();
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    $('#typeLead').textContent = `共 ${keys.length} 类题型 · ${items.length} 道题。点开一类，看这一类下面所有题和它们考的知识点。`;

    $('#typeWrap').innerHTML = keys.map((k, i) => {
      const arr = groups[k].sort((a, b) => a.y - b.y || a.no - b.no);
      const rows = arr.map(p => {
        const tps = (p.topics || []).map(t => `<i class="tp">${esc(t)}</i>`).join('');
        return `<button class="trow" data-y="${p.y}" data-no="${p.no}">
          <span class="trow-h"><b>${p.y}</b><i class="dot"></i><span>第 ${p.no} 题</span><i class="dot"></i><span>${esc(p.sec)} ${p.pts}分</span></span>
          <span class="trow-topics">${tps}</span>
          <span class="trow-t">${esc(p.title || '')}</span>
        </button>`;
      }).join('');
      return `<div class="acc-item${i === 0 ? ' open' : ''}">
        <button class="acc-head" data-acc="${i}">
          <span class="acc-ic">${String(i + 1).padStart(2, '0')}</span>
          <span class="acc-tt">${esc(k)}</span>
          <span class="acc-ct">${arr.length}</span>
          <span class="acc-ar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
        </button>
        <div class="acc-body"><div class="acc-inner"><div class="tlist">${rows}</div></div></div>
      </div>`;
    }).join('');
  }

  /* ---------------- 公式页 ---------------- */
  const CHP = { p: null, data: null, book: null, open: {}, q: '' };

  function chpLoad() {
    if (!CHP.p) {
      CHP.p = getJSON('data/math/chp.json').then(d => {
        CHP.data = d;
        if (!CHP.book && d && d.books && d.books.length) CHP.book = d.books[0].id;
        return d;
      }).catch(() => null);
    }
    return CHP.p;
  }

  function chpFlat(q) {
    const d = CHP.data, out = [];
    (d.books || []).forEach(b => (b.chs || []).forEach(ch => {
      const hits = [];
      (ch.secs || []).forEach(s => (s.items || []).forEach(it => {
        if (!q || (it[0] + ' ' + it[1]).toLowerCase().indexOf(q) >= 0) hits.push([s.name, it]);
      }));
      if (hits.length) out.push({ bk: b.name, ch: ch.name, n: hits.length, hits: hits });
    }));
    return out;
  }

  function chpItemHTML(it) {
    return `<li class="chp-li"><b class="chp-k">${it[0]}</b><span class="chp-v">${it[1]}</span></li>`;
  }

  function chpBookHTML() {
    const d = CHP.data;
    return (d.books || []).map(b => {
      const n = (b.chs || []).reduce((a, c) => a + (c.n || 0), 0);
      return `<button class="bk-chip${b.id === CHP.book ? ' on' : ''}" data-bk="${esc(b.id)}">${esc(b.short || b.name)}<i>${n}</i></button>`;
    }).join('');
  }

  function chpBodyHTML(ch) {
    return (ch.secs || []).map(s => `<div class="chp-sec">
      <div class="chp-sech">${esc(s.name)}</div>
      <ul class="chp-items">${(s.items || []).map(chpItemHTML).join('')}</ul>
    </div>`).join('');
  }

  function chpFind(bkId, chId) {
    const b = ((CHP.data || {}).books || []).find(x => x.id === bkId);
    return b ? (b.chs || []).find(c => c.id === chId) : null;
  }

  function chpRender() {
    const d = CHP.data, w = $('#formulaWrap');
    const q = CHP.q.trim().toLowerCase();
    $$('#chpBooks .bk-chip').forEach(x => x.classList.toggle('on', !q && x.dataset.bk === CHP.book));
    if (q) {
      const res = chpFlat(q);
      const all = res.reduce((a, r) => a + r.n, 0);
      const CAP = 80;
      let shown = 0;
      const cut = res.map(r => {
        const room = Math.max(0, CAP - shown);
        const part = r.hits.slice(0, room);
        shown += part.length;
        return { bk: r.bk, ch: r.ch, n: r.n, hits: part };
      }).filter(r => r.hits.length);
      $('#formulaLead').textContent = all
        ? `找到 ${all} 条公式，分布在 ${res.length} 个章节里。${all > shown ? '此处先列出前 ' + shown + ' 条，换个更具体的词可以看得更准。' : ''}`
        : `没有含「${CHP.q.trim()}」的公式，换个词试试（如「换元」「特征值」「中心极限」）。`;
      w.innerHTML = all ? cut.map(r => `<div class="acc-item open">
        <div class="acc-head">
          <span class="acc-ic">§</span>
          <span class="acc-tt">${esc(r.ch)}</span>
          <span class="acc-ct">${r.n}</span>
        </div>
        <div class="acc-body"><div class="acc-inner"><div class="chp-sec">
          <div class="chp-sech">${esc(r.bk)}</div>
          <ul class="chp-items">${r.hits.map(h => chpItemHTML(h[1])).join('')}</ul>
        </div></div></div>
      </div>`).join('') : '<div class="empty">没有匹配的公式</div>';
      typeset(w);
      return;
    }
    const bk = (d.books || []).find(b => b.id === CHP.book) || (d.books || [])[0];
    if (!bk) { w.innerHTML = '<div class="empty">公式手册为空</div>'; return; }
    const nch = (bk.chs || []).length;
    const nf = (bk.chs || []).reduce((a, c) => a + (c.n || 0), 0);
    const total = (d.books || []).reduce((a, b) => a + (b.chs || []).reduce((x, c) => x + (c.n || 0), 0), 0);
    $('#formulaLead').textContent =
      `${bk.name}：${nch} 章 ${nf} 条。全套共 ${total} 条，按教材章节顺序排列，点开一章看它下面所有公式。`;
    const openSet = CHP.open[bk.id] || (CHP.open[bk.id] = {});
    const first = ((bk.chs || [])[0] || {}).id;
    const isOpen = ch => (Object.keys(openSet).length ? !!openSet[ch.id] : ch.id === first);
    w.innerHTML = (bk.chs || []).map((ch, i) => `<div class="acc-item${isOpen(ch) ? ' open' : ''}" data-ch="${esc(ch.id)}">
      <button class="acc-head" data-chh="${esc(ch.id)}">
        <span class="acc-ic">${String(i + 1).padStart(2, '0')}</span>
        <span class="acc-tt">${esc(ch.name)}${ch.note ? `<i class="chp-note">${esc(ch.note)}</i>` : ''}</span>
        <span class="acc-ct">${ch.n}</span>
        <span class="acc-ar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
      </button>
      <div class="acc-body"><div class="acc-inner">${isOpen(ch) ? chpBodyHTML(ch) : ''}</div></div>
    </div>`).join('');
    typeset(w);
  }

  function chpScrollTo(item) {
    if (!item) return;
    const main = $('#main');
    if (!main) return;
    const t = item.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 8;
    main.scrollTop = Math.max(0, t);
  }

  function chpToggle(item) {
    const inner = item.querySelector('.acc-inner');
    const ch = chpFind(CHP.book, item.dataset.ch);
    const set = CHP.open[CHP.book] || (CHP.open[CHP.book] = {});
    const willOpen = !item.classList.contains('open');
    if (willOpen && ch && inner && !inner.innerHTML.trim()) inner.innerHTML = chpBodyHTML(ch);
    item.classList.toggle('open', willOpen);
    if (willOpen) {
      set[item.dataset.ch] = 1;
      setTimeout(() => chpScrollTo(item), 20);
      const pr = (inner && ch) ? typeset(inner) : null;
      if (pr && pr.then) {
        pr.then(() => {
          if (item.classList.contains('open')) setTimeout(() => chpScrollTo(item), 30);
        });
      }
      // 兜底：折叠动画 0.26s + 公式排版可能把它继续撑高，动画结束后再校正一次
      setTimeout(() => { if (item.classList.contains('open')) chpScrollTo(item); }, 420);
    } else {
      delete set[item.dataset.ch];
    }
  }

  async function renderChp() {
    const bar = $('#chpBar');
    if (bar) {
      bar.hidden = false;
      $('#chpBooks').innerHTML = '<span class="chp-load">加载中…</span>';
    }
    const w = $('#formulaWrap');
    w.innerHTML = '<div class="empty">加载中…</div>';
    const d = await chpLoad();
    if (bar) bar.hidden = false;
    if (!d) { w.innerHTML = '<div class="empty">公式手册加载失败</div>'; return; }
    if (bar) $('#chpBooks').innerHTML = chpBookHTML();
    chpRender();
  }

  function chpBind() {
    const bs = $('#chpBooks');
    if (bs) bs.addEventListener('click', e => {
      const c = e.target.closest('.bk-chip');
      if (!c) return;
      CHP.book = c.dataset.bk;
      $$('#chpBooks .bk-chip').forEach(x => x.classList.toggle('on', x === c));
      const main = $('#main');
      if (main) main.scrollTop = 0;
      chpRender();
    });
    const w = $('#formulaWrap');
    if (w) w.addEventListener('click', e => {
      const h = e.target.closest('.acc-head');
      if (!h) return;
      const item = h.closest('.acc-item');
      if (!item || !item.dataset.ch) return;
      chpToggle(item);
    });
    const inp = $('#chpSearch');
    if (inp) {
      let t = 0;
      inp.addEventListener('input', () => {
        CHP.q = inp.value || '';
        const cl = $('#chpClear');
        if (cl) cl.hidden = !CHP.q;
        clearTimeout(t);
        t = setTimeout(() => { if (state.tab === 'formula') chpRender(); }, 180);
      });
    }
    const cl = $('#chpClear');
    if (cl) cl.addEventListener('click', () => {
      const i = $('#chpSearch');
      if (i) { i.value = ''; i.focus(); }
      CHP.q = ''; cl.hidden = true; chpRender();
    });
  }

  async function renderFormula() {
    if (state.sub === 'english') { renderEnVocab(); return; }
    if (!curSubject().ready) { renderTabSoon('formulaWrap', 'formulaLead', 'formula'); return; }
    if (state.sub === 'math') {
      const bar = $('#chpBar');
      if (bar) bar.hidden = false;
      await renderChp();
      return;
    }
    const bar2 = $('#chpBar');
    if (bar2) bar2.hidden = true;
    if (!state.meta) {
      $('#formulaWrap').innerHTML = '<div class="empty">加载中…</div>';
      try { await loadMeta(); } catch (e) { $('#formulaWrap').innerHTML = '<div class="empty">公式库加载失败</div>'; return; }
    }
    const groups = state.meta.formulas || [];
    const icons = ['∫', '∬', '∂', 'dy', 'ξ', 'A'];
    $('#formulaWrap').innerHTML = groups.map((g, i) => `
      <div class="acc-item${i === 0 ? ' open' : ''}">
        <button class="acc-head" data-acc="${i}">
          <span class="acc-ic">${icons[i] || '·'}</span>
          <span class="acc-tt">${g.name}</span>
          <span class="acc-ct">${g.items.length}</span>
          <span class="acc-ar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
        </button>
        <div class="acc-body"><div class="acc-inner">
          <ol class="acc-list">${g.items.map(x => `<li>${x}</li>`).join('')}</ol>
        </div></div>
      </div>`).join('');
    const n = groups.reduce((a, g) => a + g.items.length, 0);
    const isPol = state.sub === 'politics';
    $('#formulaLead').textContent = `${groups.length} 大类 · 共 ${n} 条${isPol ? '考点' : '公式'}。每道题的详情页里，还会单独列出这一题${isPol ? '用到的考点' : '用到的公式'}。`;
    typeset($('#formulaWrap'));
  }

  /* ---------------- 规律页 ---------------- */
  async function renderMap() {
    if (!curSubject().ready || state.sub === 'english') { renderTabSoon('mapWrap', null, 'map'); return; }
    if (!state.meta) { try { await loadMeta(); } catch (e) { return; } }
    const t = (state.meta && state.meta.table) || { head: [], rows: [] };
    const years = t.head.slice(2);
    $('#mapWrap').innerHTML = t.rows.map(r => {
      const cells = years.map((y, i) => {
        const v = r[i + 2] || '—';
        return `<div class="map-row"><span class="map-y">${y}</span><span class="map-v">${v}</span></div>`;
      }).join('');
      return `<div class="map-card">
        <div class="map-head"><span class="map-no">${r[0]}</span><span class="map-role">${r[1]}</span></div>
        ${cells}
      </div>`;
    }).join('');

    const insights = (state.meta && state.meta.insights) || [
      { tag: '固定', h: '同一个题号，考的是同一类东西', p: '把 39 年的卷子按题号竖着看，规律比按年份横着看明显得多：解答题最后一题是线代，倒数第二题是证明，中间几道是积分与多元。' },
      { tag: '方法', h: '二重积分只有三套解法', p: '直角坐标、极坐标、换元。极坐标出现频率最高，看到圆、看到 $x^{2}+y^{2}$ 先想它。' },
      { tag: '方法', h: '线代主线只有一条', p: '定参数 → 求特征值 → 求特征向量 → 拼矩阵 $P$。入口在换：二次型、方程组、相似条件。' },
      { tag: '趋势', h: '难度藏在“包装”里', p: '近年不给 $f$ 而给 $g(x,y)=f(2x+y,3x-y)$ 的偏导组合，不给 $f$ 而给全微分。看得懂包装就做得出来。' },
      { tag: '提醒', h: '失分主要不是不会', p: '拉开差距的是：换元忘雅可比、特征向量没正交化、面积方向写反、答案不检验。' }
    ];
    $('#insightWrap').innerHTML = insights.map(i => `
      <div class="ins"><h3>${i.h}<em>${i.tag}</em></h3><p>${i.p}</p></div>`).join('');
    typeset($('#insightWrap'));
  }

  /* ---------------- 访问统计（匿名埋点 + 口令查看） ---------------- */
  const CLOUD_CFG = {
    endpoint: 'https://math2-solutions.app.workbuddy.host',
    publishableKey: 'wbpk_6NGpRd8bi7SquIwtD02oad_kpMpSdZK3qjEqAwvbptOKyG6XRI5nNUT',
    sdk: 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js'
  };

  const track = { cloud: null, loading: null, vid: '', sid: '', t0: Date.now(), out: false, seen: null };

  function randHex(n) {
    const a = new Uint8Array(n);
    try { crypto.getRandomValues(a); }
    catch (e) { for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  // 统计 SDK 按需加载：先同源（已随包缓存），失败再走 CDN；
  // 两条都失败就静默跳过，绝不拖慢首屏或影响刷题
  const SDK_SRC = ['./vendor/cloud-sdk.js', CLOUD_CFG.sdk];
  function loadSDK() {
    if (window.WorkBuddyCloud) return Promise.resolve(window.WorkBuddyCloud);
    if (track.loading) return track.loading;
    track.loading = new Promise(res => {
      let i = 0, done = false;
      const fin = v => {
        if (done) return;
        done = true;
        if (!v) track.loading = null;      // 失败后允许下次重试
        res(v);
      };
      const next = () => {
        if (i >= SDK_SRC.length) { fin(null); return; }
        const s = document.createElement('script');
        s.src = SDK_SRC[i++];
        s.async = true;
        s.onload = () => (window.WorkBuddyCloud ? fin(window.WorkBuddyCloud) : next());
        s.onerror = next;
        document.head.appendChild(s);
      };
      next();
      setTimeout(() => fin(window.WorkBuddyCloud || null), 9000);
    });
    return track.loading;
  }

  async function cloudClient() {
    if (track.cloud) return track.cloud;
    const W = await loadSDK();
    if (!W || !W.createWorkBuddyCloud) return null;
    try {
      track.cloud = W.createWorkBuddyCloud({
        endpoint: CLOUD_CFG.endpoint,
        publishableKey: CLOUD_CFG.publishableKey
      });
    } catch (e) { track.cloud = null; }
    return track.cloud;
  }

  function devKind() {
    if (isStandalone()) return 'pwa';
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Mobile/i.test(ua) && Math.min(screen.width, screen.height) >= 600)) return 'tablet';
    return /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  }

  function trackRow(kind, extra) {
    const row = Object.assign({
      id: Date.now().toString(36) + randHex(3),
      vid: track.vid,
      sid: track.sid,
      kind: kind,
      subj: state.sub,
      page: state.tab,
      dev: devKind(),
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 40)
    }, extra || {});
    return cloudClient()
      .then(c => (c ? c.database.from('visits').insert(row) : null))
      .catch(() => {});
  }

  function trackIn() {
    track.vid = store.get('vid', '');
    if (!track.vid) { track.vid = randHex(12); store.set('vid', track.vid); }
    track.sid = randHex(8);
    const ref = (document.referrer || '').replace(/^https?:\/\//, '').split('/')[0].slice(0, 60);
    trackRow('in', { ref: ref || null });
  }

  function trackOut() {
    if (track.out || !track.sid) return;
    const dur = Math.round((Date.now() - track.t0) / 1000);
    if (dur < 3) return;
    track.out = true;
    trackRow('out', { dur: Math.min(dur, 7200) });
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) trackOut(); });

  // 题目级浏览：同一会话内同一道题只记一次，避免反复进出刷量
  function trackView(page) {
    if (!page) return;
    if (!track.seen) track.seen = new Set();
    const p = String(page).slice(0, 60);
    if (track.seen.has(p)) return;
    track.seen.add(p);
    trackRow('view', { page: p });
  }

  /* ---------------- 题目反馈（答案纠错） ---------------- */
  function fbBarHTML(qref) {
    return `<div class="fb-bar" data-qref="${esc(qref)}">
      <button class="fb-btn" type="button">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8L21 21l-5.7-1.5a8.4 8.4 0 1 1 5.7-8z"/></svg>
        发现答案或解析有错？点这里反馈
      </button>
    </div>`;
  }

  function fbForm(bar) {
    bar.innerHTML = `
      <p class="fb-t">反馈给维护者（匿名，不留个人信息）</p>
      <textarea class="fb-ta" rows="3" maxlength="400" placeholder="哪里有问题？比如：第 3 步等价无穷小替换用错了 / 答案应为 B"></textarea>
      <div class="fb-row">
        <button class="fb-cancel" type="button">取消</button>
        <button class="fb-send" type="button">提交反馈</button>
      </div>
      <p class="fb-err"></p>`;
    const ta = bar.querySelector('.fb-ta');
    setTimeout(() => ta && ta.focus(), 50);
  }

  function fbReset(bar) {
    bar.innerHTML = `<button class="fb-btn" type="button">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8L21 21l-5.7-1.5a8.4 8.4 0 1 1 5.7-8z"/></svg>
      发现答案或解析有错？点这里反馈
    </button>`;
  }

  function fbSend(bar) {
    const msg = (bar.querySelector('.fb-ta').value || '').trim().slice(0, 400);
    const err = bar.querySelector('.fb-err');
    if (msg.length < 2) { err.textContent = '写几个字说明问题，比如哪一步错了。'; return; }
    err.textContent = '提交中…';
    cloudClient()
      .then(c => {
        if (!c) throw 0;
        return c.database.from('feedback').insert({
          id: Date.now().toString(36) + randHex(3),
          vid: track.vid || null,
          subj: state.sub || null,
          qref: bar.dataset.qref || null,
          msg: msg
        });
      })
      .then(() => { bar.innerHTML = `<p class="fb-ok">✓ 已收到，谢谢反馈！维护者核对后会尽快修正。</p>`; })
      .catch(() => { err.textContent = '提交失败，稍后再试一次。'; });
  }

  // 详情内容每次重渲染，用委托绑定一次
  document.addEventListener('click', ev => {
    const bar = ev.target.closest('.fb-bar');
    if (!bar) return;
    if (ev.target.closest('.fb-btn')) fbForm(bar);
    else if (ev.target.closest('.fb-send')) fbSend(bar);
    else if (ev.target.closest('.fb-cancel')) fbReset(bar);
  });

  /* ---------------- 我的 ---------------- */
  function renderMe() {
    const total = state.idx ? state.idx.items.length : 0;
    const n = state.done.size;
    const pct = total ? Math.round(n / total * 100) : 0;
    $('#doneCount').textContent = n;
    $('#totalNum').textContent = total;
    $('#ringTxt').textContent = pct + '%';
    const C = 2 * Math.PI * 42;
    $('#ringFg').setAttribute('stroke-dasharray', C.toFixed(1));
    $('#ringFg').setAttribute('stroke-dashoffset', (C * (1 - pct / 100)).toFixed(1));
    $('#profSub').textContent = n === 0 ? '从第一道开始' : (n >= total && total ? '全部通关' : `还剩 ${total - n} 道`);
    const vt = $('#verTxt');
    if (vt) vt.textContent = 'v' + VERSION;
    $$('#segTheme button').forEach(b => b.classList.toggle('on', b.dataset.v === state.theme));
    $$('#segFont button').forEach(b => b.classList.toggle('on', b.dataset.v === state.fs));
    renderMeExtra();
    initInstall();
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    chpBind();
    $('#tabbar').addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (b) switchTab(b.dataset.tab);
    });

    // 学科板块切换
    const sb = $('#subBar');
    if (sb) sb.addEventListener('click', e => {
      const c = e.target.closest('.subchip');
      if (c) switchSubject(c.dataset.sub);
    });

    // 年份网格 / 返回
    $('#page-tiku').addEventListener('click', async e => {
      const back = e.target.closest('#yearBack');
      if (back) {
        if (state.sub === 'english') EN.y = null; else state.year = null;
        renderTiku(); $('#main').scrollTop = 0; return;
      }

      const cell = e.target.closest('.ycell');
      if (cell) {
        if (state.sub === 'english') { EN.y = +cell.dataset.y; renderEnTiku(); }
        else { state.year = +cell.dataset.y; renderTiku(); }
        $('#main').scrollTop = 0;
        return;
      }

      const card = e.target.closest('.qcard');
      if (card) {
        if (state.sub === 'english') {
          const sec = EN.data && EN.data.sections[+card.dataset.sec];
          if (sec) openEnSection(sec);
          return;
        }
        const i = +card.dataset.i;
        const p = state.list[i];
        if (p) openDetail(p);
      }
    });

    // 整卷
    $('#btnPaper').addEventListener('click', () => { if (state.year) openPaper(state.year); });
    $('#pBack').addEventListener('click', closePaper);
    $('#pAll').addEventListener('click', () => {
      const open = $('#pAll').dataset.mode !== 'close';
      $$('#pBody .pq').forEach(pq => {
        const body = pq.querySelector('.pq-body');
        if (!body) return;
        body.hidden = !open;
        if (open) { typeset(body); $$('.fold.open .fold-body', body).forEach(b => typeset(b)); }
      });
      $('#pAll').dataset.mode = open ? 'close' : 'open';
      $('#pAll').textContent = open ? '全收起' : '全展开';
    });
    $('#pBody').addEventListener('click', e => {
      if (handleKpClick(e)) return;
      const one = e.target.closest('.ft-one');
      if (one) {
        const pq = one.closest('.pq');
        const body = pq.querySelector('.pq-body');
        const show = body.hidden;
        body.hidden = !show;
        if (show) {
          typeset(body); $$('.fold.open .fold-body', body).forEach(b => typeset(b));
          kp2Fill(body, state.paperQs[+one.dataset.i]);
        }
        one.textContent = show ? '收起本题解析' : '展开本题解析';
        return;
      }
      if (kp2Click(e)) return;
      const fh = e.target.closest('.fold-head');
      if (fh) {
        const f = fh.parentElement;
        f.classList.toggle('open');
        if (f.classList.contains('open')) typesetLazy(f);
        return;
      }
      const st = e.target.closest('.step');
      if (st) {
        const pq = st.closest('.pq');
        const p = pq ? (state.years[state.paperYear] || {}).qs[+pq.dataset.i] : null;
        if (p) { toggleStep(p, st); }
      }
    });

    // 详情
    $('#dBack').addEventListener('click', closeDetail);
    window.addEventListener('popstate', () => {
      if ($('#paper').classList.contains('open')) closePaper();
      else if ($('#detail').classList.contains('open')) closeDetail();
    });

    $('#dMark').addEventListener('click', () => {
      if (!curObj) return;
      const k = keyOf(curObj);
      if (state.done.has(k)) state.done.delete(k); else state.done.add(k);
      store.set('done', Array.from(state.done));
      $('#dMark').classList.toggle('on', state.done.has(k));
      if (navigator.vibrate) navigator.vibrate(8);
    });

    $('#dContent').addEventListener('click', e => {
      if (handleKpClick(e)) return;
      if (kp2Click(e)) return;
      const rb = e.target.closest('.exp-reset');
      if (rb) { resetQuestion(rb.dataset.reset); return; }
      const ra = e.target.closest('#btnResetSec');
      if (ra) { resetSection(); return; }
      const w = e.target.closest('.w');
      if (w) { openWord(w.dataset.w); return; }
      const opt = e.target.closest('.opt,.chip');
      if (opt && opt.dataset.k) {
        const card = opt.closest('.en-q');
        if (card) { enAnswer(card.dataset.key, opt.dataset.k); return; }
      }
      const del = e.target.closest('.wb-del');
      if (del) {
        EN.words.delete(del.dataset.del);
        store.set('enWords', Array.from(EN.words));
        renderMeExtra(); openWordBook(); return;
      }
      const wb = e.target.closest('.wb-row');
      if (wb) { openWord(wb.dataset.w); return; }
      const ft = e.target.closest('.ft');
      if (ft && curObj) {
        const open = ft.dataset.fold === 'all';
        $$('#dContent .fold').forEach(f => {
          f.classList.toggle('open', open);
          if (open) typesetLazy(f);
        });
        return;
      }
      const fh = e.target.closest('.fold-head');
      if (fh) {
        const f = fh.parentElement;
        f.classList.toggle('open');
        if (f.classList.contains('open')) typesetLazy(f);
        return;
      }
      const st = e.target.closest('.step');
      if (st && curObj) toggleStep(curObj, st);
    });

    // 题型
    $('#typeWrap').addEventListener('click', async e => {
      const head = e.target.closest('.acc-head');
      if (head) { head.parentElement.classList.toggle('open'); return; }
      const row = e.target.closest('.trow');
      if (row) {
        const y = +row.dataset.y, no = +row.dataset.no;
        const d = await loadYear(y).catch(() => null);
        if (!d) return;
        const p = d.qs.find(x => x.no === no);
        if (p) openDetail(p);
      }
    });

    // 公式手风琴（政治等旧版分组；数学章节手册由 chpToggle 处理）
    $('#formulaWrap').addEventListener('click', e => {
      const h = e.target.closest('.acc-head'); if (!h) return;
      const it = h.closest('.acc-item');
      if (it && it.dataset.ch) return;
      h.parentElement.classList.toggle('open');
    });

    // 搜索
    const si = $('#searchInput');
    let tmr;
    si.addEventListener('input', () => {
      $('#searchClear').classList.toggle('on', !!si.value);
      clearTimeout(tmr);
      tmr = setTimeout(() => doSearch(si.value), 130);
    });
    $('#searchClear').addEventListener('click', () => {
      si.value = ''; $('#searchClear').classList.remove('on'); doSearch(''); si.focus();
    });

    // 主题
    $('#btnTheme').addEventListener('click', () => {
      state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      store.set('theme', state.theme);
      applyTheme();
      if (state.tab === 'me') renderMe();
    });
    $('#segTheme').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.theme = b.dataset.v; store.set('theme', state.theme); applyTheme(); renderMe();
    });
    $('#segFont').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.fs = b.dataset.v; store.set('fs', state.fs); applyFs(); renderMe();
    });

    // 英语「词汇」标签页里的生词行
    const pf = $('#page-formula');
    if (pf) pf.addEventListener('click', e => {
      const del = e.target.closest('.wb-del');
      if (del) {
        EN.words.delete(del.dataset.del);
        store.set('enWords', Array.from(EN.words));
        renderMeExtra(); renderEnVocab();
        return;
      }
      const row = e.target.closest('.wb-row');
      if (row) openWord(row.dataset.w);
    });

    // 生词本
    const bw = $('#btnWords');
    if (bw) bw.addEventListener('click', openWordBook);

    // 词卡
    const wsEl = $('#wSheet');
    if (wsEl) {
      wsEl.addEventListener('click', e => {
        if (e.target.closest('.ws-mask') || e.target.closest('#wsClose')) { closeWord(); return; }
        const add = e.target.closest('#wsAdd');
        if (!add) return;
        const w = add.dataset.w || '';
        const key = (EN.dict && lemmaOf(w, EN.dict)) || (EN.dict2 && lemmaOf(w, EN.dict2)) || w.toLowerCase();
        if (EN.words.has(key)) {
          EN.words.delete(key);
          add.textContent = '＋ 生词本';
          add.classList.remove('on');
        } else {
          EN.words.add(key);
          add.textContent = '✓ 已在生词本';
          add.classList.add('on');
        }
        store.set('enWords', Array.from(EN.words));
        renderMeExtra();
      });
    }

    // 安装 / 更新 / 清空
    const bi = $('#btnInstall');
    if (bi) bi.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (e) {}
        deferredPrompt = null;
        initInstall();
        return;
      }
      // 浏览器没给出安装事件（Safari / 预览窗格 / 已安装之后）：展开文字步骤
      const tip = $('#installTip');
      if (!tip) return;
      tip.hidden = !tip.hidden;
      if (!tip.hidden) tip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    const tipEl = $('#installTip');
    if (tipEl) tipEl.addEventListener('click', async e => {
      if (!e.target.closest('#copyLink')) return;
      const btn = e.target.closest('#copyLink');
      try {
        await navigator.clipboard.writeText(location.href);
        btn.textContent = '已复制';
      } catch (err) {
        btn.textContent = '复制失败，请长按地址栏复制';
      }
    });
    $('#btnUpdate').addEventListener('click', async () => {
      const t = $('#verTxt');
      if (t) t.textContent = '检查中…';
      try {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch (e) {}
      location.reload();
    });
    $('#btnReset').addEventListener('click', () => {
      if (!confirm('清空所有“已掌握”和步骤勾选记录？')) return;
      state.done.clear(); state.ticked = {};
      store.set('done', []); store.set('ticked', {});
      renderMe();
    });

    const main = $('#main');
    main.addEventListener('scroll', () => {
      $('#topbar').classList.toggle('scrolled', main.scrollTop > 6);
    }, { passive: true });
  }

  function toggleStep(p, el) {
    const k = keyOf(p), n = +el.dataset.n;
    const arr = state.ticked[k] || (state.ticked[k] = []);
    const at = arr.indexOf(n);
    if (at >= 0) arr.splice(at, 1); else arr.push(n);
    store.set('ticked', state.ticked);
    el.classList.toggle('tick', arr.indexOf(n) >= 0);
    if (navigator.vibrate) navigator.vibrate(6);
  }

  /* ---------------- 搜索 ---------------- */
  function doSearch(q) {
    q = (q || '').trim().toLowerCase();
    state.q = q;
    if (state.tab !== 'tiku') switchTab('tiku');
    if (!q) { renderTiku(); return; }
    if (!state.idx) return;
    const hit = state.idx.items.filter(p => {
      const hay = [p.y, p.no, p.title, p.type, p.sec, (p.topics || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    $('#pageTitle').textContent = '搜索';
    $('#pageSub').textContent = `“${q}” · ${hit.length} 条`;
    $('#paperBar').hidden = true;
    $('#yearChips').innerHTML = '';
    $('#listWrap').className = 'list';
    $('#listWrap').innerHTML = hit.length ? hit.slice(0, 200).map(p => `
      <button class="qcard" data-sy="${p.y}" data-sno="${p.no}">
        <span class="qno"><b>${p.no}</b><span>${p.y}</span></span>
        <span class="qmid">
          <span class="qt">${esc(p.title || p.type)}</span>
          <span class="qm"><i class="tg">${esc(p.type)}</i><i class="dot"></i><span>${p.pts} 分</span></span>
          <span class="qtopics">${(p.topics || []).slice(0, 3).map(t => `<i class="tp">${esc(t)}</i>`).join('')}</span>
        </span>
      </button>`).join('') : '<div class="empty">没有匹配的题</div>';
    $('#listEnd').textContent = hit.length > 200 ? '只显示前 200 条' : '';
    $('#listWrap').onclick = async ev => {
      const c = ev.target.closest('[data-sy]');
      if (!c) return;
      const d = await loadYear(+c.dataset.sy).catch(() => null);
      if (!d) return;
      const p = d.qs.find(x => x.no === +c.dataset.sno);
      if (p) openDetail(p);
    };
  }

  /* ---------------- 分享凭证 ---------------- */
  function propagateSharecode() {
    if (!SHARE) return;
    $$('a[href]').forEach(a => {
      if (a.host !== location.host) return;
      if (a.search) return;
      if (/^(mailto:|tel:|javascript:)/i.test(a.getAttribute('href') || '')) return;
      a.search = SHARE;
    });
  }

  /* ---------------- 安装引导 ---------------- */
  let IN_FRAME = false;
  try { IN_FRAME = window.self !== window.top; } catch (e) { IN_FRAME = true; }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return navigator.standalone === true;
  }

  function installTipHTML() {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const inWx = /MicroMessenger/i.test(ua);
    if (IN_FRAME) {
      return '<b>预览窗格里装不了</b>浏览器不允许在嵌入的窗口里安装。'
        + '点右边复制链接，用手机浏览器打开后再添加到桌面。<span class="copy-link" id="copyLink">复制链接</span>';
    }
    if (iOS) {
      return '<b>iPhone / iPad 只能这样装</b>用 <b>Safari</b> 打开本页 → 点底部中间的「分享」按钮 → 在列表里往下找到'
        + '「添加到主屏幕」→ 右上角「添加」。'
        + (inWx ? '<br>你现在是在微信里，先点右上角「…」→「在 Safari 中打开」。' : '');
    }
    if (android) {
      return '<b>Android 这样装</b>用 <b>Chrome</b> 打开本页 → 点右上角「⋮」→「安装应用」或「添加到主屏幕」。'
        + (inWx ? '<br>你现在是在微信里，先点右上角「…」→「在浏览器打开」。' : '');
    }
    return '<b>电脑上这样装</b>看地址栏最右侧，有个安装图标（显示器或 ⊕ 形状），点一下确认即可；'
      + '也可以在右上角「⋮」菜单里选「安装 考研真题全解」。装到手机上请用手机浏览器打开本链接。';
  }

  function initInstall() {
    const bi = $('#btnInstall'), lbl = $('#installLbl'), tip = $('#installTip');
    if (!bi) return;
    if (isStandalone()) { bi.hidden = true; if (tip) tip.hidden = true; return; }
    bi.hidden = false;
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (lbl) lbl.textContent = deferredPrompt ? (mobile ? '安装到手机桌面' : '安装到桌面') : '怎么装到桌面';
    if (tip) {
      if (!tip.dataset.filled) { tip.innerHTML = installTipHTML(); tip.dataset.filled = '1'; }
      if (deferredPrompt) tip.hidden = true;
    }
  }

  /* ============================================================
     英语板块：原文阅读 + 点词查义 + 题目作答
     ============================================================ */
  const EN = {
    idx: null, y: null, data: null, dict: null, dictP: null, dict2: null, dict2P: null, sec: null,
    words: new Set(store.get('enWords', [])),
    ans: store.get('enAns', {}) || {}
  };
  const ABC = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const KIND_NAME = { cloze: '完形', reading: '阅读', match: '新题型', translation: '翻译', writing: '写作' };
  const LV_NAME = { 1: '高中', 2: '四级', 3: '六级', 4: '考研', 5: '专四', 6: '专八', 7: '托福', 8: '雅思' };

  /* 列表左侧的小徽标：qno 只有 40px 宽，最多容两个字 */
  function enBadge(sec) {
    if (sec.kind === 'reading') {
      const m = /\d/.exec(sec.short || '');
      if (m) return 'T' + m[0];
    }
    return String(sec.short || '英语').slice(0, 2);
  }

  function enFetch(p) {
    return fetch('data/english/' + p + SHARE, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(p + ' ' + r.status);
      return r.json();
    });
  }

  /* ---------- 词形还原 ---------- */
  const IRR = {
    is: 'be', am: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
    went: 'go', gone: 'go', goes: 'go', said: 'say', made: 'make', took: 'take', taken: 'take',
    came: 'come', saw: 'see', seen: 'see', knew: 'know', known: 'know', got: 'get', gotten: 'get',
    gave: 'give', given: 'give', found: 'find', thought: 'think', told: 'tell', became: 'become',
    left: 'leave', felt: 'feel', brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep',
    held: 'hold', wrote: 'write', written: 'write', stood: 'stand', heard: 'hear', meant: 'mean',
    met: 'meet', ran: 'run', paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak',
    led: 'lead', grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall', fallen: 'fall',
    sent: 'send', built: 'build', understood: 'understand', drew: 'draw', drawn: 'draw',
    broke: 'break', broken: 'break', spent: 'spend', rose: 'rise', risen: 'rise',
    drove: 'drive', driven: 'drive', bought: 'buy', wore: 'wear', worn: 'wear',
    chose: 'choose', chosen: 'choose', ate: 'eat', eaten: 'eat', sold: 'sell', fought: 'fight',
    threw: 'throw', thrown: 'throw', caught: 'catch', taught: 'teach', hid: 'hide', hidden: 'hide',
    flew: 'fly', flown: 'fly', forgot: 'forget', forgotten: 'forget', slept: 'sleep',
    drank: 'drink', drunk: 'drink', sang: 'sing', sung: 'sing', swam: 'swim', swum: 'swim',
    shook: 'shake', shaken: 'shake', bit: 'bite', bitten: 'bite', blew: 'blow', blown: 'blow',
    bore: 'bear', borne: 'bear', struck: 'strike', hung: 'hang', shot: 'shoot',
    sought: 'seek', withdrew: 'withdraw', withdrawn: 'withdraw', undertook: 'undertake',
    undertaken: 'undertake', arose: 'arise', arisen: 'arise', awoke: 'awake', dealt: 'deal',
    dug: 'dig', fed: 'feed', fled: 'flee', froze: 'freeze', frozen: 'freeze', laid: 'lay',
    lent: 'lend', lit: 'light', rode: 'ride', ridden: 'ride', rang: 'ring', rung: 'ring',
    shrank: 'shrink', sprang: 'spring', stole: 'steal', stolen: 'steal', stuck: 'stick',
    swept: 'sweep', swore: 'swear', sworn: 'swear', wept: 'weep', won: 'win', wound: 'wind',
    mistook: 'mistake', mistaken: 'mistake', overcame: 'overcome', children: 'child',
    men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose',
    lives: 'life', knives: 'knife', wives: 'wife', halves: 'half', selves: 'self',
    criteria: 'criterion', phenomena: 'phenomenon', analyses: 'analysis', crises: 'crisis',
    better: 'good', best: 'good', worse: 'bad', worst: 'bad', an: 'a', us: 'we',
    "can't": 'can', "won't": 'will', "shan't": 'shall', "ain't": 'be', "mustn't": 'must',
    "needn't": 'need', "don't": 'do', "doesn't": 'does', "didn't": 'did', "isn't": 'is',
    "aren't": 'are', "wasn't": 'was', "weren't": 'were', "couldn't": 'could',
    "wouldn't": 'would', "shouldn't": 'should', "haven't": 'have', "hasn't": 'has',
    "hadn't": 'had', "it's": 'it', "that's": 'that', "there's": 'there', "i'm": 'i',
    "i've": 'i', "i'd": 'i', "i'll": 'i', "you're": 'you', "you've": 'you', "we're": 'we',
    "they're": 'they', "he's": 'he', "she's": 'she', "let's": 'let',
    "you'll": 'you', "we'll": 'we', "they'll": 'they', "he'll": 'he', "she'll": 'she',
    "it'll": 'it', "i'd": 'i', "you'd": 'you', "we'd": 'we', "they'd": 'they',
    shown: 'show', stimuli: 'stimulus', curricula: 'curriculum', media: 'medium',
    data: 'datum', alumni: 'alumnus', formulae: 'formula', indices: 'index',
    matrices: 'matrix', vertices: 'vertex', axes: 'axis', nuclei: 'nucleus'
  };

  /* 派生后缀：先按「可能性从高到低」排好，命中第一个存在的就返回 */
  const SUF = [
    [/ies$/, 'y'], [/ied$/, 'y'], [/ier$/, 'y'], [/iest$/, 'y'], [/ying$/, 'ie'],
    [/isation$/, 'ise'], [/ization$/, 'ize'], [/ising$/, 'ise'], [/izing$/, 'ize'],
    [/ically$/, 'ic'], [/ically$/, 'ical'], [/ically$/, 'y'],
    [/ing$/, ''], [/ing$/, 'e'], [/ings$/, ''],
    [/ed$/, ''], [/ed$/, 'e'],
    [/ly$/, ''], [/ly$/, 'le'], [/ily$/, 'y'],
    [/ness$/, ''], [/ments?$/, ''], [/ship$/, ''], [/hood$/, ''], [/ism$/, ''],
    [/ist$/, ''], [/ists$/, ''], [/ful$/, ''], [/less$/, ''], [/ish$/, ''],
    [/able$/, ''], [/able$/, 'e'], [/ible$/, ''], [/ible$/, 'e'],
    [/ance$/, ''], [/ence$/, ''], [/ancy$/, ''], [/ency$/, ''],
    [/ation$/, 'e'], [/ation$/, ''], [/ition$/, ''],
    [/ity$/, ''], [/ity$/, 'e'], [/eties$/, 'ety'],
    [/ive$/, ''], [/ive$/, 'e'], [/ous$/, ''], [/ous$/, 'e'],
    [/al$/, ''], [/al$/, 'e'], [/ial$/, 'y'], [/ical$/, 'ic'],
    [/ic$/, ''], [/ant$/, ''], [/ent$/, ''],
    [/est$/, ''], [/est$/, 'e'], [/er$/, ''], [/er$/, 'e'],
    [/es$/, ''], [/s$/, '']
  ];
  const PREF = ['un', 'in', 'im', 'ir', 'il', 'non', 'dis', 'mis', 'anti', 'inter',
    'over', 'under', 'pre', 'post', 'sub', 'super', 'semi', 'multi', 'co', 're'];

  function normWord(raw) {
    return String(raw || '').toLowerCase()
      .replace(/[\u2019']/g, "'")
      .replace(/'s$/, '')
      .replace(/'+$/, '')
      .replace(/[^a-z'\-]/g, '');
  }

  /* 在词典 D 里找词，返回 {key, via, pre} —— via 说明是怎么还原来的，null 表示直接命中 */
  function resolve(raw, D) {
    const s = normWord(raw);
    if (!s) return null;
    if (D[s]) return { key: s, via: null };

    /* 不规则变化可能是链式的：doesn't -> does -> do */
    let t = s;
    for (let i = 0; i < 3 && IRR[t]; i++) {
      t = IRR[t];
      if (D[t]) return { key: t, via: 'irr' };
    }

    for (const [re, rep] of SUF) {
      if (!re.test(s)) continue;
      const base = s.replace(re, rep);
      if (base.length < 2) continue;
      const tries = [base, base.replace(/([bcdfgklmnprstvz])\1$/, '$1')];
      for (const t of tries) {
        if (D[t]) return { key: t, via: 'suf' };
        if (IRR[t] && D[IRR[t]]) return { key: IRR[t], via: 'suf' };
      }
    }
    /* 前缀：uncertain -> certain，只在前面的规则都失败时兜底 */
    for (const p of PREF) {
      if (!s.startsWith(p) || s.length < p.length + 3) continue;
      let rest = s.slice(p.length);
      if (D[rest]) return { key: rest, via: 'pre', pre: p };
      for (const [re, rep] of SUF) {
        if (!re.test(rest)) continue;
        const b = rest.replace(re, rep);
        if (b.length >= 2 && D[b]) return { key: b, via: 'suf', pre: p };
      }
    }
    return null;
  }

  function lemmaOf(raw, D) {
    const r = resolve(raw, D);
    return r ? r.key : null;
  }

  /* ---------- 正文分词，每个词可点 ---------- */
  const ENT = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function markWords(text, blankMap) {
    const src = String(text || '');
    let out = '', last = 0;
    src.replace(/[A-Za-z][A-Za-z'\u2019\-]*/g, (m, off) => {
      out += ENT(src.slice(last, off));
      out += '<span class="w" data-w="' + m.replace(/"/g, '') + '">' + ENT(m) + '</span>';
      last = off + m.length;
      return m;
    });
    out += ENT(src.slice(last));
    return out;
  }
  // 完形：把纯数字空号变成可视空位
  function markBlank(text) {
    let html = markWords(text);
    return html.replace(/(^|[\s(])(\d{1,2})(?!\d)(?!,\s*\d)(?=[\s.,;:?)]|$)/g, (m, pre, n) => {
      const k = +n;
      if (k < 1 || k > 20) return m;
      return pre + '<span class="en-blank" data-blank="' + k + '">' + k + '</span>';
    });
  }

  /* ---------- 列表 ---------- */
  function renderEnTiku() {
    renderSubBar(!EN.y);
    if (!EN.idx) {
      $('#listWrap').className = 'list';
      $('#listWrap').innerHTML = '<div class="empty">正在加载英语真题…</div>';
      enFetch('index.json').then(d => { EN.idx = d; renderEnTiku(); })
        .catch(() => { $('#listWrap').innerHTML = '<div class="empty">英语题库加载失败</div>'; });
      return;
    }
    if (EN.y) renderEnSections(); else renderEnGrid();
  }

  function renderEnGrid() {
    const ys = (EN.idx.years || []).slice().sort((a, b) => b - a);
    const total = EN.idx.count || 0;
    $('#pageTitle').textContent = '英语真题';
    $('#pageSub').textContent = ys.length
      ? `${ys[ys.length - 1]}–${ys[0]} · ${ys.length} 年 · 英语（二）`
      : '英语（二）';
    $('#yearChips').innerHTML = '';
    $('#paperBar').hidden = true;
    $('#listWrap').className = 'list year-grid';
    $('#listWrap').innerHTML = ys.map(y => {
      const n = (EN.idx.items || []).filter(x => x.y === y).length;
      return `<button class="ycell" data-y="${y}">
        <b>${y}</b><span>${n} 个板块</span><i class="ybar"><em style="width:0%"></em></i>
      </button>`;
    }).join('');
    $('#listEnd').textContent = '点年份看整卷：完形 · 阅读 · 新题型 · 翻译 · 写作';
  }

  async function renderEnSections() {
    const y = EN.y;
    $('#listWrap').className = 'list';
    $('#listWrap').innerHTML = '<div class="empty">读取 ' + y + ' 年…</div>';
    try { EN.data = await enFetch('y' + y + '.json'); }
    catch (e) { $('#listWrap').innerHTML = '<div class="empty">这一年还没录入</div>'; return; }

    $('#yearChips').innerHTML = `<button class="back-chip" id="yearBack">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      全部年份</button><span class="chip-year">${y} · ${EN.data.paper}</span>`;
    $('#paperBar').hidden = false;
    $('#paperInfo').textContent = '完形 20 · 阅读 20 · 新题型 5 · 翻译 · 写作';
    $('#btnPaper').textContent = '点词查义已开';
    $('#pageTitle').textContent = '英语真题';
    $('#pageSub').textContent = `${y} 年 · ${EN.data.paper}`;

    $('#listWrap').innerHTML = EN.data.sections.map((s, i) => {
      const n = (s.items || []).length || (s.blocks || []).length || 1;
      return `<button class="qcard" data-sec="${i}">
        <span class="qno"><b>${enBadge(s)}</b><span>${s.pts} 分</span></span>
        <span class="qmid">
          <span class="qt">${ENT(s.title)}</span>
          <span class="qm"><i class="tg">${KIND_NAME[s.kind] || '英语'}</i><i class="dot"></i><span>${n} ${s.kind === 'writing' ? '篇' : '题'}</span></span>
        </span>
        <span class="qstat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
      </button>`;
    }).join('');
    $('#listEnd').textContent = '进入任一板块，点句中单词就能查释义';
  }

  /* ---------- 板块详情 ---------- */
  function openEnSection(sec) {
    EN.sec = sec;
    state.curObj = { y: EN.y, no: sec.id };
    trackView(EN.y + '-en-' + sec.id);
    $('#dNo').textContent = EN.y + ' · ' + sec.short;
    $('#dMark').classList.remove('on');
    $('#dContent').innerHTML = buildEnSection(sec) + fbBarHTML(EN.y + '-en-' + sec.id);
    const d = $('#detail');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#dScroll').scrollTop = 0;
  }

  function enPassageHTML(paras) {
    return paras.map((p, i) => `<p class="en-p" data-p="${i}">${markWords(p.en)}</p>`).join('');
  }

  function enZhHTML(paras) {
    return paras.map((p, i) => `<p class="en-zp"><i>¶${i + 1}</i>${ENT(p.zh)}</p>`).join('');
  }

  /* 本板块已答数量（key 形如 2018-完形-3） */
  function secDone(sec) {
    const pre = EN.y + '-' + (sec && sec.id) + '-';
    return Object.keys(EN.ans).filter(k => k.indexOf(pre) === 0).length;
  }

  function enResetBar(sec) {
    const total = (sec.items || sec.blocks || []).length;
    if (!total) return '';
    const done = secDone(sec);
    return `<div class="en-acts">
      <span class="en-acts-t">已答 <b id="enActsN">${done}</b> / ${total}</span>
      <button class="btn-reset" id="btnResetSec"${done ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        重做本板块
      </button>
    </div>`;
  }

  function buildEnSection(sec) {
    const head = `
      <h2 class="dtitle">${ENT(sec.title)}</h2>
      <div class="dmeta"><i class="tg">${KIND_NAME[sec.kind] || '英语'}</i><i class="dot"></i><span>${sec.pts} 分</span></div>
      ${enResetBar(sec)}
      <div class="en-hint">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>
        点句中任意单词，看音标和中文释义
      </div>
      ${sec.note ? `<p class="en-note">${ENT(sec.note)}</p>` : ''}
      ${sec.dir ? `<details class="en-dir"><summary>题目要求</summary><p>${ENT(sec.dir)}</p></details>` : ''}`;

    if (sec.kind === 'cloze') {
      return head +
        `<div class="blk-label">原文</div>
         <div class="en-passage">${sec.paras.map((p, i) => `<p class="en-p en-cloze" data-p="${i}">${markBlank(p.en)}</p>`).join('')}</div>
         <div class="blk-label">选项（点一下作答）</div>
         <div class="en-qs">${sec.items.map(it => enClozeItem(it)).join('')}</div>
         ${foldBlock('中文对照', '译', `<div class="en-zh">${enZhHTML(sec.paras)}</div>`, false)}`;
    }
    if (sec.kind === 'reading') {
      return head +
        `<div class="blk-label">原文</div>
         <div class="en-passage">${enPassageHTML(sec.paras)}</div>
         ${foldBlock('中文对照', '译', `<div class="en-zh">${enZhHTML(sec.paras)}</div>`, false)}
         <div class="blk-label">题目</div>
         <div class="en-qs">${sec.items.map(it => enReadItem(it)).join('')}</div>`;
    }
    if (sec.kind === 'match') {
      const isTf = (sec.subs || []).length <= 2;
      const introParas = String(sec.intro || '').split(/\n{2,}/).map(t => `<p class="en-p">${markWords(t)}</p>`).join('');
      return head +
        `<div class="blk-label">${isTf ? '判断依据（T = 正确，F = 错误）' : '候选小标题'}</div>
         <div class="en-subs">${sec.subs.map(([k, t]) => `<span class="sub"><b>${k}</b>${ENT(t)}</span>`).join('')}</div>
         <div class="blk-label">原文</div>
         <div class="en-passage">${introParas}</div>
         <div class="en-qs">${sec.blocks.map(b => enMatchBlock(b, sec.subs)).join('')}</div>
         <div class="en-passage"><p class="en-p">${markWords(sec.tail)}</p></div>
         ${foldBlock('中文对照', '译', `<div class="en-zh">${sec.blocks.map((b, i) => `<p class="en-zp"><i>¶${b.no}</i>${ENT(b.zh)}</p>`).join('')}</div>`, false)}`;
    }
    if (sec.kind === 'translation') {
      return head +
        `<div class="blk-label">原文</div>
         <div class="en-passage">${enPassageHTML(sec.paras)}</div>
         ${foldBlock('参考译文', '译', `<div class="en-zh">${enZhHTML(sec.paras)}</div>`, false)}
         ${sec.words && sec.words.length ? foldBlock('难点词', 'ƒ',
            `<ul class="fx-box">${sec.words.map(([a, b]) => `<li><b>${ENT(a)}</b>　${ENT(b)}</li>`).join('')}</ul>`, false) : ''}`;
    }
    // writing
    // 柱长按本图最大值等比缩放（各年单位不同：百分比、亿、百万、十万人次）
    const cvals = (sec.chart || []).map(x => +x[1] || 0);
    const cmax = Math.max.apply(null, cvals.concat([1]));
    const chart = (sec.chart || []).map(([k, v, u]) => `
      <div class="cbar"><span class="cb-k">${ENT(k)}</span>
        <i class="cb-track"><em style="width:${Math.round(v / cmax * 100)}%"></em></i>
        <span class="cb-v">${v}${u || '%'}</span></div>`).join('');
    return head +
      (chart ? `<div class="blk-label">图表数据</div><div class="en-chart">${chart}</div>` : '') +
      `${foldBlock('范文', '✎', `<div class="en-sample">${sec.sample.split(/\n{2,}/).map(x => `<p>${markWords(x.replace(/\n/g, ' '))}</p>`).join('')}</div>`, false)}
       ${sec.tips && sec.tips.length ? foldBlock('写作要点', '▸', `<ol class="fx-list">${sec.tips.map(t => `<li>${ENT(t)}</li>`).join('')}</ol>`, false) : ''}`;
  }

  /* 从原文里把含该空号的句子找出来，作为该空的上下文题干；
     同一句里其它空号也画成灰色空位，避免和普通数字混淆 */
  function clozeCtxHTML(no) {
    const ps = (EN.sec && EN.sec.paras) || [];
    const nos = new Set(((EN.sec && EN.sec.items) || []).map(x => String(x.no)));
    const hit = new RegExp('(^|[\\s(])' + no + '(?=[\\s.,;:?!)]|$)');
    for (const p of ps) {
      for (const sent of String(p.en || '').split(/(?<=[.!?])\s+/)) {
        if (!hit.test(sent)) continue;
        const all = /(^|[\s(])(\d{1,2})(?!\d)(?!,\s*\d)(?=[\s.,;:?!)]|$)/g;
        let out = '', last = 0, m;
        while ((m = all.exec(sent))) {
          const i = m.index + m[1].length;
          out += markWords(sent.slice(last, i));
          const n = m[2];
          if (nos.has(n)) {
            out += '<span class="en-blank' + (n === String(no) ? '' : ' off') +
                   '" data-blank="' + n + '">' + n + '</span>';
          } else {
            out += ENT(n);
          }
          last = i + n.length;
        }
        out += markWords(sent.slice(last));
        return out;
      }
    }
    return '';
  }

  function enClozeItem(it) {
    const key = EN.y + '-' + EN.sec.id + '-' + it.no;
    const picked = EN.ans[key];
    const ctx = clozeCtxHTML(it.no);
    return `<div class="en-q en-q-cloze" data-no="${it.no}" data-key="${key}">
      <h4><span class="en-qn">${it.no}</span><span class="en-qh">${ctx || '选一个最合适的词'}</span></h4>
      <div class="opt-chips">
        ${it.opts.map((o, k) => `<button class="chip${optCls(picked, ABC[k], it.ans)}" data-k="${ABC[k]}"${picked ? ' disabled' : ''}><b>${ABC[k]}</b><span>${markWords(o)}</span></button>`).join('')}
      </div>
      <div class="exp"${picked ? '' : ' hidden'}>${picked ? enExpHTML(it, key) : ''}</div>
    </div>`;
  }

  function enReadItem(it) {
    const key = EN.y + '-' + EN.sec.id + '-' + it.no;
    const picked = EN.ans[key];
    return `<div class="en-q" data-no="${it.no}" data-key="${key}">
      <h4><span class="en-qn">${it.no}</span><span class="en-qh">${markWords(it.stem)}</span></h4>
      <div class="opts">
        ${it.opts.map((o, k) => `<button class="opt${optCls(picked, ABC[k], it.ans)}" data-k="${ABC[k]}"${picked ? ' disabled' : ''}><b>${ABC[k]}</b><span>${markWords(o)}</span></button>`).join('')}
      </div>
      <div class="exp"${picked ? '' : ' hidden'}>${picked ? enExpHTML(it, key) : ''}</div>
    </div>`;
  }

  function enMatchBlock(b, subs) {
    const key = EN.y + '-' + EN.sec.id + '-' + b.no;
    const picked = EN.ans[key];
    const keys = (subs && subs.length ? subs.map(x => x[0]) : ABC.slice(0, 7));
    return `<div class="en-q" data-no="${b.no}" data-key="${key}">
      <h4><span class="en-qn">${b.no}</span><span class="en-qh">${keys.length > 2 ? (/小标题/.test((EN.sec && EN.sec.title) || '') ? '给这一段选小标题' : '选出对应的一项') : '判断对错'}</span></h4>
      <p class="en-p">${markWords(b.en)}</p>
      <div class="opt-chips chips-${keys.length}">
        ${keys.map(k => `<button class="chip${optCls(picked, k, b.ans)}" data-k="${k}"${picked ? ' disabled' : ''}><b>${k}</b></button>`).join('')}
      </div>
      <div class="exp"${picked ? '' : ' hidden'}>${picked ? enExpHTML(b, key) : ''}</div>
    </div>`;
  }

  function optCls(picked, k, ans) {
    if (!picked) return '';
    if (k === ans) return ' ok';
    return k === picked ? ' no' : '';
  }

  function enExpHTML(it, key) {
    return `<b class="exp-a">答案 ${it.ans}</b>${ENT(it.exp || '')}` +
      (key ? `<button class="exp-reset" data-reset="${key}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        这题重做</button>` : '');
  }

  /* ---------- 作答 ---------- */
  function enAnswer(key, k) {
    if (EN.ans[key]) return;
    const card = document.querySelector('.en-q[data-key="' + key + '"]');
    if (!card) return;
    const sec = EN.sec;
    const no = card.dataset.no;
    const it = (sec.items || []).find(x => String(x.no) === no) || (sec.blocks || []).find(x => String(x.no) === no);
    if (!it) return;
    EN.ans[key] = k;
    store.set('enAns', EN.ans);

    const right = k === it.ans;
    card.querySelectorAll('.opt,.chip').forEach(b => {
      const btnK = b.dataset.k;
      b.classList.toggle('ok', btnK === it.ans);
      b.classList.toggle('no', btnK === k && !right);
      b.disabled = true;
    });
    const exp = card.querySelector('.exp');
    if (exp) { exp.innerHTML = enExpHTML(it, key); exp.hidden = false; }
    if (sec.kind === 'cloze') {
      $$('.en-blank[data-blank="' + no + '"]').forEach(blank => {
        blank.textContent = it.opts[ABC.indexOf(it.ans)];
        blank.classList.add('filled');
      });
    }
    if (navigator.vibrate) navigator.vibrate(right ? 6 : [8, 40, 8]);
    card.classList.add(right ? 'right' : 'wrong');
    syncResetBar();
  }

  /* 每答一题同步一次「已答 / 重做」条的状态 */
  function syncResetBar() {
    const sec = EN.sec;
    if (!sec) return;
    const n = secDone(sec);
    const btn = $('#btnResetSec');
    if (btn) btn.disabled = !n;
    const num = $('#enActsN');
    if (num) num.textContent = n;
  }

  /* 单题重做：只改这一张卡，不动滚动位置 */
  function resetQuestion(key) {
    const card = $('#dContent .en-q[data-key="' + key + '"]');
    if (!card) return;
    if (!EN.ans[key]) return;
    delete EN.ans[key];
    store.set('enAns', EN.ans);

    card.classList.remove('right', 'wrong');
    $$('.opt,.chip', card).forEach(b => {
      b.classList.remove('ok', 'no');
      b.disabled = false;
    });
    const exp = card.querySelector('.exp');
    if (exp) { exp.hidden = true; exp.innerHTML = ''; }

    // 完形：原文里的空位恢复成空号数字
    const no = card.dataset.no;
    $$('.en-blank[data-blank="' + no + '"]').forEach(b => {
      b.textContent = no;
      b.classList.remove('filled');
    });
    syncResetBar();
    if (navigator.vibrate) navigator.vibrate(8);
  }

  /* 整块重做：清掉本板块所有作答后按当前 EN.ans 重绘 */
  function resetSection() {
    const sec = EN.sec;
    if (!sec) return;
    const pre = EN.y + '-' + sec.id + '-';
    let hit = 0;
    Object.keys(EN.ans).forEach(k => {
      if (k.indexOf(pre) === 0) { delete EN.ans[k]; hit++; }
    });
    if (!hit) return;
    store.set('enAns', EN.ans);
    const box = $('#dScroll'), top = box ? box.scrollTop : 0;
    $('#dContent').innerHTML = buildEnSection(sec);
    if (box) box.scrollTop = top;
    if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
  }

  /* ---------- 点词查义 ---------- */
  async function enDict() {
    if (EN.dict) return EN.dict;
    if (!EN.dictP) {
      EN.dictP = enFetch('dict.json').then(d => { EN.dict = d.w || d; return EN.dict; });
    }
    return EN.dictP;
  }

  /* 扩展词典（专四/专八/托福层级的进阶词），只在核心词典查不到时才拉，拉一次后常驻 */
  async function enDict2() {
    if (EN.dict2) return EN.dict2;
    if (!EN.dict2P) {
      EN.dict2P = enFetch('dict2.json')
        .then(d => { EN.dict2 = d.w || d; return EN.dict2; })
        .catch(() => (EN.dict2 = {}));
    }
    return EN.dict2P;
  }

  async function openWord(raw) {
    const sheet = $('#wSheet');
    if (!sheet) return;
    const clean = String(raw || '').replace(/^[^A-Za-z]+|[^A-Za-z'\-]+$/g, '');
    if (!clean) return;
    $('#wsWord').textContent = clean;
    $('#wsPhon').textContent = '';
    $('#wsBody').innerHTML = '<p class="ws-load">查词典…</p>';
    $('#wsAdd').textContent = '＋ 生词本';
    $('#wsAdd').dataset.w = clean;
    $('#wsAdd').hidden = false;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');

    let D;
    try { D = await enDict(); }
    catch (e) { $('#wsBody').innerHTML = '<p class="ws-load">词典加载失败，检查网络后再试</p>'; return; }

    let hit = resolve(clean, D);
    let src = 'core';
    if (!hit) {                                  // 核心词典没有 → 拉扩展词典再试一次
      try {
        const D2 = await enDict2();
        hit = resolve(clean, D2);
        if (hit) { D = D2; src = 'extra'; }
      } catch (e) {}
    }

    /* 连字符复合词：整体查不到就拆开，逐段给释义 */
    if (!hit && /-/.test(clean)) {
      const parts = clean.split('-').filter(Boolean).map(p => ({ w: p, r: resolve(p, D) }));
      const oks = parts.filter(p => p.r);
      if (oks.length >= Math.ceil(parts.length / 2)) {
        $('#wsWord').textContent = clean;
        $('#wsPhon').textContent = '';
        $('#wsAdd').hidden = false;
        $('#wsAdd').dataset.w = clean;
        $('#wsBody').innerHTML = '<span class="ws-form">复合词，按词根分别释义</span><div class="ws-defs">' +
          parts.map(p => {
            if (!p.r) return `<p><b>${ENT(p.w)}</b>：未收录</p>`;
            const it = D[p.r.key] || [];
            const one = String(it[2] || '').split(/\s*\/\s*/)[0] || '';
            return `<p><b>${ENT(p.w)}</b>${p.r.key !== p.w.toLowerCase() ? `（${ENT(p.r.key)}）` : ''}：${ENT(one)}</p>`;
          }).join('') + '</div>';
        $('#wsAdd').classList.remove('on');
        $('#wsAdd').textContent = '＋ 生词本';
        return;
      }
    }

    if (!hit) {
      $('#wsBody').innerHTML = `<p class="ws-load">词库里没有 <b>${ENT(clean)}</b>，多半是人名、地名或机构名。</p>`;
      $('#wsAdd').hidden = true;
      return;
    }

    const key = hit.key;
    const item = D[key];
    const [lv, phon, defs, ex] = item;
    $('#wsWord').textContent = key;
    $('#wsPhon').textContent = phon ? '/' + phon + '/' : '';
    const senses = String(defs || '').split(/\s*\/\s*/).filter(Boolean);
    const lvTxt = LV_NAME[lv] || '';
    const same = key.toLowerCase() === clean.toLowerCase();
    $('#wsBody').innerHTML = `
      ${lvTxt ? `<span class="ws-lv">${lvTxt}</span>` : ''}
      ${same ? '' : `<span class="ws-form">${ENT(clean)}${hit.pre ? '（' + ENCpre(hit.pre) + ' + ' + ENT(key) + '）' : ' → ' + ENT(key)}</span>`}
      <div class="ws-defs">${senses.map(s => `<p>${ENT(s)}</p>`).join('')}</div>
      ${ex ? `<div class="ws-ex"><span>例</span>${ENT(ex)}</div>` : ''}`;
    const has = EN.words.has(key);
    $('#wsAdd').textContent = has ? '✓ 已在生词本' : '＋ 生词本';
    $('#wsAdd').classList.toggle('on', has);
  }

  function ENCpre(p) { return ENT(p) + '-'; }

  function closeWord() {
    const s = $('#wSheet');
    if (!s) return;
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  }

  /* ---------- 英语「词汇」标签页：生词本 + 词库规模 ---------- */
  async function renderEnVocab() {
    const lead = $('#formulaLead');
    const wrap = $('#formulaWrap');
    const cb = $('#chpBar');
    if (cb) cb.hidden = true;
    $('#pageTitle').textContent = '词汇';
    $('#pageSub').textContent = '生词本 · 点词即可收藏';
    if (lead) lead.textContent = '在真题里点亮过的词都在这里，点开可再听音、查义、移除。';
    const ws = Array.from(EN.words);
    if (!ws.length) {
      wrap.innerHTML = `<div class="en-hint">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
        还没有生词。去「题库」打开一篇阅读，点句中任意单词，弹出的卡片里点「＋ 生词本」。
      </div>
      <div class="planned">
        <div class="pl-ic">词</div>
        <h3>离线词库已就绪</h3>
        <p>核心词典 7730 词（高中 / 四级 / 六级 / 考研），扩展词典 9061 词（专四 / 专八 / 托福 / 雅思）。查不到时自动上派生词、前缀和连字符拆分，实测 2018 年真题正文覆盖 97.7%。</p>
        <p class="pl-note">生词本存本机，换设备不同步。</p>
      </div>`;
      return;
    }
    let D = {};
    try { D = await enDict(); } catch (e) {}
    if (EN.dict2) D = Object.assign({}, D, EN.dict2);
    wrap.innerHTML = `<div class="wb-list">${ws.map(w => {
      const it = D[w] || [];
      const defs = String(it[2] || '').split(/\s*\/\s*/).slice(0, 2).join('；');
      return `<div class="wb-row" data-w="${w}">
        <div class="wb-main"><b>${ENT(w)}</b><span>${it[1] ? '/' + ENT(it[1]) + '/' : ''}</span><p>${ENT(defs || '（无释义）')}</p></div>
        <button class="wb-del" data-del="${w}" aria-label="移除">×</button>
      </div>`;
    }).join('')}</div>`;
  }

  /* ---------- 生词本 ---------- */
  function renderMeExtra() {
    const n = EN.words.size;
    const c = $('#wordCnt');
    if (c) c.textContent = n ? n + ' 个词' : '点词自动收录';
  }

  async function openWordBook() {
    $('#dNo').textContent = '生词本';
    $('#dMark').classList.remove('on');
    state.curObj = null;
    const ws = Array.from(EN.words);
    if (!ws.length) {
      $('#dContent').innerHTML = `<h2 class="dtitle">生词本</h2>
        <p class="en-note">还没有收藏的单词。在英语原文里点任意单词，弹出的卡片右下角点「＋ 生词本」即可收藏。</p>`;
    } else {
      let D = {};
      try { D = await enDict(); } catch (e) {}
      if (EN.dict2) D = Object.assign({}, D, EN.dict2);
      $('#dContent').innerHTML = `<h2 class="dtitle">生词本 <span class="wb-n">${ws.length}</span></h2>
        <p class="en-note">点词看释义；右侧「×」移除。</p>
        <div class="wb-list">${ws.map(w => {
          const it = D[w] || [];
          const defs = String(it[2] || '').split(/\s*\/\s*/).slice(0, 2).join('；');
          return `<div class="wb-row" data-w="${w}">
            <div class="wb-main"><b>${ENT(w)}</b><span>${it[1] ? '/' + ENT(it[1]) + '/' : ''}</span><p>${ENT(defs || '（无释义）')}</p></div>
            <button class="wb-del" data-del="${w}" aria-label="移除">×</button>
          </div>`;
        }).join('')}</div>`;
    }
    const d = $('#detail');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#dScroll').scrollTop = 0;
  }

  /* ---------------- 启动 ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    initInstall();
  });
  window.addEventListener('appinstalled', () => {
    const bi = document.getElementById('btnInstall');
    const tip = document.getElementById('installTip');
    if (bi) bi.hidden = true;
    if (tip) tip.hidden = true;
  });

  async function boot() {
    applyTheme();
    state.fs = store.get('fs', 'm');
    applyFs();
    bind();
    propagateSharecode();
    initInstall();

    const qs0 = new URLSearchParams(location.search || '');
    const sub0 = qs0.get('sub');
    if (sub0 && SUBJECTS.some(s => s.id === sub0)) state.sub = sub0;
    if (qs0.get('theme') === 'light' || qs0.get('theme') === 'dark') {
      state.theme = qs0.get('theme'); applyTheme();
    }

    $('#detail').setAttribute('aria-hidden', 'true');
    $('#paper').setAttribute('aria-hidden', 'true');

    if (window.MathJax && MathJax.startup) {
      MathJax.startup.promise.then(() => { mjxReady = true; flushPending(); });
    }

    try { await loadIndex(); } catch (e) {
      if (!curSubject().ready) { switchTab('tiku'); return; }
      $('#pageSub').textContent = '题库加载失败，请检查网络';
      $('#listWrap').innerHTML = '<div class="empty">题库加载失败<br><span style="font-size:12.5px;opacity:.7">点「我的 → 检查更新」重试</span></div>';
      return;
    }

    const qs = new URLSearchParams(location.search || '');
    if (qs.get('theme') === 'light' || qs.get('theme') === 'dark') {
      state.theme = qs.get('theme'); applyTheme();
    }
    const tabReq = qs.get('tab');
    switchTab(tabReq && PAGE_META[tabReq] ? tabReq : 'tiku');
    trackIn();

    const yearReq = +qs.get('year');
    if (yearReq) { state.year = yearReq; switchTab('tiku'); }

    const paperReq = +qs.get('paper');
    if (paperReq) { state.year = paperReq; switchTab('tiku'); setTimeout(() => openPaper(paperReq), 80); }

    const openKey = qs.get('open');
    if (openKey) {
      const [y, no] = openKey.split('-').map(Number);
      const d = await loadYear(y).catch(() => null);
      if (d) {
        const p = d.qs.find(x => x.no === no);
        if (p) setTimeout(() => openDetail(p), 60);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
