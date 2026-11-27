/* ============================================================
   整题解析器 MathProblem v1.2
   - 小问标号只在「前面不是字母」时才算标号（避免 sin(x) 被切成一块）
   - 支持「已知 f(x)=… 求 f'(x)」这类先定义后求导的题
   ============================================================ */
(function (global) {
  'use strict';

  function cleanText(raw) {
    var t = String(raw || '');
    t = t.replace(/\$\$?/g, ' ');
    t = t.replace(/\\text\{([^}]*)\}/g, '$1');
    t = t.replace(/\\(?:qquad|quad|,|;|:|!)/g, ' ');
    t = t.replace(/\\(?:left|right|displaystyle|limits)/g, ' ');
    t = t.replace(/\\[dt]?frac/g, ' ');
    t = t.replace(/\\[()[\]]/g, ' ');
    t = t.replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ');
    t = t.replace(/\\[a-zA-Z]+/g, ' ');
    t = t.replace(/[（]/g, '(').replace(/[）]/g, ')')
         .replace(/[，]/g, ',').replace(/[。]/g, '.')
         .replace(/[；]/g, ';').replace(/[：]/g, ':')
         .replace(/[［]/g, '[').replace(/[］]/g, ']');
    t = t.replace(/[ \t\u00a0]+/g, ' ');
    // 「计算：xxx」「求：xxx」→ 去掉冒号，保持句子完整
    t = t.replace(/(计算|求|解|化简|展开|因式分解)\s*[:：]\s*/g, '$1 ');
    return t;
  }

  /* ---------- 简单应用题识别 ---------- */
  function solveWordProblem(t) {
    // 长方形/矩形面积：长 a，宽 b
    var m1 = t.match(/(?:长|长度)\s*(?:是|为|等于)?\s*(-?\d+(?:\.\d+)?)[\s\S]{0,20}?(?:宽|宽度)\s*(?:是|为|等于)?\s*(-?\d+(?:\.\d+)?)/);
    if (m1 && /面积/.test(t)) {
      var a = Number(m1[1]), b = Number(m1[2]);
      return { input: a + '*' + b, note: '长方形面积 = 长 × 宽 = ' + a + ' × ' + b };
    }
    if (m1 && /周长/.test(t)) {
      var a2 = Number(m1[1]), b2 = Number(m1[2]);
      return { input: '2*(' + a2 + '+' + b2 + ')', note: '长方形周长 = 2×(长+宽) = 2×(' + a2 + '+' + b2 + ')' };
    }
    // 正方形
    var m2 = t.match(/(?:正方形|边长)[\s\S]{0,12}?(?:边长|是|为)?\s*(-?\d+(?:\.\d+)?)/);
    if (m2 && /正方/.test(t)) {
      var e = Number(m2[1]);
      if (/面积/.test(t)) return { input: e + '^2', note: '正方形面积 = 边长² = ' + e + '²' };
      if (/周长/.test(t)) return { input: '4*' + e, note: '正方形周长 = 4×边长' };
    }
    // 圆
    var m3 = t.match(/(?:半径|r)\s*(?:是|为|等于)?\s*(-?\d+(?:\.\d+)?)/);
    if (m3 && /圆/.test(t)) {
      var r = Number(m3[1]);
      if (/面积/.test(t)) return { input: 'pi*' + r + '^2', note: '圆面积 = πr²' };
      if (/周长/.test(t)) return { input: '2*pi*' + r, note: '圆周长 = 2πr' };
    }
    // 三角形面积：底 a，高 h
    var m4 = t.match(/(?:底|底边)\s*(?:是|为|等于)?\s*(-?\d+(?:\.\d+)?)[\s\S]{0,20}?(?:高)\s*(?:是|为|等于)?\s*(-?\d+(?:\.\d+)?)/);
    if (m4 && /面积/.test(t)) {
      var b3 = Number(m4[1]), h3 = Number(m4[2]);
      return { input: '(' + b3 + '*' + h3 + ')/2', note: '三角形面积 = 底×高÷2' };
    }
    return null;
  }

  /* ---------- 小问切分（手动扫描，避免误切 sin(x)） ---------- */
  var MARK_CHARS = '①②③④⑤⑥⑦⑧⑨⑩';
  var ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ';
  var CN_NUM = '一二三四五六七八九十';

  function isAlphaNum(ch) { return /[a-zA-Z0-9]/.test(ch || ''); }

  function findMarks(t) {
    var marks = [];
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      var prev = i > 0 ? t.charAt(i - 1) : '';
      var okBefore = !isAlphaNum(prev);

      // ① ② ③ …
      if (MARK_CHARS.indexOf(ch) >= 0 && okBefore) {
        marks.push({ index: i, len: 1, label: ch });
        continue;
      }
      // Ⅰ Ⅱ Ⅲ …
      if (ROMAN.indexOf(ch) >= 0 && okBefore) {
        marks.push({ index: i, len: 1, label: ch });
        continue;
      }
      // 第X问
      if (ch === '第' && CN_NUM.indexOf(t.charAt(i + 1)) >= 0 && t.charAt(i + 2) === '问') {
        marks.push({ index: i, len: 3, label: t.charAt(i + 1) });
        continue;
      }
      // (1) / (12) —— 前面必须是 空白、标点、行首，且不能紧跟字母（避开 sin(x)）
      if (ch === '(' && okBefore) {
        var j = i + 1, digits = '';
        while (j < t.length && /[0-9]/.test(t.charAt(j)) && digits.length < 2) {
          digits += t.charAt(j); j++;
        }
        if (digits && t.charAt(j) === ')') {
          marks.push({ index: i, len: j - i + 1, label: digits });
          i = j;
          continue;
        }
        // (a) / (A) 单个字母
        if (/[a-zA-Z]/.test(t.charAt(i + 1)) && t.charAt(i + 2) === ')') {
          var nxt = t.charAt(i + 3);
          // 后面要跟空白或中文，才认为是标号
          if (nxt === '' || /[\s\u4e00-\u9fa5]/.test(nxt)) {
            marks.push({ index: i, len: 4, label: t.charAt(i + 1) });
            i = i + 3;
            continue;
          }
        }
      }
    }
    return marks;
  }

  function splitBlocks(text) {
    var t = text;
    var marks = findMarks(t);
    if (!marks.length) return [{ label: '', text: t.trim(), stem: '' }];

    var blocks = [];
    var head = t.slice(0, marks[0].index).trim();

    for (var i = 0; i < marks.length; i++) {
      var start = marks[i].index + marks[i].len;
      var end = (i + 1 < marks.length) ? marks[i + 1].index : t.length;
      var body = t.slice(start, end).trim()
        .replace(/^[\s,;:、.:]+|[\s,;:、]+$/g, '');
      if (!body) continue;
      blocks.push({ label: marks[i].label, text: body, stem: head, headAsk: head });
    }
    if (!blocks.length) return [{ label: '', text: t.trim(), stem: head }];
    return blocks;
  }

  /* ---------- 要求类型 ---------- */
  var ASKS = [
    { re: /求\s*积分|不定积分|定积分|积分/, type: '积分' },
    { re: /求\s*极限|极限/, type: '极限' },
    { re: /求\s*导|导数|微分|f'|f′|f′\(/, type: '求导' },
    { re: /因式分解|分解因式/, type: '因式分解' },
    { re: /展开/, type: '展开' },
    { re: /化简|简化/, type: '化简' },
    { re: /解方程|解不等式|求解/, type: '解方程' },
    { re: /计算|求值|算出/, type: '计算' },
    { re: /证明/, type: '证明' },
    { re: /判断|讨论|是否/, type: '判断' }
  ];

  function detectAsk(t) {
    for (var i = 0; i < ASKS.length; i++) {
      if (ASKS[i].re.test(t)) return ASKS[i].type;
    }
    return '';
  }

  /* ---------- 「已知 f(x)=… 求 f'(x)」 ---------- */
  function handleFuncDef(text) {
    // 找 f(x)= ...
    var m = text.match(/([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)\s*=\s*([^,;.。，]+)/);
    if (!m) return null;
    var fname = m[1], arg = m[2], body = m[3].trim();
    var wantsDeriv = new RegExp(fname + "\\s*['′]").test(text) || /求\s*导|导数|微分/.test(text);
    var wantsValue = new RegExp(fname + '\\s*\\(\\s*\\d').test(text);
    if (wantsDeriv && body) {
      return { input: body + ' 求导', note: '对 ' + fname + '(' + arg + ') 求导' };
    }
    return null;
  }

  /* ---------- 生成候选目标 ---------- */
  // 一句话里可能有多个「求…」请求，用这些词再切
  var REQ_SPLIT = /(?:再求|并求|又求|另求|以及求|另外求|同时求|还要求|然后求)/;

  function splitRequests(t) {
    // 先按句号/分号切句
    var sentences = t.split(/[.;；。]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var out = [];
    sentences.forEach(function (sen) {
      var parts = sen.split(REQ_SPLIT).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length > 1) {
        parts.forEach(function (pt, i) {
          out.push(i === 0 ? pt : ('求 ' + pt));
        });
      } else {
        out.push(sen);
      }
    });
    return out.filter(Boolean);
  }

  function buildTargets(blockText, ask, headAsk) {
    var t = blockText.trim();

    // 小问自身无要求词 → 从题干头部继承（如「求下列函数的导数：」）
    if (headAsk && !detectAsk(t)) {
      var ha = detectAsk(headAsk);
      var hasIntegral = /∫|integrate/.test(t);
      var hasLim = /lim|limit|→|->/.test(t);
      var hasEq = /=/.test(t);

      if (ha === '求导') {
        // y=x^3 → 取等号右边的 x^3
        var me = t.match(/^\s*[a-zA-Z]\s*=\s*([\s\S]+)$/);
        var exprD = me ? me[1] : t;
        t = exprD + ' 求导';
      } else if (ha === '积分') {
        if (!hasIntegral) {
          // 「求下列积分：x^2 dx」这种描述式
          t = '∫ ' + t.replace(/\s*d\s*[a-zA-Z]\s*$/, '') + ' dx';
        }
        // 已有 ∫ 的，保持原样（不要重复加 dx）
      } else if (ha === '极限') {
        if (!hasLim) t = '求极限 ' + t;
      } else if (ha === '解方程') {
        if (!hasEq) t = t + '=0';
        t = '解方程 ' + t;
      }
    }

    // 一句话里有多个请求 → 逐个处理
    var reqs = splitRequests(t);
    if (reqs.length > 1) {
      var outs = [];
      reqs.forEach(function (r) {
        // 每个请求内部仍可能套函数定义
        var fd = handleFuncDef(r);
        outs.push(fd ? fd.input : r);
      });
      return outs;
    }

    // 单请求：先试函数定义题
    var fd1 = handleFuncDef(t);
    if (fd1) return [fd1.input];

    return [t];
  }

  function extractConditions(stem) {
    var out = [];
    if (!stem) return out;
    var re = /([a-zA-Z]\s*\(\s*[a-zA-Z]\s*\)\s*=\s*[^,;.。]+)/g;
    var m;
    while ((m = re.exec(stem)) !== null) {
      var s = m[1].trim();
      if (out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }

  function parse(raw) {
    var cleaned = cleanText(raw);
    var blocks = splitBlocks(cleaned);
    var core = global.MathCore;
    var result = {
      ok: false, source: String(raw || ''), cleaned: cleaned,
      blocks: [], conditions: [],
      summary: { total: 0, solved: 0, failed: 0 },
      version: '1.2.0'
    };
    if (!core) { result.error = '计算引擎未加载'; return result; }

    if (blocks[0] && blocks[0].stem) {
      result.conditions = extractConditions(blocks[0].stem);
      // 题干里的函数定义，供「求 f'(x)」使用
      result.stemText = blocks[0].stem;
    }

    blocks.forEach(function (b, idx) {
      var full = (b.stem ? b.stem + ' ' : '') + b.text;
      var ask = detectAsk(b.text) || detectAsk(full);
      var wordSol = solveWordProblem(b.text + ' ' + (b.stem || ''));
      var targets;
      if (wordSol) {
        targets = [wordSol.input];
        b.solNote = wordSol.note;
      } else {
        targets = buildTargets(b.text, ask, b.headAsk || b.stem || '');
      }

      var results = targets.map(function (t) {
        var r;
        try { r = core.solve(t); }
        catch (e) { r = { ok: false, error: e && e.message ? e.message : '解析失败' }; }
        return {
          input: t,
          ok: !!(r && r.ok),
          kind: r && r.kind_label,
          answer: (r && r.answer) ? r.answer : {},
          steps: (r && r.steps) ? r.steps : [],
          method: (r && r.method) ? r.method : null,
          error: (r && !r.ok) ? (r.error || '') : ''
        };
      });

      var solved = results.filter(function (x) { return x.ok; }).length;
      result.blocks.push({
        no: idx + 1,
        label: b.label || (blocks.length > 1 ? String(idx + 1) : ''),
        ask: ask,
        stem: b.stem || '',
        text: b.text,
        results: results,
        solved: solved,
        total: results.length
      });
      result.summary.total += results.length;
      result.summary.solved += solved;
      result.summary.failed += (results.length - solved);
    });

    result.ok = result.summary.solved > 0;
    return result;
  }

  global.MathProblem = {
    parse: parse, clean: cleanText, split: splitBlocks, word: solveWordProblem, version: '1.3.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);

