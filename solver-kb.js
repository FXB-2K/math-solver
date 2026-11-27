/* ============================================================
   解题页：符号键盘 + 输入识别提示
   插入到 #msInput 下方，点按即插入到光标处
   ============================================================ */
(function () {
  'use strict';

  var GROUPS = [
    {
      id: 'basic', label: '常用',
      rows: [
        ['7', '8', '9', '÷', '×'],
        ['4', '5', '6', '+', '−'],
        ['1', '2', '3', '=', '('],
        ['0', '.', 'π', 'e', ')'],
        ['x', 'y', 'n', '^', '√']
      ]
    },
    {
      id: 'fn', label: '函数',
      rows: [
        ['sin', 'cos', 'tan', 'ln', 'e^'],
        ['arcsin', 'arccos', 'arctan', 'log', 'abs'],
        ['√', 'x²', 'x³', '1/x', '|x|']
      ]
    },
    {
      id: 'calc', label: '微积分',
      rows: [
        ['∫', '∫_a^b', 'd/dx', 'lim', 'Σ'],
        ['∫dx', '{…}', '[ ]', ',', ';'],
        ['frac', 'power', 'sqrt', 'abs', 'pi']
      ]
    },
    {
      id: 'ins', label: '插入',
      rows: [
        ['求导 ', '积分 ', '定积分 ', '极限 ', '解方程 '],
        ['因式分解 ', '展开 ', '化简 ', '计算 ', '等于多少'],
        ['从', '到', '关于', '的', 'dx']
      ]
    }
  ];

  // 显示文字 → 实际插入文字
  var INSERT = {
    '÷': '/', '×': '*', '−': '-', '−': '-',
    'π': 'π', '√': '√', 'x²': 'x²', 'x³': 'x³', '1/x': '1/x',
    'e^': 'e^', '|x|': '|x|', 'abs': 'abs(',
    '∫': '∫', '∫_a^b': '∫_0^1 ', 'd/dx': 'd/dx ', 'lim': 'lim ', 'Σ': '∑',
    '∫dx': '∫ dx', '{…}': '{}', '[ ]': '[]',
    'frac': '\\frac{}{}', 'power': '^', 'sqrt': '\\sqrt{}', 'pi': 'π',
    'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(', 'ln': 'ln(', 'log': 'log(',
    'arcsin': 'arcsin(', 'arccos': 'arccos(', 'arctan': 'arctan(',
    '=': '=', '(': '(', ')': ')', ',': ',', ';': ';'
  };

  function $(id) { return document.getElementById(id); }

  function build() {
    var ta = $('msInput');
    if (!ta || document.querySelector('.ms-kb')) return;

    var wrap = document.createElement('div');
    wrap.className = 'ms-kb';
    wrap.innerHTML =
      '<div class="ms-kb-head">' +
        '<div class="ms-kb-tabs" id="msKbTabs"></div>' +
        '<b>点符号插入到光标处</b>' +
      '</div>' +
      '<div class="ms-kb-body" id="msKbBody"></div>';

    ta.parentNode.insertBefore(wrap, ta.nextSibling);

    var tabs = wrap.querySelector('#msKbTabs');
    var body = wrap.querySelector('#msKbBody');
    var active = GROUPS[0].id;

    GROUPS.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = g.label;
      b.setAttribute('data-g', g.id);
      if (g.id === active) b.className = 'on';
      b.addEventListener('click', function () {
        active = g.id;
        Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x === b);
        });
        drawBody();
      });
      tabs.appendChild(b);
    });

    function drawBody() {
      var g = GROUPS.filter(function (x) { return x.id === active; })[0];
      body.innerHTML = '';
      g.rows.forEach(function (row) {
        var r = document.createElement('div');
        r.className = 'ms-kb-row';
        row.forEach(function (key) {
          var b = document.createElement('button');
          b.type = 'button';
          var isTxt = /[\u4e00-\u9fa5]/.test(key) || key.length > 3;
          b.className = isTxt ? 'txt' : '';
          b.textContent = key;
          b.addEventListener('click', function () { insert(key); });
          r.appendChild(b);
        });
        body.appendChild(r);
      });
    }

    function insert(key) {
      var text = INSERT[key] !== undefined ? INSERT[key] : key;
      var start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      var pos = start + text.length;
      // 有 "{}" 时把光标放到括号里
      var brace = text.indexOf('{');
      if (brace >= 0 && text.indexOf('}') > brace) pos = start + brace + 1;
      ta.focus();
      try { ta.setSelectionRange(pos, pos); } catch (e) {}
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    drawBody();
  }

  window.MathSolverKb = { build: build };
})();
