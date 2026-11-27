/* ============================================================
   解题页渲染 + 交互（浏览器本地计算版）
   - 主路径：MathCore.solve（浏览器内 nerdamer + mathjs）
   - 可选：若本地 8765 服务在跑，优先用服务端（有考点/公式知识库）
   - 无服务也能算：算术、方程、导数、积分、极限、化简
   ============================================================ */
(function () {
  'use strict';

  var API = '';
  var bound = false;
  var loading = false;
  var lastAnswer = '';
  var MODE = 'single';   // single | whole
  var mjPromise = null;

  var FALLBACK_EXAMPLES = [
    { label: '2+3×4', input: '2+3*4' },
    { label: '√(25+11)', input: '√(25+11)' },
    { label: '解方程 2x+3=7', input: '解方程 2x+3=7' },
    { label: 'x² 求导', input: 'x^2 求导' },
    { label: '∫x² dx', input: '∫x^2 dx' },
    { label: '∫₀¹ x² dx', input: '∫_0^1 x^2 dx' },
    { label: 'lim x→0 sin(x)/x', input: 'lim_{x→0} sin(x)/x' },
    { label: '因式分解 x²−1', input: '因式分解 x^2-1' }
  ];

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  /* ---------- MathJax ---------- */
  function mjxReady() {
    if (mjPromise) return mjPromise;
    mjPromise = new Promise(function (resolve) {
      (function check() {
        if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
          MathJax.startup.promise.then(function () { resolve(true); }).catch(function () { resolve(false); });
        } else {
          setTimeout(check, 150);
        }
      })();
      setTimeout(function () { resolve(false); }, 8000);
    });
    return mjPromise;
  }

  function tex(el, latex, display) {
    if (!el) return;
    var raw = function () {
      el.textContent = latex;
      el.classList.add('raw');
    };
    if (!latex) { el.textContent = '—'; return; }
    el.classList.remove('raw');
    el.textContent = display ? ('$$' + latex + '$$') : ('\\(' + latex + '\\)');
    mjxReady().then(function (ok) {
      if (!ok || !window.MathJax || !MathJax.typesetPromise) { raw(); return; }
      MathJax.typesetPromise([el]).catch(function () { raw(); });
      setTimeout(function () {
        if (!el.querySelector('mjx-container')) raw();
      }, 2500);
    });
  }

  function modeInfo(mode) {
    if (mode === 'reference_proof') return ['参考证明', 'ref'];
    if (mode === 'hint') return ['思路提示', 'ref'];
    return ['已计算', 'ok'];
  }

  /* ---------- 清空 ---------- */
  function clearResult() {
    ['#msResult', '#msMethodCard', '#msStepsCard', '#msTagsCard',
     '#msWarnCard', '#msErrCard', '#msHintCard', '#msWholeResult'].forEach(function (s) {
      var e = $(s); if (e) e.hidden = true;
    });
    var wb = $('#msWholeBlocks'); if (wb) wb.innerHTML = '';
    var ws = $('#msWholeSummary'); if (ws) { ws.hidden = true; ws.innerHTML = ''; }
    ['#msSteps', '#msTags', '#msWarns', '#msHint', '#msMethod'].forEach(function (s) {
      var e = $(s); if (e) e.innerHTML = '';
    });
    lastAnswer = '';
  }

  /* ---------- 渲染 ---------- */
  function render(d) {
    clearResult();
    var box = $('#msResult');
    if (!box) return;
    box.hidden = false;

    $('#msKind').textContent = d.kind_label || d.kind || '结果';
    var mi = modeInfo(d.mode);
    $('#msMode').textContent = mi[0];
    $('#msMode').className = 'ms-badge mode ' + mi[1];

    var a = d.answer || {};
    var ansEl = $('#msAnswer');
    if (d.mode === 'reference_proof') {
      ansEl.textContent = a.latex || a.text || '（参考证明）';
    } else if (a.latex) {
      tex(ansEl, a.latex, true);
    } else if (a.text) {
      ansEl.textContent = a.text;
      ansEl.classList.add('raw');
    } else {
      ansEl.textContent = '—';
    }
    lastAnswer = a.text || a.latex || '';

    var meta = [];
    if (d.normalized && d.normalized !== d.input) {
      meta.push('识别为：' + d.normalized);
    }
    if (d.engine) meta.push(d.engine === 'browser' ? '浏览器计算' : '本地服务');
    if (d.elapsed_ms != null) meta.push(d.elapsed_ms + ' ms');
    $('#msMeta').textContent = meta.join(' · ');

    // 方法
    if (d.method && d.method.name) {
      var m = $('#msMethod');
      var d1 = document.createElement('div');
      d1.textContent = d.method.name;
      m.appendChild(d1);
      if (d.method.note) {
        var d2 = document.createElement('div');
        d2.textContent = d.method.note;
        m.appendChild(d2);
      }
      $('#msMethodCard').hidden = false;
    }

    // 步骤
    if (d.steps && d.steps.length) {
      var steps = $('#msSteps');
      d.steps.forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'ms-step';
        var no = document.createElement('span');
        no.className = 'ms-sno';
        no.textContent = String(s.n);
        row.appendChild(no);
        var act = document.createElement('div');
        act.className = 'ms-sact';
        act.textContent = s.action || ('第 ' + s.n + ' 步');
        row.appendChild(act);
        var content = s.after || s.before || '';
        if (content) {
          var body = document.createElement('div');
          body.className = 'ms-sbody';
          if (d.mode === 'reference_proof') body.textContent = content;
          else tex(body, content, false);
          row.appendChild(body);
        }
        if (s.note) {
          var nt = document.createElement('div');
          nt.className = 'ms-meta';
          nt.textContent = s.note;
          row.appendChild(nt);
        }
        steps.appendChild(row);
      });
      $('#msStepsCard').hidden = false;
      var cnt = $('#msStepNote');
      if (cnt) cnt.textContent = d.steps.length + ' 步';
    }

    // 考点
    var ks = d.knowledge || [];
    var fs = (d.formulas || []);
    if (ks.length || fs.length) {
      var tags = $('#msTags');
      ks.forEach(function (k) {
        var e = document.createElement('div');
        e.className = 'ms-tag';
        e.innerHTML = '<b>' + (k.name || '') + '</b>';
        tags.appendChild(e);
      });
      fs.forEach(function (f) {
        var e = document.createElement('div');
        e.className = 'ms-tag';
        var nm = document.createElement('b');
        nm.textContent = f.name || '';
        e.appendChild(nm);
        if (f.latex) {
          var sp = document.createElement('div');
          sp.className = 'ms-fml';
          e.appendChild(sp);
          tex(sp, f.latex, false);
        }
        tags.appendChild(e);
      });
      $('#msTagsCard').hidden = false;
    }

    // 注意
    if (d.warnings && d.warnings.length) {
      var ul = $('#msWarns');
      d.warnings.forEach(function (w) {
        var li = document.createElement('li');
        li.textContent = w;
        ul.appendChild(li);
      });
      $('#msWarnCard').hidden = false;
    }

    // 错误 / 提示
    if (!d.ok) {
      $('#msErr').textContent = d.error || '这道题暂时算不出来，换个写法试试。';
      $('#msErrCard').hidden = false;
    }

    // 思路提示
    if (d.hint) {
      var h = d.hint;
      var hb = $('#msHint');
      var t = document.createElement('div');
      t.className = 'ms-sact';
      t.textContent = '题型：' + (h.name || '');
      hb.appendChild(t);
      if (h.steps && h.steps.length) {
        var ol = document.createElement('ol');
        h.steps.forEach(function (s) {
          var li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        hb.appendChild(ol);
      }
      if (h.pitfalls && h.pitfalls.length) {
        var p = document.createElement('div');
        p.className = 'pit';
        p.textContent = '易错点：' + h.pitfalls.join('；');
        hb.appendChild(p);
      }
      $('#msHintCard').hidden = false;
    }

    var copy = $('#msCopy');
    if (copy) copy.hidden = !lastAnswer;
  }



  /* ---------- 选择题渲染 ---------- */
  function renderChoice(c) {
    clearResult();
    var box = $('#msResult');
    if (!box) return;
    box.hidden = false;

    $('#msKind').textContent = '选择题';
    var mi = modeInfo('computed');
    $('#msMode').textContent = c.ok ? '已判定' : '未能判定';
    $('#msMode').className = 'ms-badge mode ' + (c.ok ? 'ok' : 'ref');

    var a = { latex: '', text: '' };
    if (c.ok) {
      a.text = c.answer + '. ' + ((c.options.filter(function (o) { return o.letter === c.answer; })[0] || {}).text || '');
    } else {
      a.text = '未能判定';
    }
    var ansEl = $('#msAnswer');
    ansEl.textContent = a.text;
    ansEl.classList.add('raw');
    ansEl.style.fontSize = '22px';
    ansEl.style.fontWeight = '750';
    lastAnswer = a.text;

    $('#msMeta').textContent = '题干：' + (c.target || '—') +
      (c.kind ? (' · ' + c.kind) : '');

    // 选项分析
    var m = $('#msMethod');
    var d1 = document.createElement('div');
    d1.textContent = c.ok ? ('算出结果，逐个比对选项') : '无法直接算出，改为逐项验证';
    m.appendChild(d1);
    $('#msMethodCard').hidden = false;

    var steps = $('#msSteps');
    (c.reason || []).forEach(function (line, i) {
      var row = document.createElement('div');
      row.className = 'ms-step';
      var no = document.createElement('span');
      no.className = 'ms-sno';
      no.textContent = String(i + 1);
      row.appendChild(no);
      var body = document.createElement('div');
      body.className = 'ms-sact';
      body.style.fontWeight = '500';
      body.textContent = line;
      row.appendChild(body);
      steps.appendChild(row);
    });
    if (c.reason && c.reason.length) {
      $('#msStepsCard').hidden = false;
      var cnt = $('#msStepNote');
      if (cnt) cnt.textContent = c.reason.length + ' 步';
    }

    if (!c.ok && c.error) {
      $('#msErr').textContent = c.error;
      $('#msErrCard').hidden = false;
    }

    var copy = $('#msCopy');
    if (copy) copy.hidden = false;
  }

  /* ---------- 整题解析渲染 ---------- */
  function renderWhole(res) {
    clearResult();
    var box = $('#msWholeResult');
    if (!box) return;
    box.hidden = false;

    var sum = $('#msWholeSummary');
    if (sum) {
      sum.hidden = false;
      sum.innerHTML = '共识别 <b>' + res.blocks.length + '</b> 个小问，' +
        '算出 <b>' + res.summary.solved + '</b> 个，' +
        (res.summary.failed ? ('<b>' + res.summary.failed + '</b> 个未能计算') : '全部成功');
    }
    var note = $('#msWholeNote');
    if (note) note.textContent = res.blocks.length + ' 小问';

    var wrap = $('#msWholeBlocks');
    if (!wrap) return;
    wrap.innerHTML = '';

    res.blocks.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'ms-block' + (b.label === '题设' ? ' stem' : '');

      var head = document.createElement('div');
      head.className = 'ms-block-head';
      var no = document.createElement('span');
      no.className = 'ms-block-no';
      no.textContent = b.label || String(b.no);
      head.appendChild(no);
      if (b.ask) {
        var ask = document.createElement('span');
        ask.className = 'ms-block-ask';
        ask.textContent = '要求：' + b.ask;
        head.appendChild(ask);
      }
      var st = document.createElement('span');
      var allOk = b.solved === b.total && b.total > 0;
      st.className = 'ms-block-status ' + (allOk ? 'ok' : 'ng');
      st.textContent = allOk ? '已算出' : (b.solved + '/' + b.total);
      head.appendChild(st);
      el.appendChild(head);

      var txt = document.createElement('div');
      txt.className = 'ms-block-text';
      txt.textContent = b.solNote ? (b.text + '\n→ ' + b.solNote) : b.text;
      el.appendChild(txt);

      var asks = document.createElement('div');
      asks.className = 'ms-asks';
      b.results.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'ms-ask';

        var inp = document.createElement('div');
        inp.className = 'ms-ask-input';
        inp.textContent = r.input;
        item.appendChild(inp);

        var ans = document.createElement('div');
        if (r.ok) {
          ans.className = 'ms-ask-ans';
          if (r.answer && r.answer.latex) tex(ans, r.answer.latex, false);
          else ans.textContent = (r.answer && r.answer.text) || '—';
          item.appendChild(ans);
          if (r.kind) {
            var nt = document.createElement('div');
            nt.className = 'ms-ask-note';
            nt.textContent = r.kind + (r.method && r.method.name ? ' · ' + r.method.name : '');
            item.appendChild(nt);
          }
        } else {
          ans.className = 'ms-ask-ans ng';
          ans.textContent = r.error || '这道小题暂时算不出来';
          item.appendChild(ans);
        }
        asks.appendChild(item);
      });
      el.appendChild(asks);
      wrap.appendChild(el);
    });
  }

  /* ---------- 求解入口 ---------- */
  async function solve() {
    if (loading) return;
    var input = ($('#msInput').value || '').trim();
    if (!input) { setStatus('请先输入题目'); $('#msInput').focus(); return; }

    loading = true;
    var btn = $('#msSolve');
    if (btn) btn.disabled = true;
    setStatus('计算中…');
    clearResult();

    /* ---- 选择题（单个算式模式下自动识别 A/B/C/D 选项） ---- */
    if (MODE === 'single' && window.MathChoice) {
      try {
        if (MathChoice.isChoice(input)) {
          var cr = MathChoice.solve(input);
          if (cr) {
            renderChoice(cr);
            setStatus(cr.ok ? ('答案 ' + cr.answer) : '未能判定');
            try { localStorage.setItem('m2solver:last', input); } catch (e) {}
            loading = false;
            if (btn) btn.disabled = false;
            return;
          }
        }
      } catch (e) {}
    }

    /* ---- 整题模式 ---- */
    if (MODE === 'whole' && window.MathProblem) {
      var pr;
      try {
        pr = MathProblem.parse(input);
      } catch (e) {
        pr = null;
      }
      if (pr && pr.blocks && pr.blocks.length) {
        renderWhole(pr);
        setStatus(pr.ok ? ('完成 ' + pr.summary.solved + '/' + pr.summary.total) : '未能计算');
        loading = false;
        if (btn) btn.disabled = false;
        return;
      }
    }

    // 1) 浏览器本地引擎（永远可用）
    var local = null;
    try {
      if (window.MathCore) local = MathCore.solve(input);
    } catch (e) {
      local = null;
    }

    // 2) 尝试本地服务（有就用，服务端有考点库）
    var remote = null;
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 3000);
      var resp = await fetch(API + '/v1/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input }),
        signal: ctrl ? ctrl.signal : undefined
      });
      clearTimeout(timer);
      if (resp.ok) {
        var data = await resp.json();
        if (data && data.ok) remote = data;
      }
    } catch (e) { /* 服务不可用，忽略 */ }

    // 3) 优先远程（信息更全），否则本地
    var result = remote || local;

    if (!result) {
      result = {
        ok: false, kind_label: '未能计算', mode: 'hint',
        answer: {}, steps: [],
        error: '没有识别到可计算的内容。可以试试：2+3*4、x^2 求导、∫_0^1 x^2 dx、解方程 2x+3=7'
      };
    }
    if (local && local.ok) {
      // 本地成功但远程没成功 → 明确标注引擎
      if (!remote) result.engine = 'browser';
      // 若远程成功但本地也成功，答案不同时以��程为准，但补上识别信息
      if (remote && local.normalized && !remote.normalized) remote.normalized = local.normalized;
    }

    render(result);
    setStatus(result.ok ? '完成' : '未能计算');
    try { localStorage.setItem('m2solver:last', input); } catch (e) {}

    loading = false;
    if (btn) btn.disabled = false;
  }

  function setStatus(t) {
    var e = $('#msStatus');
    if (e) e.textContent = t;
  }

  /* ---------- 示例 ---------- */
  async function loadExamples() {
    var box = $('#msExamples');
    if (!box || box.childElementCount) return;
    var items = FALLBACK_EXAMPLES;
    if (API) {
      try {
        var r = await fetch(API + '/v1/examples');
        if (r.ok) {
          var d = await r.json();
          if (d.items && d.items.length) items = d.items;
        }
      } catch (e) {}
    }
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'ms-chip';
      b.type = 'button';
      b.textContent = it.label || '示例';
      b.addEventListener('click', function () {
        $('#msInput').value = it.input;
        $('#msInput').focus();
      });
      box.appendChild(b);
    });
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    if (bound) return;
    bound = true;
    var solveBtn = $('#msSolve');
    if (!solveBtn) return;

    solveBtn.addEventListener('click', solve);
    $('#msClear').addEventListener('click', function () {
      $('#msInput').value = '';
      clearResult();
      setStatus('');
      $('#msInput').focus();
    });
    // 模式切换
    var sw = $('#msModeSwitch');
    if (sw) {
      Array.prototype.forEach.call(sw.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(sw.querySelectorAll('button'), function (x) {
            x.classList.toggle('on', x === b);
          });
          MODE = b.getAttribute('data-mode') || 'single';
          var ta = $('#msInput');
          var lbl = $('#msInputLabel');
          if (MODE === 'whole') {
            if (lbl) lbl.textContent = '整段题目';
            if (ta) {
              ta.rows = 8;
              ta.placeholder = '把整道题粘进来，例如：\n已知 f(x)=x^2+3x，求 f\'(x)\n或\n求下列各题：(1)∫_0^1 x^2 dx；(2)lim_{x→0} sin(x)/x；(3)解方程 2x+3=7';
            }
          } else {
            if (lbl) lbl.textContent = '题目输入';
            if (ta) {
              ta.rows = 4;
              ta.placeholder = '例：\\lim_{x\\to0}\\frac{\\sin x-x}{x^3}   或   求 ∫_0^1 x^2 e^x dx';
            }
          }
          clearResult();
          setStatus('');
        });
      });
    }

    $('#msInput').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        solve();
      }
    });
    var copy = $('#msCopy');
    if (copy) {
      copy.addEventListener('click', async function () {
        if (!lastAnswer) return;
        try { await navigator.clipboard.writeText(lastAnswer); }
        catch (e) {
          var ta = document.createElement('textarea');
          ta.value = lastAnswer;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (x) {}
          ta.remove();
        }
        copy.textContent = '已复制';
        setTimeout(function () { copy.textContent = '复制'; }, 1500);
      });
    }
    loadExamples();
  }

  function mount() {
    var page = $('#page-solver');
    if (!page) return;
    bind();
    if (window.MathSolverOcr) window.MathSolverOcr.build();
    if (window.MathSolverKb) window.MathSolverKb.build();
    var lbl = $('#msApiLabel');
    if (lbl) lbl.textContent = '浏览器本地计算（nerdamer + mathjs）· 无需联网';

    var qs = new URLSearchParams(location.search || '');

    // URL 指定模式
    var mq = qs.get('mode');
    if (mq === 'whole' || mq === 'single') {
      var sw = $('#msModeSwitch');
      if (sw) {
        var target = sw.querySelector('button[data-mode="' + mq + '"]');
        if (target && !target.classList.contains('on')) target.click();
      }
    }

    var q = qs.get('q');
    var ta = $('#msInput');
    if (q && ta && !ta.value) {
      ta.value = q;
      if (qs.get('auto') === '1') setTimeout(solve, 400);
    } else if (!q && ta && !ta.value) {
      try {
        var last = localStorage.getItem('m2solver:last');
        if (last) ta.value = last;
      } catch (e) {}
    }
  }

  window.MathSolverUI = { mount: mount, solve: solve, core: function () { return window.MathCore; } };
})();


