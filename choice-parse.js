/* ============================================================
   选择题识别与求解 MathChoice
   思路：
   1) 把题干和 A/B/C/D 选项分开
   2) 从题干抽出「待求的东西」，算出结果
   3) 逐个选项比对（数值相等 / 表达式等价）
   4) 输出：正确选项 + 每个选项的判断依据
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 1. 拆分选项 ---------- */
  // 支持 A. A、 A) (A) A: Ａ． 等
  var OPT_RE = /(?:^|[\s,;:()（）])([A-Ha-h])\s*[.、:：)）]\s*/g;

  function splitOptions(text) {
    var t = String(text || '');
    var marks = [];
    var m;
    OPT_RE.lastIndex = 0;
    while ((m = OPT_RE.exec(t)) !== null) {
      var letter = m[1].toUpperCase();
      // 只接受按顺序的 A B C D…
      var expect = String.fromCharCode(65 + marks.length);
      if (letter !== expect) continue;
      // 选项后面不能紧跟字母（避免 "A. x" 里的 x 被当标号）
      marks.push({ index: m.index, letter: letter, len: m[0].length });
    }
    if (marks.length < 2) return null;

    var stem = t.slice(0, marks[0].index).trim();
    var opts = [];
    for (var i = 0; i < marks.length; i++) {
      var start = marks[i].index + marks[i].len;
      var end = (i + 1 < marks.length) ? marks[i + 1].index : t.length;
      var body = t.slice(start, end).trim().replace(/^[,;:、\s]+|[,;:、\s]+$/g, '');
      opts.push({ letter: marks[i].letter, text: body });
    }
    return { stem: stem, options: opts };
  }

  /* ---------- 2. 题干里找「要求」 ---------- */
  function stemTarget(stem, fullText) {
    var s = String(stem || '');
    var all = String(fullText || s);

    // (a) 函数定义 + 求某点导数值：已知 f(x)=x^2，求 f'(1)
    var mDef = s.match(/([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)\s*=\s*([^,;，。？?]+)/);
    var mPt = s.match(new RegExp('([a-zA-Z])\\s*[\'′]\\s*\\(\\s*([^)]+)\\s*\\)'));
    if (mDef && mPt && mPt[1] === mDef[1]) {
      var fname = mDef[1];
      var dvar = mDef[2];
      var body = mDef[3].trim();
      var at = mPt[2].trim();
      return { input: 'diff((' + body + '),' + dvar + ')', at: at, dvar: dvar, kind: '求导后代入' };
    }

    // (b) 只有 f'(x) 形式（无函数定义）：求 f'(x) 但无法求值 → 交给逐项验证
    if (/[\'′]\s*\(/.test(s)) {
      var mOnly = s.match(/([a-zA-Z])\s*[\'′]\s*\(\s*([^)]*)\s*\)/);
      if (mOnly) {
        var inner = mOnly[2].trim();
        // f'(1) 这种：返回求值提示
        return { input: '', at: '', dvar: 'x', kind: '需函数定义', hint: 'f' + "'(" + inner + ')' };
      }
    }

    // (c) 极限：lim x→0 sin(x)/x
    var mLim = s.match(/lim\s*_?\{?\s*([a-zA-Z])\s*(?:→|->|\\to)\s*([^}\s]+)\s*\}?\s*([\s\S]+)/);
    if (mLim) {
      var limBody = mLim[3].replace(/[=＝]\s*$/, '').trim();
      return { input: 'limit((' + limBody + '),' + mLim[1] + ',' + mLim[2].trim() + ')', kind: '极限' };
    }

    // (d) 积分
    var mInt = s.match(/(∫[^=？?]+|\\int[^=？?]+)/);
    if (mInt) {
      return { input: mInt[1].trim().replace(/[？?]|等于/g, ''), kind: '积分' };
    }

    // (e) 方程求根：2x+3=7，则 x=
    var mEq = s.match(/([a-zA-Z0-9()（）+\-*/^√. ]+=[a-zA-Z0-9()（）+\-*/^√. ]+)/);
    if (mEq && /则|那么|求|解/.test(s)) {
      return { input: mEq[1].trim(), kind: '解方程' };
    }

    // (f) 「求 X」「计算 X」
    var mAsk = s.match(/(?:求|计算|算出)\s*([^,;，。？?]+)/);
    if (mAsk) return { input: mAsk[0].replace(/[？?]/g, ''), kind: '' };

    // (g) 结尾是表达式（如「∫_0^1 x^2 dx =」）
    var tail = s.replace(/[？?=＝\s]+$/g, '').trim();
    if (tail && /[0-9a-zA-Z∫]/.test(tail)) {
      return { input: tail, kind: '' };
    }

    return { input: s, kind: '' };
  }

  /* ---------- 3. 数值比较 ---------- */
  function toNumber(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    // 分数 a/b
    var mf = s.match(/^([-+]?\d+)\s*\/\s*(\d+)$/);
    if (mf) return Number(mf[1]) / Number(mf[2]);
    // π 或含 pi
    if (/^[-+]?pi$/i.test(s)) return Math.PI;
    if (/^[-+]?\d*\.?\d*\s*\*?\s*pi$/i.test(s)) {
      var mm = s.match(/^([-+]?\d*\.?\d*)\s*\*?\s*pi$/i);
      var coef = mm[1] === '' || mm[1] === '-' ? (mm[1] === '-' ? -1 : 1) : Number(mm[1]);
      return coef * Math.PI;
    }
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function nearlyEqual(a, b) {
    if (!isFinite(a) || !isFinite(b)) return false;
    if (a === b) return true;
    var d = Math.abs(a - b);
    var scale = Math.max(1, Math.abs(a), Math.abs(b));
    return d / scale < 1e-6;
  }

  /* ---------- 4. 主流程 ---------- */
  function solve(text) {
    var core = global.MathCore;
    var parsed = splitOptions(text);
    if (!parsed) return null;
    if (!core) return { error: '计算引擎未加载' };

    var stem = parsed.stem;
    var opts = parsed.options;
    var target = stemTarget(stem, text);

    var result = {
      ok: false,
      stem: stem,
      options: opts.map(function (o) { return { letter: o.letter, text: o.text }; }),
      target: target.input,
      answer: '',
      answerText: '',
      kind: '',
      reason: [],
      error: ''
    };

    // 先算题干
    var r = null;
    if (target.input) {
      try { r = core.solve(target.input); } catch (e) { r = null; }
      // 求导后在指定点求值：f'(1)
      if (r && r.ok && target.at && target.dvar && global.nerdamer) {
        try {
          var deriv = String((r.answer && r.answer.text) || '').replace(/\s*$/, '');
          // 去掉可能的 "xxx" 包装，取纯表达式
          var exprOnly = deriv.split('≈')[0].trim();
          var sub = {};
          sub[target.dvar] = '(' + target.at + ')';
          var val = global.nerdamer(exprOnly, sub).toString();
          var num = Number(global.nerdamer(val).evaluate().toString());
          if (isFinite(num)) {
            r.answer.numeric = num;
            r.answer.text = exprOnly + ' 在 ' + target.dvar + '=' + target.at + ' 处 = ' + (String(Number(num.toPrecision(10)))) ;
            r.kind_label = '求导后代值';
          }
        } catch (e) {}
      }
    }

    // 题干算不出 → 尝试对每个选项求值/等价判断
    if (!r || !r.ok) {
      // 情况：题干问「下列哪个正确」，选项本身是命题
      result.reason.push('题干无法直接计算（' + (r ? r.error : '解析失败') + '），改为逐项验证');
      var best = null;
      opts.forEach(function (o) {
        var rr;
        try { rr = core.solve(o.text); } catch (e) { rr = null; }
        var ok = false;
        if (rr && rr.ok) {
          var t = String(rr.answer.text || '');
          // 选项是命题「lim...=1」：看是否恒成立
          if (/^true$/i.test(t) || nearlyEqual(toNumber(rr.answer.numeric), 1)) ok = true;
        }
        result.reason.push(o.letter + '. ' + o.text + ' → ' + (rr && rr.ok ? (rr.answer.text || '—') : '无法判断') + (ok ? '  ✓' : ''));
        if (ok && !best) best = o.letter;
      });
      if (best) {
        result.ok = true;
        result.answer = best;
        result.answerText = best;
        result.kind = '逐项验证';
      } else {
        result.error = '这道选择题暂时无法自动判断';
      }
      return result;
    }

    result.kind = r.kind_label || '计算';
    var targetVal = r.answer.numeric;
    var targetText = String(r.answer.text || '');
    var targetNum = (targetVal != null && isFinite(targetVal)) ? Number(targetVal) : toNumber(targetText);

    result.reason.push('题干：' + target.input + ' → ' + targetText);

    // 逐项比对
    var matched = null;
    var details = [];
    opts.forEach(function (o) {
      var onum = toNumber(o.text);
      var hit = false;
      if (isFinite(targetNum) && isFinite(onum)) {
        hit = nearlyEqual(targetNum, onum);
      }
      // 选项本身是表达式 → 化简后比
      if (!hit) {
        try {
          var rr = core.solve(o.text);
          if (rr && rr.ok) {
            var rn = rr.answer.numeric != null ? Number(rr.answer.numeric) : toNumber(rr.answer.text);
            if (isFinite(targetNum) && isFinite(rn) && nearlyEqual(targetNum, rn)) hit = true;
          }
        } catch (e) {}
      }
      details.push({ letter: o.letter, text: o.text, hit: hit });
      if (hit && !matched) matched = o.letter;
    });

    result.details = details;
    details.forEach(function (d) {
      result.reason.push(d.letter + '. ' + d.text + (d.hit ? '  ✓ 正确' : '  ✗ 不符（应为 ' + targetText + '）'));
    });

    if (matched) {
      result.ok = true;
      result.answer = matched;
      result.answerText = matched + '. ' + (opts.filter(function (o) { return o.letter === matched; })[0] || {}).text;
    } else {
      result.error = '算出的结果是 ' + targetText + '，但四个选项都不匹配（可能是 OCR 有误或题目本身有特殊处理）';
    }
    return result;
  }

  global.MathChoice = {
    solve: solve,
    split: splitOptions,
    isChoice: function (t) { return !!splitOptions(t); },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
