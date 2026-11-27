/* ============================================================
   英语词库 · Oxford 3000 全库（2975 词）
   - 已写故事：84 词，完整 6 项
   - 已汇入：其余牛津词，先给音标 + 中文释义，故事待补
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'eng:theme';
  var KNOWN_KEY = 'eng:known';
  var PAGE = 120;
  var FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'done', label: '已写故事' },
    { id: 'todo', label: '待补故事' },
    { id: '多义词', label: '多义词' },
    { id: '同根词族', label: '同根词族' },
    { id: '熟词僻义', label: '熟词僻义' },
    { id: '词源故事', label: '词源故事' },
    { id: '易混词', label: '易混词' }
  ];

  var words = [];
  var known = {};
  var filter = 'all';
  var query = '';
  var limit = PAGE;
  var filtered = [];
  var current = -1;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function isDone(w) { return w.status !== 'todo'; }

  /* ---------- 主题 ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    root.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
    var ramp = 'blue';
    try { ramp = localStorage.getItem('m2:ramp') || 'blue'; } catch (e) {}
    root.setAttribute('data-ramp', ramp);
  }
  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  function loadKnown() {
    try { known = JSON.parse(localStorage.getItem(KNOWN_KEY) || '{}') || {}; } catch (e) { known = {}; }
  }
  function saveKnown() {
    try { localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); } catch (e) {}
  }

  /* ---------- 统计 ---------- */
  function countDone() {
    var n = 0;
    for (var i = 0; i < words.length; i++) if (isDone(words[i])) n++;
    return n;
  }
  function updateStats() {
    var done = countDone();
    var k = 0;
    for (var i = 0; i < words.length; i++) if (known[words[i].word]) k++;
    $('stWords').textContent = words.length;
    $('stDone').textContent = done;
    $('stTodo').textContent = words.length - done;
    $('stKnown').textContent = k;
    var pct = words.length ? Math.round(k / words.length * 100) : 0;
    $('enBar').style.width = pct + '%';
  }

  /* ---------- 筛选 ---------- */
  function match(w) {
    if (filter === 'done' && !isDone(w)) return false;
    if (filter === 'todo' && isDone(w)) return false;
    if (filter !== 'all' && filter !== 'done' && filter !== 'todo') {
      if ((w.tags || []).indexOf(filter) === -1) return false;
    }
    if (!query) return true;
    var q = query.toLowerCase();
    var hay = [w.word, w.core, w.bridge, w.story, (w.cognates || []).join(' '), (w.collocations || []).join(' '), (w.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function confClass(c) {
    if (/^高/.test(c || '')) return 'hi';
    if (/^中/.test(c || '')) return 'mid';
    if (/^待补/.test(c || '')) return 'todo';
    return '';
  }

  function card(w, idx) {
    var todo = !isDone(w);
    var tags = (w.tags || []).slice(0, 3).map(function (t) { return '<em>' + esc(t) + '</em>'; }).join('');
    var bridge = w.bridge || (todo ? '故事待补 · 先记释义，后面按词根族补上' : '');
    return '<button class="en-card' + (known[w.word] ? ' done' : '') + (todo ? ' todo' : '') + '" data-i="' + idx + '" type="button">' +
      '<div class="en-word">' + esc(w.word) + (w.phonetic ? '<span class="en-ph">/' + esc(w.phonetic) + '/</span>' : '') + '</div>' +
      '<div class="en-core">' + esc(w.core) + '</div>' +
      '<div class="en-bridge">' + esc(bridge) + '</div>' +
      '<div class="en-card-foot">' +
        '<span class="en-badge ' + confClass(w.confidence) + '">' + esc(w.confidence) + '</span>' +
        '<span class="en-tags">' + tags + '</span>' +
        '<span class="en-go">' + (todo ? '释义 →' : '故事 →') + '</span>' +
      '</div>' +
    '</button>';
  }

  function render() {
    filtered = [];
    for (var i = 0; i < words.length; i++) if (match(words[i])) filtered.push(i);
    var slice = filtered.slice(0, limit);
    var html = '';
    for (var j = 0; j < slice.length; j++) html += card(words[slice[j]], slice[j]);
    $('enGrid').innerHTML = html;
    var done = countDone();
    $('enCount').textContent = '显示 ' + slice.length + ' / 匹配 ' + filtered.length + ' · 全库 ' + words.length + ' 词（已写故事 ' + done + '）';
    $('enEmpty').hidden = filtered.length > 0;
    var more = $('enMore');
    if (more) more.hidden = filtered.length <= limit;
    updateStats();
    bindCards();
  }

  function bindCards() {
    Array.prototype.forEach.call(document.querySelectorAll('.en-card'), function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
      el.addEventListener('click', function () { openModal(parseInt(el.getAttribute('data-i'), 10)); });
    });
  }

  /* ---------- 弹窗 ---------- */
  function openModal(i) {
    if (i < 0 || i >= words.length) return;
    current = i;
    var w = words[i];
    var todo = !isDone(w);
    $('mWord').textContent = w.word;
    $('mPhone').textContent = w.phonetic ? '/' + w.phonetic + '/' : '';
    $('mConf').textContent = '置信度：' + (w.confidence || '—');
    $('mConf').className = 'en-badge ' + confClass(w.confidence);
    $('mTags').innerHTML = (w.tags || []).map(function (t) { return '<em>' + esc(t) + '</em>'; }).join('');
    $('mCore').textContent = w.core || '';
    $('mBridge').textContent = w.bridge || (todo ? '故事待补：先记核心义，后面按词根族补上。' : '');
    $('mStory').textContent = w.story || (todo ? '这个词已汇入全库，但故事还没写。先把核心义和发音记住，下一次批量补故事时会优先处理高频词。' : '');
    $('mCog').innerHTML = (w.cognates || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') || '<span class="en-none">待补</span>';
    $('mCol').innerHTML = (w.collocations || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') || '<span class="en-none">待补</span>';
    var btn = $('mKnown');
    btn.textContent = known[w.word] ? '已掌握 ✓（点击取消）' : '标记为已掌握';
    btn.classList.toggle('on', !!known[w.word]);
    $('enModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('enModal').hidden = true;
    document.body.style.overflow = '';
    current = -1;
  }
  function moveModal(dir) {
    if (current < 0) return;
    var pos = filtered.indexOf(current);
    if (pos === -1) { pos = words.indexOf(words[current]); }
    var next = filtered[(Math.max(pos, 0) + dir + filtered.length) % filtered.length];
    if (next != null) openModal(next);
  }
  function toggleKnown() {
    if (current < 0) return;
    var w = words[current];
    known[w.word] = !known[w.word];
    saveKnown();
    openModal(current);
    render();
  }

  function bindModal() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
      el.addEventListener('click', closeModal);
    });
    $('mKnown').addEventListener('click', toggleKnown);
    $('mPrev').addEventListener('click', function () { moveModal(-1); });
    $('mNext').addEventListener('click', function () { moveModal(1); });
    document.addEventListener('keydown', function (e) {
      if ($('enModal').hidden) return;
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowLeft') moveModal(-1);
      if (e.key === 'ArrowRight') moveModal(1);
    });
  }

  /* ---------- 工具栏 ---------- */
  function buildChips() {
    var box = $('enChips');
    box.innerHTML = FILTERS.map(function (f) {
      return '<button type="button" data-f="' + f.id + '"' + (f.id === filter ? ' class="on"' : '') + '>' + f.label + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        filter = b.getAttribute('data-f');
        limit = PAGE;
        Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
        render();
      });
    });
  }

  function init() {
    initTheme();
    loadKnown();
    $('enTheme').addEventListener('click', toggleTheme);
    buildChips();
    bindModal();
    $('enGrid').innerHTML = '<div class="en-empty"><b>词库加载中…</b><span>先加载 84 个已写故事词，再补全 2891 个待补词</span></div>';
    $('enQ').addEventListener('input', function () {
      query = $('enQ').value.trim();
      limit = PAGE;
      render();
    });
    $('enMore').addEventListener('click', function () { limit += PAGE; render(); });
    function fetchJSON(url, tries) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (err) {
        if (tries <= 1) throw err;
        return new Promise(function (res) { setTimeout(res, 700); }).then(function () {
          return fetchJSON(url, tries - 1);
        });
      });
    }

    fetchJSON('english/words.json?v=9', 3)
      .then(function (base) {
        words = base.words || [];
        render();
        return fetchJSON('english/words_more.json?v=9', 2).then(function (more) {
          if (more && more.words && more.words.length) {
            words = words.concat(more.words);
            render();
          }
        }).catch(function () {});
      })
      .catch(function (err) {
        $('enGrid').innerHTML = '<div class="en-empty"><b>词库加载失败</b><span>请刷新重试（' + esc(err.message) + '）</span></div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
