/* ============================================================
   MathSolver Core — 纯浏览器计算引擎 v1.1
   依赖：nerdamer（符号）+ mathjs（数值），均本地打包，无网络
   能力：任意算术 / 代数 / 化简 / 因式分解 / 展开 / 求导 /
         不定积分 / 定积分 / 极限 / 解方程 / 数值计算
   输入：中文口语、LaTeX、unicode 符号（√ ∫ ² ³ π × ÷ ∑）都能认
   ============================================================ */
(function (global) {
  'use strict';

  var N = global.nerdamer || null;
  var MJ = global.math || null;

  /* ============ 1. 输入归一化 ============ */

  var SUP = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n'
  };
  var SUB = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
  };

  function fixSupSub(s) {
    // a²  → a^2
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+/g, function (m) {
      var d = '';
      for (var i = 0; i < m.length; i++) d += (SUP[m[i]] || '');
      return '^' + d;
    });
    // a₀ → a_0（仅留作标记，后续由积分处理）
    s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, function (m) {
      var d = '';
      for (var i = 0; i < m.length; i++) d += (SUB[m[i]] || '');
      return '_' + d;
    });
    return s;
  }

  // 中文词（**必须按长度倒序**，否则「解」会先于「因式分解」被吃掉）
  var CN_WORDS = [
    '计算一下', '算一下', '求一下', '解一下', '请帮我计算', '请帮我算',
    '解不等式', '因式分解', '分解因式', '不定积分', '定积分', '求极限', '求导数',
    '计算', '求出', '求解', '化简', '简化', '展开', '求导', '微分', '积分',
    '极限', '导数', '解方程', '的值', '等于多少', '等于几', '是多少', '是几',
    '结果', '答案', '多少', '帮我', '请帮', '请问', '麻烦', '求', '算', '解',
    '从', '到', '关于', '对', '的', '呢', '吗', '吧', '值'
  ].sort(function (a, b) { return b.length - a.length; });

  function stripChinese(s) {
    var out = s;

    // 中文数学短语（长词优先）
    out = out.replace(/([0-9a-zA-Z\)\(\]]+)\s*的?\s*阶乘/g, '($1)!');
    out = out.replace(/([0-9a-zA-Z\)\(\]]+)\s*的?\s*平方/g, '($1)^2');
    out = out.replace(/([0-9a-zA-Z\)\(\]]+)\s*的?\s*立方/g, '($1)^3');
    out = out.replace(/根号\s*下?\s*([0-9a-zA-Z]+)/g, '√$1');
    out = out.replace(/开?平方/g, '√');

    // 中文运算符（长词优先）
    out = out.replace(/除以/g, '/')
             .replace(/乘以/g, '*')
             .replace(/减去/g, '-')
             .replace(/加上/g, '+')
             .replace(/减/g, '-')
             .replace(/加/g, '+')
             .replace(/乘以|乘/g, '*')
             .replace(/除以|除/g, '/');

    // 先整体处理「对 x 求导 / 关于 x 求导」
    out = out.replace(/对\s*([a-zA-Z])\s*求导/g, ' @DV[$1] ');
    out = out.replace(/关于\s*([a-zA-Z])\s*求导/g, ' @DV[$1] ');
    out = out.replace(/对\s*([a-zA-Z])\s*求(?:导数|微分)/g, ' @DV[$1] ');
    // 「从 a 到 b」→ @RANGE[a|b]
    out = out.replace(/从\s*([-\d.a-zA-Z\/]+)\s*到\s*([-\d.a-zA-Z\/]+)/g, ' @RANGE[$1|$2] ');
    // 「a 到 b 上」/「[a,b] 上」
    out = out.replace(/\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*上?/g, ' @RANGE[$1|$2] ');
    for (var i = 0; i < CN_WORDS.length; i++) {
      out = out.split(CN_WORDS[i]).join(' ');
    }
    out = out.replace(/[，。；：、？！「」【】]/g, ' ');
    return out;
  }

  function fixUnicode(s) {
    return s
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/[\u00d7\u00b7\u22c5]/g, '*')
      .replace(/\u00f7/g, '/')
      .replace(/[\uff08]/g, '(')
      .replace(/[\uff09]/g, ')')
      .replace(/\uff0c/g, ',')
      .replace(/\uff1d/g, '=')
      .replace(/[\uff0b]/g, '+')
      .replace(/[\uff0d]/g, '-')
      .replace(/[\uff0a]/g, '*')
      .replace(/[\uff0f]/g, '/')
      .replace(/\u03c0/g, 'pi')
      .replace(/\u221e/g, 'Infinity')
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(/\u2260/g, '!=')
      .replace(/\u2192/g, '->')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  }

  // √  →  sqrt(...)
  function fixSqrt(s) {
    var out = s, guard = 0;
    while (out.indexOf('\u221a') >= 0 && guard++ < 60) {
      var i = out.indexOf('\u221a');
      var rest = out.slice(i + 1);
      if (rest.charAt(0) === '(') {
        var depth = 0, j = 0, end = -1;
        for (; j < rest.length; j++) {
          if (rest.charAt(j) === '(') depth++;
          else if (rest.charAt(j) === ')') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end > 0) {
          out = out.slice(0, i) + 'sqrt' + rest.slice(0, end + 1) + rest.slice(end + 1);
          continue;
        }
      }
      var m = rest.match(/^([0-9]+(\.[0-9]+)?|[a-zA-Z]+(\^[0-9]+)?)/);
      if (m) out = out.slice(0, i) + 'sqrt(' + m[1] + ')' + rest.slice(m[1].length);
      else out = out.slice(0, i) + 'sqrt' + rest;
    }
    return out;
  }

  // LaTeX
  function fixLatex(s) {
    var out = s, guard = 0;

    while (/\\[dt]?frac/.test(out) && guard++ < 40) {
      out = out.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    }
    out = out.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '(($2)^(1/($1)))');
    guard = 0;
    while (/\\sqrt/.test(out) && guard++ < 40) {
      out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
    }
    // \int_{a}^{b}
    out = out.replace(/\\int\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}/g, '@DEF[$1|$2]');
    out = out.replace(/\\int\s*_\s*\{([^{}]*)\}\s*\^\s*([^\s{]+)/g, '@DEF[$1|$2]');
    out = out.replace(/\\int\s*_\s*([^\s^{]+)\s*\^\s*\{([^{}]*)\}/g, '@DEF[$1|$2]');
    out = out.replace(/\\int/g, '@IND');
    // \lim_{x\to a}
    out = out.replace(/\\lim\s*_\s*\{([^{}]*)\}/g, '@LIM[$1]');
    out = out.replace(/\\lim\s*_\s*([^\s{]+)/g, '@LIM[$1]');
    // \sum_{i=1}^{n}
    out = out.replace(/\\sum\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}/g, '@SUM[$1|$2]');
    // 导数
    out = out.replace(/\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}/g, '@DV[$1]');
    // 符号
    out = out.replace(/\\pi/g, 'pi')
      .replace(/\\infty/g, 'Infinity')
      .replace(/\\cdot|\\times/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\left|\\right/g, '')
      .replace(/\\[,;:!]/g, ' ')
      .replace(/\\mathrm|\\text/g, '')
      .replace(/\\[a-zA-Z]+/g, function (m) {
        var f = m.slice(1);
        if (/^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|abs|max|min|sqrt)$/.test(f)) {
          return f === 'ln' ? 'log' : f;
        }
        return ' ';
      })
      .replace(/[{}]/g, '');
    return out;
  }

  // ∫ 上下限：支持 ∫_a^b、∫_{a}^{b}、@DEF[a|b]
  function fixIntegral(s) {
    var out = s, guard = 0;

    // unicode 上下限：∫_0^1 f dx
    guard = 0;
    while (/\u222b\s*_/.test(out) && guard++ < 30) {
      out = out.replace(/\u222b\s*_\s*\{?([^{}\s^]+)\}?\s*\^\s*\{?([^{}\s]+)\}?/, '@DEF[$1|$2]');
      if (!/@DEF/.test(out)) break;
    }
    // 裸 ∫
    out = out.replace(/\u222b/g, '@IND');

    // @DEF[a|b] f d x
    guard = 0;
    while (out.indexOf('@DEF[') >= 0 && guard++ < 30) {
      var st = out.indexOf('@DEF[');
      var en = out.indexOf(']', st);
      if (en < 0) break;
      var parts = out.slice(st + 5, en).split('|');
      var before = out.slice(0, st);
      var after = out.slice(en + 1);
      var m = after.match(/d\s*([a-zA-Z])\b/);
      if (!m) {
        out = before + 'defint((' + after.trim() + '),x,' + parts[0] + ',' + parts[1] + ')';
        continue;
      }
      var body = after.slice(0, m.index).trim();
      var tail = after.slice(m.index + m[0].length);
      out = before + 'defint((' + body + '),' + m[1] + ',' + parts[0] + ',' + parts[1] + ')' + tail;
    }

    // @RANGE[a|b]：把前面的表达式变成定积分（口语「从 a 到 b」）
    guard = 0;
    while (out.indexOf('@RANGE[') >= 0 && guard++ < 30) {
      var rs = out.indexOf('@RANGE[');
      var re = out.indexOf(']', rs);
      if (re < 0) break;
      var rp = out.slice(rs + 7, re).split('|');
      var rbef = out.slice(0, rs).trim();
      var raft = out.slice(re + 1).trim();
      // 若后面还有 d x，用它；否则默认 x
      var rv = 'x';
      var md = raft.match(/d\s*([a-zA-Z])\b/);
      if (md) { rv = md[1]; raft = (raft.slice(0, md.index) + raft.slice(md.index + md[0].length)).trim(); }
      var rexpr = (rbef + ' ' + raft).trim() || 'x';
      out = 'defint((' + rexpr + '),' + rv + ',' + rp[0] + ',' + rp[1] + ')';
    }

    // @IND f d x（不定）
    guard = 0;
    while (out.indexOf('@IND') >= 0 && guard++ < 30) {
      var i2 = out.indexOf('@IND');
      var b2 = out.slice(0, i2);
      var a2 = out.slice(i2 + 4);
      var m2 = a2.match(/d\s*([a-zA-Z])\b/);
      if (!m2) { out = b2 + 'integrate((' + a2.trim() + '),x)'; continue; }
      var e2 = a2.slice(0, m2.index).trim();
      var r2 = a2.slice(m2.index + m2[0].length);
      out = b2 + 'integrate((' + e2 + '),' + m2[1] + ')' + r2;
    }
    return out;
  }

  function fixLimit(s) {
    var out = String(s).replace(/_limit\(/g, 'limit(');
    var guard = 0;
    while (out.indexOf('@LIM[') >= 0 && guard++ < 30) {
      var st = out.indexOf('@LIM[');
      var en = out.indexOf(']', st);
      if (en < 0) break;
      var cond = out.slice(st + 5, en);        // 形如 x->0 或 x\to 0
      var before = out.slice(0, st);
      var after = out.slice(en + 1).trim();
      var mm = cond.match(/([a-zA-Z])\s*(?:->|\\to|\u2192)\s*(.+)/);
      if (!mm) { out = before + after; continue; }
      out = before + 'limit((' + after + '),' + mm[1] + ',' + mm[2].trim() + ')';
    }
    // @RANGE[a|b]  →  若前面已有被积表达式则构成 defint
    // 注意：此处在 fixIntegral 之后调用，表达式已成形，这里只做兜底
    // 裸 lim_{x->0} / lim x->0（无反斜杠写法）
    guard = 0;
    while (/\blim\s*_/.test(out) && guard++ < 30) {
      var ls = out.search(/\blim\s*_/);
      var head = out.slice(0, ls);
      var tail = out.slice(ls + 3).replace(/^\s*_\s*/, ' ');   // 去掉 lim 和可能的下划线
      // 取下限 { ... } 或单个 token
      var cond2 = '';
      var t2 = tail.trim();
      if (t2.charAt(0) === '{') {
        var dep = 0, k2 = 0, e2 = -1;
        for (; k2 < t2.length; k2++) {
          if (t2.charAt(k2) === '{') dep++;
          else if (t2.charAt(k2) === '}') { dep--; if (dep === 0) { e2 = k2; break; } }
        }
        if (e2 > 0) { cond2 = t2.slice(1, e2); t2 = t2.slice(e2 + 1).trim(); }
        else { out = head + 'limit(' + t2 + ')'; break; }
      } else {
        var mm2 = t2.match(/^\s*([a-zA-Z]\s*(?:->|\u2192)\s*[^\s]+)/);
        if (mm2) { cond2 = mm2[1]; t2 = t2.slice(mm2[1].length).trim(); }
        else { out = head + t2; break; }
      }
      var cv = cond2.replace(/\u2192/g, '->').match(/([a-zA-Z])\s*->\s*(.+)/);
      if (!cv) { out = head + t2; break; }
      out = head + 'limit((' + t2 + '),' + cv[1] + ',' + cv[2].trim() + ')';
    }

    // 口语：x->0 sin(x)/x   或   x→0 sin(x)/x
    out = out.replace(/([a-zA-Z])\s*->\s*([^\s,]+)\s+(.+)/, function (m, v, a, rest) {
      return 'limit((' + rest + '),' + v + ',' + a + ')';
    });
    return out;
  }

  function fixDerivative(s) {
    var out = s, guard = 0;
    out = out.replace(/@DV\[([a-zA-Z])\]/g, '@DVS[$1]');
    while (out.indexOf('@DVS[') >= 0 && guard++ < 30) {
      var st = out.indexOf('@DVS[');
      var en = out.indexOf(']', st);
      var v = out.slice(st + 5, en);
      var before = out.slice(0, st);
      var after = out.slice(en + 1).trim();
      out = before + 'diff((' + after + '),' + v + ')';
    }
    // d/dx x^3
    out = out.replace(/d\s*\/\s*d\s*([a-zA-Z])\s+(.+)/, function (m, v, rest) {
      return 'diff((' + rest + '),' + v + ')';
    });
    return out;
  }

  /* 关键：隐式乘法，但不能碰函数名 */
  var FNS = ['sqrt', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'abs',
    'diff', 'integrate', 'limit', 'defint', 'solve', 'simplify',
    'factor', 'expand', 'sum', 'product', 'max', 'min', 'mod', 'gcd', 'lcm'];

  function isFnAt(str, endIdx) {
    // str[endIdx] 是 '('，检查前面是否是函数名
    for (var i = 0; i < FNS.length; i++) {
      var f = FNS[i];
      if (endIdx >= f.length && str.slice(endIdx - f.length, endIdx).toLowerCase() === f) {
        // 前面不能再是字母
        var prev = str.charAt(endIdx - f.length - 1);
        if (!/[a-zA-Z]/.test(prev || '')) return true;
      }
    }
    return false;
  }

  function fixImplicitMul(s) {
    var out = s, i, ch, res = '';

    for (i = 0; i < out.length; i++) {
      ch = out.charAt(i);
      var prev = res.charAt(res.length - 1);

      // 数字 / 右括号 / 变量 后面紧跟 字母 或 '('
      if (prev && (/[0-9)]/.test(prev) || (/[a-zA-Z]/.test(prev) && !/[a-zA-Z]/.test(ch)))) {
        if (/[a-zA-Z(]/.test(ch)) {
          // ) ( 之间要乘；( 前面是函数名则不乘
          if (ch === '(' && isFnAt(res, res.length)) { res += ch; continue; }
          // 数字后接 e（科学计数）不动
          if (prev === 'e' && /[0-9]/.test(ch)) { res += ch; continue; }
          res += '*' + ch;
          continue;
        }
      }
      // ) 后面跟 数字
      if (prev === ')' && /[0-9]/.test(ch)) { res += '*' + ch; continue; }
      // 变量后跟数字 如 x2 → x*2（少见，跳过以免误伤）
      res += ch;
    }
    return res;
  }

  function normalize(raw) {
    var s = String(raw == null ? '' : raw);
    if (!s.trim()) return '';
    s = s.replace(/\r?\n/g, ' ');
    s = fixSupSub(s);
    s = fixLatex(s);
    s = fixUnicode(s);
    s = stripChinese(s);     // 先剥中文，产 @DV/@RANGE/@LIM 标记
    s = fixSqrt(s);
    s = fixIntegral(s);      // 处理 @DEF / @IND / @RANGE
    s = fixLimit(s);         // 处理 @LIM / 裸 lim
    s = fixDerivative(s);    // 处理 @DV / d-dx
    s = s.replace(/\s+/g, ' ').trim();
    s = fixImplicitMul(s);
    s = s.replace(/\s+/g, '');
    // 收尾：多余运算符
    s = s.replace(/\*+/g, '*').replace(/(^|[+\-*/(])\*/g, '$1');
    s = s.replace(/(^|[^a-zA-Z0-9_])_+(limit|diff|integrate|defint|solve|sum|product)\(/g, '$1$2(');
    s = s.replace(/[+\-*/]+$/, '');
    return s;
  }

  /* ============ 2. 意图识别 ============ */

  function detectIntent(raw, norm) {
    var r = String(raw || '');
    var n = String(norm || '');

    // 不定积分优先（「不定积分」包含「定积分」子串，必须先判）
    if (/不定积分/.test(r)) return 'integrate';
    // 有上下限 → 定积分
    if (/@DEF\[/.test(n) || /defint\(/.test(n)) return 'defint';
    if (/定积分/.test(r)) return 'defint';
    if (/@IND/.test(n) || /integrate\(/.test(n) || /\u222b/.test(r) || /积分/.test(r)) return 'integrate';
    if (/@LIM\[/.test(n) || /limit\(/.test(n) || /\\lim/.test(r) || /极限/.test(r)) return 'limit';
    if (/@DVS\[/.test(n) || /diff\(/.test(n) || /\\frac\s*\{\s*d\s*\}/.test(r) || /求导|导数|微分/.test(r)) return 'diff';
    if (/solve\(/.test(n)) return 'solve';
    if (/解方程|解不等式/.test(r)) return 'solve';
    if (/因式分解|分解因式/.test(r)) return 'factor';
    if (/展开/.test(r)) return 'expand';
    if (/化简|简化/.test(r)) return 'simplify';
    // 含单个等号且是方程形式
    if (/^[^=]+=[^=]+$/.test(n)) return 'solve';
    return 'compute';
  }

  /* ============ 3. 求解 ============ */

  function tex(expr) {
    try { var t = expr.toTeX(); return t || ''; } catch (e) { return ''; }
  }

  function prettyNum(v) {
    if (v == null || !isFinite(v)) return String(v);
    if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
    return String(Number(Number(v).toPrecision(10)));
  }

  function fracOut(expr) {
    // 优先给分数/根式精确形式
    try {
      var s = expr.toString();
      return s;
    } catch (e) { return ''; }
  }

  function solve(raw) {
    var norm = normalize(raw);
    var intent = detectIntent(raw, norm);
    var t0 = (global.performance && performance.now) ? performance.now() : Date.now();
    var res = {
      ok: false, input: String(raw || ''), normalized: norm, intent: intent,
      kind: '', kind_label: '',
      answer: { latex: '', text: '', numeric: null },
      method: null, steps: [], warnings: [], error: '',
      mode: 'computed', elapsed_ms: 0, engine: 'browser'
    };
    if (!N && global.nerdamer) N = global.nerdamer;
    if (!MJ && global.math) MJ = global.math;

    function done() {
      var t1 = (global.performance && performance.now) ? performance.now() : Date.now();
      res.elapsed_ms = Math.round(t1 - t0);
      res.mode = res.ok ? 'computed' : 'hint';
      if (!res.ok && !res.kind_label) res.kind_label = '未能识别';
      return res;
    }

    try {
      if (!norm) { res.error = '没有识别到算式，请检查输入'; return done(); }

      var nrd = N;

      /* ---- 纯数值：mathjs 先算（加减小数更友好） ---- */
      var onlyNum = /^[-+*/().,\d\s!^%]+$/.test(norm);
      // 含除法或阶乘的纯算术：优先 nerdamer（给精确分数 11/12 而不是 0.9166）
      var preferExact = /[\/!]/.test(norm) && onlyNum;
      if (intent === 'compute' && onlyNum && !preferExact && MJ) {
        try {
          var val = MJ.evaluate(norm);
          var num = Number(val);
          if (isFinite(num)) {
            res.ok = true;
            res.kind = '数值计算'; res.kind_label = '数值计算';
            res.answer.numeric = num;
            res.answer.text = prettyNum(num);
            res.answer.latex = prettyNum(num);
            res.method = { name: '四则运算', note: '按运算优先级直接计算' };
            res.steps = [
              { n: 1, before: '', action: '识别算式', after: [], note: norm },
              { n: 2, before: '', action: '按优先级计算', after: [], note: prettyNum(num) }
            ];
            return done();
          }
        } catch (e) { /* fallthrough */ }
      }

      if (!nrd) {
        // 没符号内核时，至少数值能算
        if (MJ) {
          try {
            var v2 = Number(MJ.evaluate(norm.replace(/\^/g, '^')));
            if (isFinite(v2)) {
              res.ok = true; res.kind = '数值计算'; res.kind_label = '数值计算';
              res.answer.text = prettyNum(v2); res.answer.latex = prettyNum(v2);
              res.answer.numeric = v2;
              res.method = { name: '数值求值', note: '' };
              res.steps = [{ n: 1, before: '', action: '数值求值', after: [], note: prettyNum(v2) }];
              return done();
            }
          } catch (e) {}
        }
        res.error = '计算内核未加载';
        return done();
      }

      var expr = norm;

      /* ---- 定积分 ---- */
      if (intent === 'defint') {
        var mDef = expr.match(/defint\(\s*\(?([\s\S]*?)\)?\s*,\s*([a-zA-Z])\s*,\s*([^,]+?)\s*,\s*([^,)]+?)\s*\)$/);
        if (!mDef) {
          res.error = '定积分格式没认出来。可以这样写：∫_0^1 x^2 dx 或 求 ∫_0^1 x^2 dx';
          return done();
        }
        var body = mDef[1].trim();
        var dvar = mDef[2];
        var lo = mDef[3].trim();
        var hi = mDef[4].trim();

        // 1) 求原函数 F(x)
        var F = null, Ftex = '';
        try {
          var rF = nrd('integrate((' + body + '),' + dvar + ')');
          F = rF.toString();
          Ftex = tex(rF) || F;
        } catch (e) {
          res.error = '这个被积函数暂时求不出原函数（' + (e && e.message ? e.message : '') + '）';
          return done();
        }
        if (/integrate/i.test(F)) {
          res.error = '这个被积函数超出了当前引擎的积分能力，暂时算不出精确原函数。';
          return done();
        }

        // 2) 代入上下限 F(hi) - F(lo)
        var exact = '', texOut = '';
        try {
          var Fhi = nrd(F, (function () { var o = {}; o[dvar] = '(' + hi + ')'; return o; })()).toString();
          var Flo = nrd(F, (function () { var o = {}; o[dvar] = '(' + lo + ')'; return o; })()).toString();
          exact = nrd('simplify((' + Fhi + ')-(' + Flo + '))').toString();
          try { texOut = tex(nrd('simplify((' + Fhi + ')-(' + Flo + '))')); } catch (e2) {}
        } catch (e) {
          exact = '';
        }
        if (!exact) {
          // 退回数值
          try { exact = nrd(expr).evaluate().toString(); } catch (e) { exact = ''; }
        }

        // 3) 数值
        var num = NaN;
        try { num = Number(nrd(exact).evaluate().toString()); } catch (e) {
          try { num = Number(nrd(expr).evaluate().toString()); } catch (e2) {}
        }

        // 4) 分数美化
        var txt = exact;
        if (exact && /^[-+]?\d+(\.\d+)?$/.test(exact)) {
          var fv = Number(exact);
          if (isFinite(fv) && Math.abs(fv - Math.round(fv)) > 1e-12) {
            for (var dq = 2; dq <= 200; dq++) {
              var pq = fv * dq;
              if (Math.abs(pq - Math.round(pq)) < 1e-9) {
                txt = Math.round(pq) + '/' + dq;
                texOut = '\\frac{' + Math.round(pq) + '}{' + dq + '}';
                break;
              }
            }
          }
        }
        if (isFinite(num) && String(num) !== txt && Math.abs(num - Math.round(num)) > 1e-12) {
          txt = txt + ' ≈ ' + prettyNum(num);
        }

        res.ok = true;
        res.kind = '定积分'; res.kind_label = '定积分';
        res.answer.latex = texOut || exact;
        res.answer.text = txt;
        if (isFinite(num)) res.answer.numeric = num;
        res.method = { name: '牛顿–莱布尼茨公式', note: '原函数 F(x) = ' + F + '，再算 F(' + hi + ') − F(' + lo + ')' };
        res.steps = [
          { n: 1, before: '', action: '识别为定积分（有上下限）', after: [], note: '∫ from ' + lo + ' to ' + hi + ' of ' + body + ' d' + dvar },
          { n: 2, before: '', action: '求原函数 F(' + dvar + ')', after: [], note: F + ' + C' },
          { n: 3, before: '', action: '代入上上限作差 F(' + hi + ') − F(' + lo + ')', after: [], note: exact }
        ];
        return done();
      }

      /* ---- 不定积分 ---- */
      if (intent === 'integrate') {
        if (!/integrate\(/.test(expr)) {
          var mI = expr.match(/^([^d]*?)d\s*([a-zA-Z])$/);
          expr = mI ? 'integrate((' + mI[1] + '),' + mI[2] + ')' : 'integrate((' + expr + '),x)';
        }
        var rB = nrd(expr);
        var outB = rB.toString();
        res.ok = true;
        res.kind = '不定积分'; res.kind_label = '不定积分';
        res.answer.latex = tex(rB) || outB;
        res.answer.text = outB + ' + C';
        res.method = { name: '基本积分公式 / 换元 / 分部', note: '求原函数族，别忘了 +C' };
        res.steps = [
          { n: 1, before: '', action: '识别为不定积分', after: [], note: expr },
          { n: 2, before: '', action: '套基本积分公式求原函数', after: [], note: outB },
          { n: 3, before: '', action: '补积分常数 C', after: [], note: outB + ' + C' }
        ];
        return done();
      }

      /* ---- 极限 ---- */
      if (intent === 'limit') {
        if (!/limit\(/.test(expr)) {
          res.error = '极限格式没认出来。可以这样写：lim_{x→0} sin(x)/x 或 求极限 x→0 sin(x)/x';
          return done();
        }
        var rC = nrd(expr);
        var outC = rC.toString();
        res.ok = true;
        res.kind = '极限'; res.kind_label = '极限';
        res.answer.latex = tex(rC) || outC;
        res.answer.text = outC;
        try { var nC = Number(outC); if (isFinite(nC)) res.answer.numeric = nC; } catch (e) {}
        res.method = { name: '直接代入 / 等价无穷小 / 洛必达', note: '先代入；0/0 或 ∞/∞ 再考虑洛必达（需满足条件）' };
        res.steps = [
          { n: 1, before: '', action: '识别为极限', after: [], note: expr },
          { n: 2, before: '', action: '判断类型（0/0、∞/∞、∞−∞ 等）', after: [], note: '' },
          { n: 3, before: '', action: '化简后取极限', after: [], note: outC }
        ];
        return done();
      }

      /* ---- 导数 ---- */
      if (intent === 'diff') {
        if (!/diff\(/.test(expr)) {
          var mD = expr.match(/^([^d]*?)d\s*([a-zA-Z])$/);
          expr = mD ? 'diff((' + mD[1] + '),' + mD[2] + ')' : 'diff((' + expr + '),x)';
        }
        var rD = nrd(expr);
        var outD = rD.toString();
        res.ok = true;
        res.kind = '导数'; res.kind_label = '导数';
        res.answer.latex = tex(rD) || outD;
        res.answer.text = outD;
        res.method = { name: '求导法则', note: '幂法则 / 乘积法则 / 商法则 / 链式法则' };
        res.steps = [
          { n: 1, before: '', action: '识别为求导', after: [], note: expr },
          { n: 2, before: '', action: '逐项套用求导法则', after: [], note: outD }
        ];
        return done();
      }

      /* ---- 解方程 ---- */
      if (intent === 'solve') {
        var eq = norm;
        if (!/solve\(/.test(eq)) {
          if (eq.indexOf('=') >= 0) {
            var mm = eq.match(/^([^=]+)=([^=]+)$/);
            eq = mm ? 'solve(' + mm[1] + '=(' + mm[2] + '),x)' : 'solve(' + eq + ',x)';
          } else {
            eq = 'solve(' + eq + '=0,x)';
          }
        }
        var rE = nrd(eq);
        var outE = rE.toString().replace(/^\{|\}$/g, '').trim();
        var vars = (norm.match(/[a-zA-Z]/g) || []);
        var v0 = 'x';
        var uniq = {};
        for (var vi = 0; vi < vars.length; vi++) uniq[vars[vi]] = 1;
        var keys = Object.keys(uniq).filter(function (k) { return !/^(pi|e)$/.test(k); });
        if (keys.length === 1) v0 = keys[0];
        res.ok = true;
        res.kind = '解方程'; res.kind_label = '解方程';
        res.answer.text = v0 + ' = ' + outE;
        res.answer.latex = v0 + '=' + outE.split(',').map(function (s) { return s.trim(); }).join(',\\;');
        try { var nE = Number(outE); if (isFinite(nE)) res.answer.numeric = nE; } catch (e) {}
        res.method = { name: '移项整理 / 因式分解 / 求根公式', note: '化标准形式后求解' };
        res.steps = [
          { n: 1, before: '', action: '识别为方程', after: [], note: eq },
          { n: 2, before: '', action: '移项整理成标准形式', after: [], note: '' },
          { n: 3, before: '', action: '求解', after: [], note: v0 + ' = ' + outE }
        ];
        return done();
      }

      /* ---- 因式分解 / 展开 / 化简 ---- */
      if (intent === 'factor' || intent === 'expand' || intent === 'simplify') {
        var fn = intent;
        var rF = nrd(fn + '(' + norm + ')');
        var outF = rF.toString();
        var label = { factor: '因式分解', expand: '展开', simplify: '化简' }[fn];
        res.ok = true;
        res.kind = label; res.kind_label = label;
        res.answer.latex = tex(rF) || outF;
        res.answer.text = outF;
        res.method = { name: label, note: '' };
        res.steps = [
          { n: 1, before: '', action: '识别为' + label, after: [], note: norm },
          { n: 2, before: '', action: '执行' + label, after: [], note: outF }
        ];
        return done();
      }

      /* ---- 通用：nerdamer 化简求值 ---- */
      var rG = nrd(norm);
      var outG = rG.toString();
      var tG = tex(rG);
      res.ok = true;
      res.kind = /[a-zA-Z]/.test(norm) ? '代数计算' : '数值计算';
      res.kind_label = res.kind;
      res.answer.latex = tG || outG;
      res.answer.text = outG;
      try {
        var decG = rG.evaluate().toString();
        var nG = Number(decG);
        if (isFinite(nG) && prettyNum(nG) !== outG) {
          res.answer.numeric = nG;
          res.answer.text = outG + ' ≈ ' + prettyNum(nG);
          res.answer.latex = tG || outG;
        } else if (isFinite(nG)) {
          res.answer.numeric = nG;
        }
      } catch (e) {}
      res.method = { name: '化简求值', note: '按运算规则化简' };
      res.steps = [
        { n: 1, before: '', action: '识别表达式', after: [], note: norm },
        { n: 2, before: '', action: '化简求值', after: [], note: outG }
      ];
      return done();

    } catch (e) {
      // 兜底：mathjs 数值
      if (MJ) {
        try {
          var fb = Number(MJ.evaluate(norm));
          if (isFinite(fb)) {
            res.ok = true;
            res.kind = '数值计算'; res.kind_label = '数值计算';
            res.answer.numeric = fb;
            res.answer.text = prettyNum(fb);
            res.answer.latex = prettyNum(fb);
            res.method = { name: '数值求值（回退）', note: '' };
            res.steps = [{ n: 1, before: '', action: '数值求值', after: [], note: prettyNum(fb) }];
            res.error = '';
            return done();
          }
        } catch (e2) {}
      }
      res.error = (e && e.message) ? e.message : String(e);
      return done();
    }
  }

  global.MathCore = {
    solve: solve,
    normalize: normalize,
    version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);


