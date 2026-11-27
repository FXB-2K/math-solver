/* ============================================================
   专业数学输入（基于 MathLive）
   - 所见即所得：分数、根号、积分上下限、上下标都能直接编辑
   - 同时保留纯文本输入，两种模式可切换
   - MathLive 输出 LaTeX → 由 LaTeX2Cas 转成引擎能算的形式
   ============================================================ */
(function (global) {
  'use strict';

  var mf = null;          // math-field 元素
  var ready = false;
  var MODE = 'math';      // math | text

  function $(id) {
    if (!id) return null;
    return id.charAt(0) === '#' ? document.querySelector(id) : document.getElementById(id);
  }

  /* ---------- 创建 math-field ---------- */
  function ensureField() {
    if (mf) return mf;
    var ta = $('#msInput');
    if (!ta) return null;

    var wrap = document.createElement('div');
    wrap.className = 'ms-mathwrap';
    wrap.innerHTML =
      '<math-field class="ms-mathfield" id="msMathField" ' +
        'virtual-keyboard-mode="manual" ' +
        'smart-mode="true" ' +
      '></math-field>' +
      '<div class="ms-math-hint">' +
        '<span>点这里直接输入：分数、根号、积分都能打</span>' +
        '<button type="button" class="ms-math-kb" id="msMathKbBtn">插入符号</button>' +
        '<button type="button" class="ms-math-fill" id="msMathFill">填入题目框</button>' +
      '</div>';

    ta.parentNode.insertBefore(wrap, ta);

    mf = wrap.querySelector('#msMathField');
    try {
      mf.value = '\\int_0^1 x^2\\,dx';
    } catch (e) {}

    // 「填入题目框」：把 LaTeX 写进 textarea 并触发解题
    wrap.querySelector('#msMathFill').addEventListener('click', function () {
      var latex = '';
      try { latex = mf.getValue ? mf.getValue('latex') : mf.value; } catch (e) {}
      if (!latex) return;
      ta.value = latex;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      setMode('text');
      try { ta.focus(); } catch (e) {}
    });

    // 「插入符号」：打开 MathLive 虚拟键盘
    wrap.querySelector('#msMathKbBtn').addEventListener('click', function () {
      try {
        mf.executeCommand('toggleVirtualKeyboard');
      } catch (e) {
        try { mf.focus(); } catch (e2) {}
      }
    });

    return mf;
  }

  /* ---------- 模式切换 ---------- */
  function setMode(m) {
    MODE = m;
    var wrap = document.querySelector('.ms-mathwrap');
    var ta = $('#msInput');
    var btns = document.querySelectorAll('#msInModeSwitch button');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('on', b.getAttribute('data-inmode') === m);
    });
    if (wrap) wrap.hidden = (m !== 'math');
    if (ta) ta.hidden = (m === 'math');
  }

  /* ---------- 取值 ---------- */
  function getValue() {
    var ta = $('#msInput');
    if (MODE === 'text') return ta ? ta.value : '';
    if (!mf) return ta ? ta.value : '';
    try {
      return mf.getValue ? mf.getValue('latex') : mf.value;
    } catch (e) {
      return mf.value || '';
    }
  }

  function getPlain() {
    // 尽量给出人类可读的纯文本形式（用于显示"识别为"）
    if (MODE === 'text') {
      var ta = $('#msInput');
      return ta ? ta.value : '';
    }
    return getValue();
  }

  function setValue(v) {
    var ta = $('#msInput');
    if (ta) ta.value = v || '';
    if (mf) {
      try { mf.value = v || ''; } catch (e) {}
    }
  }

  function clear() {
    setValue('');
    try { if (mf) mf.value = ''; } catch (e) {}
  }

  function focus() {
    if (MODE === 'math' && mf) { try { mf.focus(); } catch (e) {} }
    else { var ta = $('#msInput'); if (ta) ta.focus(); }
  }

  /* ---------- 构建界面 ---------- */
  function build() {
    var ta = $('#msInput');
    if (!ta || document.querySelector('.ms-mathwrap')) return;

    if (typeof customElements === 'undefined' || !customElements.get('math-field')) {
      // MathLive 未加载 → 退回纯文本
      return;
    }

    ensureField();

    // 在文本域上方插入「专业 / 文本」切换
    var sw = document.createElement('div');
    sw.className = 'ms-inmode-switch';
    sw.id = 'msInModeSwitch';
    sw.innerHTML =
      '<button type="button" class="on" data-inmode="math">专业公式</button>' +
      '<button type="button" data-inmode="text">纯文本</button>';
    ta.parentNode.insertBefore(sw, ta);

    Array.prototype.forEach.call(sw.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-inmode');
        if (m === 'text' && MODE === 'math' && mf) {
          // 切到文本时把 LaTeX 同步过去
          var ta2 = $('#msInput');
          var latex = '';
          try { latex = mf.getValue ? mf.getValue('latex') : mf.value; } catch (e) {}
          if (ta2 && latex) ta2.value = latex;
        } else if (m === 'math' && MODE === 'text' && mf) {
          var ta3 = $('#msInput');
          if (ta3 && ta3.value) { try { mf.value = ta3.value; } catch (e) {} }
        }
        setMode(m);
      });
    });

    setMode('math');
    ready = true;
  }

  global.MathInput = {
    build: build,
    getValue: getValue,
    getPlain: getPlain,
    setValue: setValue,
    clear: clear,
    focus: focus,
    setMode: setMode,
    mode: function () { return MODE; },
    field: function () { return mf; },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
