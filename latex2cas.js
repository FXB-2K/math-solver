/* ============================================================
   LaTeX → CAS 表达式转换器
   MathLive / 各类公式编辑器的输出都是 LaTeX，需要先转成引擎能算的形式
   覆盖：分数、根号、积分（含上下限）、极限、求和、三角函数、绝对值、
        上下标、\left\right、常用符号
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 工具：按花括号配对取值 ---------- */
  function readGroup(s, i) {
    // s[i] 应为 '{'，返回 { body, end }，end 指向 '}' 之后
    if (s.charAt(i) !== '{') return null;
    var depth = 0;
    for (var k = i; k < s.length; k++) {
      var c = s.charAt(k);
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return { body: s.slice(i + 1, k), end: k + 1 };
      }
    }
    return null;
  }

  // 读取一个「参数」：可以是 {..} 或单个字符/命令
  function readArg(s, i) {
    while (i < s.length && s.charAt(i) === ' ') i++;
    if (s.charAt(i) === '{') {
      var g = readGroup(s, i);
      if (g) return { body: g.body, end: g.end };
    }
    // 单个命令 \xxx
    if (s.charAt(i) === '\\') {
      var m = s.slice(i).match(/^\\[a-zA-Z]+/);
      if (m) return { body: m[0], end: i + m[0].length };
    }
    if (i < s.length) return { body: s.charAt(i), end: i + 1 };
    return { body: '', end: i };
  }

  /* ---------- 递归处理花括号内部 ---------- */
  function walk(s) {
    var out = '';
    var i = 0;
    while (i < s.length) {
      var c = s.charAt(i);

      /* ---- 分数 \frac{a}{b} / \dfrac / \tfrac ---- */
      var mFrac = s.slice(i).match(/^\\(?:d|t)?frac\s*/);
      if (mFrac) {
        var p = i + mFrac[0].length;
        var A = readArg(s, p);
        var B = readArg(s, A.end);
        out += '((' + walk(A.body) + ')/(' + walk(B.body) + '))';
        i = B.end;
        continue;
      }

      /* ---- 根号 \sqrt[n]{a} / \sqrt{a} ---- */
      var mSqrt = s.slice(i).match(/^\\sqrt\s*/);
      if (mSqrt) {
        var q = i + mSqrt[0].length;
        var n = null;
        if (s.charAt(q) === '[') {
          var cb = s.indexOf(']', q);
          if (cb > 0) { n = s.slice(q + 1, cb); q = cb + 1; }
        }
        var R = readArg(s, q);
        if (n) out += '((' + walk(R.body) + ')^(1/(' + walk(n) + ')))';
        else out += 'sqrt(' + walk(R.body) + ')';
        i = R.end;
        continue;
      }

      /* ---- 积分 \int_{a}^{b} body \,dx ---- */
      var mInt = s.slice(i).match(/^\\int\s*/);
      if (mInt) {
        var p2 = i + mInt[0].length;
        var lo = null, hi = null;
        // 读上下限：_{..}^{..} 或 ^{..}_{..} 或 _a^b
        for (var pass = 0; pass < 2; pass++) {
          while (s.charAt(p2) === ' ') p2++;
          if (s.charAt(p2) === '_') {
            var L = readArg(s, p2 + 1);
            lo = walk(L.body);
            p2 = L.end;
          } else if (s.charAt(p2) === '^') {
            var H = readArg(s, p2 + 1);
            hi = walk(H.body);
            p2 = H.end;
          } else break;
        }
        // 找 d<var> 结束位置
        var rest = s.slice(p2);
        var mDx = rest.match(/\\?,?\s*d\s*([a-zA-Z])\s*$/) ||
                  rest.match(/\\?,?\s*d\s*([a-zA-Z])/);
        var v = 'x', bodyText = rest;
        if (mDx) {
          v = mDx[1];
          bodyText = rest.slice(0, mDx.index);
        }
        var bodyC = walk(bodyText);
        if (lo !== null && hi !== null) {
          out += 'defint((' + bodyC + '),' + v + ',' + lo + ',' + hi + ')';
        } else {
          out += 'integrate((' + bodyC + '),' + v + ')';
        }
        i = p2 + bodyText.length + (mDx ? mDx[0].length : 0);
        continue;
      }

      /* ---- 极限 \lim_{x\to a} body ---- */
      var mLim = s.slice(i).match(/^\\lim\s*/);
      if (mLim) {
        var p3 = i + mLim[0].length;
        var cond = null;
        if (s.charAt(p3) === '_') {
          var G = readArg(s, p3 + 1);
          cond = G.body;
          p3 = G.end;
        }
        if (!cond) { out += 'lim('; i = p3; continue; }
        var cm = cond.replace(/\\to|\\rightarrow|\\rarr/g, '->').match(/([a-zA-Z])\s*->\s*(.+)/);
        var lv = cm ? cm[1] : 'x';
        var la = cm ? cm[2].trim() : '0';
        // 取到行尾或遇到 + - 顶层运算为止：简化处理，取剩余全部
        var limBody = walk(s.slice(p3));
        out += 'limit((' + limBody + '),' + lv + ',' + walk(la) + ')';
        i = s.length;
        continue;
      }

      /* ---- 求和 \sum_{i=a}^{b} body ---- */
      var mSum = s.slice(i).match(/^\\sum\s*/);
      if (mSum) {
        var p4 = i + mSum[0].length;
        var sLo = null, sHi = null;
        for (var ps = 0; ps < 2; ps++) {
          while (s.charAt(p4) === ' ') p4++;
          if (s.charAt(p4) === '_') { var SL = readArg(s, p4 + 1); sLo = walk(SL.body); p4 = SL.end; }
          else if (s.charAt(p4) === '^') { var SH = readArg(s, p4 + 1); sHi = walk(SH.body); p4 = SH.end; }
          else break;
        }
        var sumBody = walk(s.slice(p4));
        var sm = (sLo || '').replace(/=/, '').match(/^([a-zA-Z])/);
        var sv = sm ? sm[1] : 'i';
        var num = /^\d+$/.test(sLo || '') ? sLo : '1';
        var start = (sLo || '').match(/=\s*(.+)/);
        var from = start ? start[1] : '1';
        out += 'sum(' + sumBody + ',' + sv + ',' + from + ',' + (sHi || '10') + ')';
        i = s.length;
        continue;
      }

      /* ---- \frac{d}{dx} ---- */
      var mD = s.slice(i).match(/^\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}/);
      if (mD) {
        var dv = mD[1];
        var db = walk(s.slice(i + mD[0].length));
        out += 'diff(' + db + ',' + dv + ')';
        i = s.length;
        continue;
      }
      var mD2 = s.slice(i).match(/^\\frac\s*\{\s*\\mathrm\{d\}\s*\}\s*\{\s*\\mathrm\{d\}\s*([a-zA-Z])\s*\}/);
      if (mD2) {
        var dv2 = mD2[1];
        var db2 = walk(s.slice(i + mD2[0].length));
        out += 'diff(' + db2 + ',' + dv2 + ')';
        i = s.length;
        continue;
      }

      /* ---- \left| ... \right| 与 |x| ---- */
      if (s.slice(i).match(/^\\left\s*\|/)) {
        var vb = readDelim(s, i + s.slice(i).match(/^\\left\s*\|/)[0].length, /^\\right\s*\|/);
        if (vb) { out += 'abs(' + vb.body + ')'; i = vb.end; continue; }
      }

      /* ---- \left( \right) 等定界符 ---- */
      var mLeft = s.slice(i).match(/^\\left\s*([([{])/);
      if (mLeft) {
        i += mLeft[0].length;
        out += mLeft[1] === '{' ? '(' : mLeft[1];
        continue;
      }
      var mRight = s.slice(i).match(/^\\right\s*([)\]}.|])/);
      if (mRight) {
        i += mRight[0].length;
        var closeCh = mRight[1];
        if (closeCh === '.') { continue; }   // \right. 不输出
        if (closeCh === '}') closeCh = ')';
        if (closeCh === '|') { out += ''; continue; }
        out += closeCh;
        continue;
      }

      /* ---- 三角/对数等函数：\sin x → sin(x) ---- */
      var mFn = s.slice(i).match(/^\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|abs)\s*/);
      if (mFn) {
        var fnName = mFn[1];
        var p5 = i + mFn[0].length;

        // \log_{a}{b}
        if (fnName === 'log' && s.charAt(p5) === '_') {
          var lg = readArg(s, p5 + 1);
          var basArg = readArg(s, lg.end);
          out += 'log(' + walk(basArg.body) + ')/log(' + walk(lg.body) + ')';
          i = basArg.end;
          continue;
        }

        // 上标：\sin^{2}x → (sin(x))^2
        var sup = '';
        if (s.charAt(p5) === '^') {
          var SP = readArg(s, p5 + 1);
          sup = '^(' + walk(SP.body) + ')';
          p5 = SP.end;
        }

        var A2;
        var argTxt;
        if (s.charAt(p5) === '(') {
          // 括号参数：读到配对的 ')'
          var depthP = 0, endP = -1;
          for (var kp = p5; kp < s.length; kp++) {
            if (s.charAt(kp) === '(') depthP++;
            else if (s.charAt(kp) === ')') { depthP--; if (depthP === 0) { endP = kp; break; } }
          }
          if (endP > 0) {
            argTxt = s.slice(p5 + 1, endP);
            A2 = { body: argTxt, end: endP + 1 };
          } else {
            argTxt = s.slice(p5 + 1);
            A2 = { body: argTxt, end: s.length };
          }
        } else {
          A2 = readArg(s, p5);
          argTxt = A2.body;
          // 无括号时，取「一个项」：变量或数字
          if (s.charAt(p5) !== '{') {
            var mm = s.slice(p5).match(/^[a-zA-Z0-9]+/);
            if (mm) {
              argTxt = mm[0];
              A2 = { body: argTxt, end: p5 + mm[0].length };
            }
          }
        }
        out += '(' + fnName + '(' + walk(argTxt) + '))' + sup;
        i = A2.end;
        continue;
      }

      /* ---- 希腊字母 / 符号 ---- */
      var mSym = s.slice(i).match(/^\\(pi|alpha|beta|gamma|theta|lambda|mu|sigma|phi|omega|infty)\s*/);
      if (mSym) {
        var map = { pi: 'pi', alpha: 'alpha', beta: 'beta', gamma: 'gamma', theta: 'theta',
                    lambda: 'lambda', mu: 'mu', sigma: 'sigma', phi: 'phi', omega: 'omega', infty: 'Infinity' };
        out += map[mSym[1]];
        i += mSym[0].length;
        continue;
      }

      /* ---- 运算符 ---- */
      var mOp = s.slice(i).match(/^\\(cdot|times|div|pm)\s*/);
      if (mOp) {
        var om = { cdot: '*', times: '*', div: '/', pm: '+-' };
        out += om[mOp[1]];
        i += mOp[0].length;
        continue;
      }
      var mRel = s.slice(i).match(/^\\(le|leq|ge|geq|ne|neq|approx)\s*/);
      if (mRel) {
        var rm = { le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', approx: '=' };
        out += rm[mRel[1]];
        i += mRel[0].length;
        continue;
      }

      /* ---- \, \; \! \quad 等空白 ---- */
      if (s.slice(i).match(/^\\(?:,|;|:|!|quad|qquad| )/)) {
        var mSp = s.slice(i).match(/^\\(?:,|;|:|!|quad|qquad| )/);
        i += mSp[0].length;
        continue;
      }

      /* ---- \{ \} 字面花括号 ---- */
      if (s.charAt(i) === '\\' && s.charAt(i + 1) === '{') { out += '('; i += 2; continue; }
      if (s.charAt(i) === '\\' && s.charAt(i + 1) === '}') { out += ')'; i += 2; continue; }

      /* ---- 花括号当括号 ---- */
      if (c === '{') {
        var gg = readGroup(s, i);
        if (gg) { out += '(' + walk(gg.body) + ')'; i = gg.end; continue; }
      }

      /* ---- 上标 ^{...} ---- */
      if (c === '^') {
        var EX = readArg(s, i + 1);
        out += '^(' + walk(EX.body) + ')';
        i = EX.end;
        continue;
      }

      /* ---- 下标 _{...} ---- */
      if (c === '_') {
        var SB = readArg(s, i + 1);
        i = SB.end;
        continue;    // 下标在求值里一般忽略（如 x_1）
      }

      /* ---- 未识别命令：去掉反斜杠保留名 ---- */
      if (c === '\\') {
        var uc = s.slice(i).match(/^\\([a-zA-Z]+)/);
        if (uc) { out += uc[1]; i += uc[0].length; continue; }
        i++;
        continue;
      }

      out += c;
      i++;
    }
    return out;
  }

  // 读取到指定结尾定界符
  function readDelim(s, start, endRe) {
    var rest = s.slice(start);
    var m = rest.match(endRe);
    if (!m) {
      // 退化为：读到行尾
      return { body: walk(rest), end: s.length };
    }
    return { body: walk(rest.slice(0, m.index)), end: start + m.index + m[0].length };
  }

  /* ---------- 主入口 ---------- */
  function toCas(latex) {
    var s = String(latex || '');
    if (!s) return '';

    // 预处理
    s = s.replace(/\\displaystyle/g, ' ');
    s = s.replace(/\\text\{([^}]*)\}/g, '$1');
    s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');
    s = s.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '');
    s = s.replace(/\\left\./g, '').replace(/\\right\./g, '');
    s = s.replace(/\\rightarrow|\\to|\\rarr/g, '->');
    s = s.replace(/\\Rightarrow/g, '=>');

    // 撇号导数：y'' → diff(y,x,2)，y' → diff(y,x)
    // 先处理双撇号，再单撇号
    s = s.replace(/([a-zA-Z])\s*''/g, '@D2$1@');
    s = s.replace(/([a-zA-Z])\s*'/g, '@D1$1@');

    // \frac{d}{dx} 要先处理（否则被 \frac 吃掉）
    s = s.replace(/\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}/g, '\u0001D$1\u0001');
    s = s.replace(/\\frac\s*\{\s*\\mathrm\{d\}\s*\}\s*\{\s*\\mathrm\{d\}\s*([a-zA-Z])\s*\}/g, '\u0001D$1\u0001');

    var out = walk(s);

    // 还原 @DERIV_x@：把它后面的表达式作为求导对象
    out = out.replace(/\u0001D([a-zA-Z])\u0001([\s\S]*)$/g, function (_, v, rest) {
      return 'diff(' + rest + ',' + v + ')';
    });

    // 还原撇号标记
    out = out.replace(/@D2([a-zA-Z])@/g, 'diff($1,x,2)');
    out = out.replace(/@D1([a-zA-Z])@/g, 'diff($1,x)');

    // 收尾清理
    out = out.replace(/\s+/g, '');
    out = out.replace(/^\*+|\*+$/g, '');
    return out.trim();
  }

  global.LaTeX2Cas = {
    convert: toCas,
    walk: walk,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
