/* ============================================================
   图片识别（OCR）· 本地点按，不上传服务器
   - 支持：选择图片 / 拖拽 / 粘贴（Ctrl+V）
   - 支持多张图片，按顺序识别后合并文本
   - 引擎：tesseract.js（本地打包，chi_sim + eng）
   - 结果写入可编辑文本框，用户可校对后再解题
   ============================================================ */
(function (global) {
  'use strict';

  var worker = null;
  var loading = false;
  var queue = [];
  var busy = false;

  function $(id) {
    if (!id) return null;
    return id.charAt(0) === '#' ? document.querySelector(id) : document.getElementById(id);
  }

  /* ---------- 图像预处理 ----------
     目标：把手机拍的本子照片变成「白底黑字、笔画清晰」的二值图
     步骤：放大 → 灰度 → 局部对比度增强 → Otsu 二值化 → 去小噪点
     ------------------------------------------------------------ */
  function preprocess(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    // 放大到长边约 2000px：tesseract 在 300dpi 等效下最准
    var target = 2000;
    var scale = target / Math.max(w, h);
    if (scale > 2.6) scale = 2.6;
    if (scale < 1) scale = 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);
    var cap = 2600;
    if (Math.max(cw, ch) > cap) {
      var k = cap / Math.max(cw, ch);
      cw = Math.round(cw * k); ch = Math.round(ch * k);
    }

    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cw, ch);

    var data;
    try {
      data = g.getImageData(0, 0, cw, ch);
    } catch (e) {
      return cv;   // 跨域等异常，退回原图
    }
    var px = data.data;
    var n = cw * ch;

    // ---- 1) 灰度 ----
    var gray = new Uint8ClampedArray(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      gray[i] = (px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114) | 0;
    }

    // ---- 2) 轻锐化（unsharp mask），让笔画边缘更利 ----
    var sharp = new Uint8ClampedArray(n);
    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) {
        var idx = y * cw + x;
        if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) {
          sharp[idx] = gray[idx];
          continue;
        }
        // 3x3 均值
        var sum = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            sum += gray[(y + dy) * cw + (x + dx)];
          }
        }
        var avg = sum / 9;
        var v = gray[idx] + 1.15 * (gray[idx] - avg);
        sharp[idx] = v < 0 ? 0 : (v > 255 ? 255 : v);
      }
    }

    // ---- 3) Otsu 自动阈值 ----
    var hist = new Array(256);
    for (var q = 0; q < 256; q++) hist[q] = 0;
    for (var m = 0; m < n; m++) hist[sharp[m]]++;

    var total = n;
    var sumAll = 0;
    for (var t1 = 0; t1 < 256; t1++) sumAll += t1 * hist[t1];

    var sumB = 0, wB = 0, bestVar = -1, thr = 128;
    for (var t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      var mB = sumB / wB;
      var mF = (sumAll - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) {
        bestVar = between;
        thr = t;
      }
    }
    // 本子照片常偏灰，阈值适度上浮，避免把纸纹当笔画
    thr = Math.min(230, Math.max(60, thr + 8));

    // ---- 4) 二值化 + 输出 ----
    for (var i2 = 0, j2 = 0; i2 < n; i2++, j2 += 4) {
      var bin = sharp[i2] > thr ? 255 : 0;
      px[j2] = px[j2 + 1] = px[j2 + 2] = bin;
      px[j2 + 3] = 255;
    }
    g.putImageData(data, 0, 0);

    // ---- 5) 去孤立噪点（3x3：周围黑点 <= 1 且自己是黑 → 转白）----
    try {
      var d2 = g.getImageData(0, 0, cw, ch);
      var p2 = d2.data;
      var out = new Uint8ClampedArray(n);
      for (var yy = 0; yy < ch; yy++) {
        for (var xx = 0; xx < cw; xx++) {
          var id = yy * cw + xx;
          out[id] = p2[id * 4];
        }
      }
      var cleaned = new Uint8ClampedArray(n);
      for (var y3 = 0; y3 < ch; y3++) {
        for (var x3 = 0; x3 < cw; x3++) {
          var i3 = y3 * cw + x3;
          if (x3 === 0 || y3 === 0 || x3 === cw - 1 || y3 === ch - 1) {
            cleaned[i3] = out[i3];
            continue;
          }
          if (out[i3] === 255) { cleaned[i3] = 255; continue; }
          var blackCnt = 0;
          for (var dy3 = -1; dy3 <= 1; dy3++) {
            for (var dx3 = -1; dx3 <= 1; dx3++) {
              if (dx3 === 0 && dy3 === 0) continue;
              if (out[(y3 + dy3) * cw + (x3 + dx3)] < 128) blackCnt++;
            }
          }
          cleaned[i3] = blackCnt <= 1 ? 255 : 0;
        }
      }
      for (var i4 = 0, j4 = 0; i4 < n; i4++, j4 += 4) {
        var vv = cleaned[i4];
        p2[j4] = p2[j4 + 1] = p2[j4 + 2] = vv;
      }
      g.putImageData(d2, 0, 0);
    } catch (e) { /* 忽略 */ }

    return cv;
  }

  /* ---------- 初始化 worker（懒加载，只做一次） ---------- */
  function getWorker(onProgress) {
    if (worker) return Promise.resolve(worker);
    if (loading) {
      return new Promise(function (res, rej) {
        var t = setInterval(function () {
          if (worker) { clearInterval(t); res(worker); }
        }, 200);
        setTimeout(function () { clearInterval(t); if (!worker) rej(new Error('OCR 初始化超时')); }, 120000);
      });
    }
    loading = true;
    if (typeof Tesseract === 'undefined') {
      loading = false;
      return Promise.reject(new Error('OCR 引擎未加载'));
    }
    return Tesseract.createWorker('eng+chi_sim', 1, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract',
      langPath: 'vendor/tessdata',
      gzip: false,
      workerBlobURL: false,
      logger: function (m) {
        if (onProgress) {
          if (m.status === 'recognizing text') onProgress(0.5 + m.progress * 0.5, '识别文字…');
          else if (/loading language/.test(m.status)) onProgress(0.3, '加载语言包…');
          else if (/initializing api/.test(m.status)) onProgress(0.45, '初始化…');
          else if (/loading tesseract core/.test(m.status)) onProgress(0.1, '加载识别引擎…');
        }
      }
    }).then(function (w) {
      worker = w;
      loading = false;
      return w;
    }).catch(function (e) {
      loading = false;
      throw e;
    });
  }

  /* ---------- 识别一张 ---------- */
  function ocrImage(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var cv = preprocess(img);
        URL.revokeObjectURL(url);
        getWorker(onProgress).then(function (w) {
          if (onProgress) onProgress(0.5, '识别文字…');
          // 数学题多为「规整段落」→ PSM 6 实测最准（比默认 PSM 3 高 3 分）
          return w.setParameters({ tessedit_pageseg_mode: '6' }).then(function () {
            return w.recognize(cv.toDataURL('image/png'));
          });
        }).then(function (r) {
          var words = [];
          try {
            (r.data.words || []).forEach(function (w) {
              if (w && w.text && String(w.text).trim()) {
                words.push({
                  text: String(w.text),
                  conf: typeof w.confidence === 'number' ? w.confidence : 0,
                  line: w.line && w.line.text ? String(w.line.text) : ''
                });
              }
            });
          } catch (e) {}
          resolve({
            text: (r.data.text || '').replace(/\r/g, ''),
            confidence: r.data.confidence || 0,
            words: words
          });
        }).catch(reject);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      img.src = url;
    });
  }

  /* ---------- 文本后处理：修正 OCR 对数学符号的误读 ----------
     tesseract 是通用 OCR，不认识数学排版。这里按「数学语义」逐条纠正。
     规则都写成「只在数学上下文里才替换」，避免误伤正常中文。
     ------------------------------------------------------------ */
  var CN_FIX = {
    '德分方程': '微分方程', '微分 方程': '微分方程',
    '二 阶': '二阶', '两 个 解': '两个解', '两 个 月': '两个解',
    '通 解': '通解', '特 解': '特解',
    '导 数': '导数', '积 分': '积分', '极 限': '极限',
    '函 数': '函数', '方 程': '方程', '等 式': '等式',
    '已 知': '已知', '求 解': '求解', '证 明': '证明',
    '计 算': '计算', '化 简': '化简', '因 式 分 解': '因式分解',
    '则': '则', '若': '若', '且': '且',
    '不 定 积 分': '不定积分', '定 积 分': '定积分',
    '连续': '连续', '可 导': '可导', '连 续': '连续',
    '收敛': '收敛', '发散': '发散', '单 调': '单调'
  };

  function cleanOcr(t) {
    var s = String(t || '');

    /* ---- 第一层：去掉字符之间的多余空格 ---- */
    // 中文之间
    s = s.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1');
    // 数学表达式内部（字母/数字/运算符之间不留水平空格，但绝不吃掉换行）
    s = s.replace(/([a-zA-Z0-9])[ \t]+([\^_+\-*/()])/g, '$1$2');
    s = s.replace(/([\^_+\-*/(])[ \t]+([a-zA-Z0-9])/g, '$1$2');
    // 运算符周围的空格（如 "sin(x) /x"、"= -1"）
    s = s.replace(/[ \t]*\/[ \t]*(?=[a-zA-Z0-9(])/g, '/');
    s = s.replace(/([a-zA-Z0-9)])[ \t]+(?=[+\-*^])/g, '$1');
    s = s.replace(/([+\-*^])[ \t]+(?=[a-zA-Z0-9(])/g, '$1');
    // 行首空格
    s = s.replace(/^[ \t]+/gm, '');

    /* ---- 第二层：中文词组修复 ---- */
    Object.keys(CN_FIX).forEach(function (bad) {
      if (s.indexOf(bad) >= 0) s = s.split(bad).join(CN_FIX[bad]);
    });
    // 去空格后再修一遍（"两 个 月" → "两个月" → "两个解"）
    var CN_FIX2 = {
      '两个月': '两个解', '两个解析': '两个解',
      '微分方程': '微分方程', '微分 方程': '微分方程',
      '通解': '通解', '特解': '特解', '齐次': '齐次', '非齐次': '非齐次'
    };
    Object.keys(CN_FIX2).forEach(function (bad) {
      s = s.split(bad).join(CN_FIX2[bad]);
    });

    /* ---- 第三层：数学符号误读修复 ---- */

    // 3.1 全角 → 半角
    s = s.replace(/（/g, '(').replace(/）/g, ')')
         .replace(/，/g, ',').replace(/：/g, ':')
         .replace(/；/g, ';').replace(/＝/g, '=')
         .replace(/＋/g, '+').replace(/－/g, '-')
         .replace(/［/g, '[').replace(/］/g, ']')
         .replace(/／/g, '/');

    // 3.2 「(0=」几乎必然是「(x)=」——f(x)= 里的 x) 被读成 0=
    s = s.replace(/\(\s*0\s*=/g, '(x)=');
    // 3.3 「(O=」同理（O 被当作 0）
    s = s.replace(/\(\s*[Oo]\s*=/g, '(x)=');

    // 3.4 函数参数里的误读：u(Ox) → u(x)，u(Oe^Ax → u(x)e^x
    //     先把 e^Ax / e^Ax 之类还原成 e^x
    s = s.replace(/e\s*\^\s*[A-Z]x/g, 'e^x');
    s = s.replace(/e\s*\^\s*Ax/g, 'e^x');
    //     u(Oe^... → u(x)e^...
    s = s.replace(/([a-zA-Z])\s*\(\s*[O0]\s*(?=e\^)/g, '$1(x)');

    // 3.5 双撇号：y" → y''（二阶导数）
    s = s.replace(/([a-zA-Z])\s*[\u0022\u201c\u201d\u2033]/g, "$1''");

    // 3.6 「uC1)」→「u(-1)」：C 是 ( 的误读
    s = s.replace(/([a-zA-Z])\s*C\s*(-?\d+)\s*\)/g, '$1($2)');

    // 3.7 数字 0 与字母 O 混淆（数字上下文中）
    s = s.replace(/(\d)\s*[Oo]\s*(\d)/g, '$10$2');
    s = s.replace(/([=+\-*/(])\s*[Oo]\s*(?=[\d)])/g, '$10');

    // 3.8 字母 l / I / 1 混淆
    s = s.replace(/(^|[\s(=,+\-*/])l(?=[\s\d)])/g, '$11');
    s = s.replace(/(^|[\s(=,+\-*/])I(?=[\s\d)])/g, '$11');

    // 3.9 「x*2」→「x^2」：乘号是上标的误读
    s = s.replace(/([a-zA-Z\)])\s*\*\s*(\d)(?![\d.])/g, '$1^$2');

    // 3.10 「xX」「yy」双写
    s = s.replace(/([a-zA-Z])\1(?=[\^\(\)\s=+\-*/,])/g, '$1');

    // 3.11 「土」「±」混乱，「-」与「_」在下标位置
    s = s.replace(/([a-zA-Z])\s*_\s*(\d)/g, '$1_$2');

    /* ---- 第四层：题目结构修复 ---- */

    // 4.1 小问标号：(1) (2) 缺失左括号
    s = s.replace(/^(\s*)(\d)\s*[.)、]\s*/gm, '$1($2) ');
    s = s.replace(/(\s)(\d)\s*\)\s+/g, '$1($2) ');

    // 4.2 「若...，...」逗号是中文，统一保留
    // 4.3 噪声字符（OCR 常把装饰线、边框读成 # | ~ ` 等）
    s = s.replace(/[·•]/g, '');
    s = s.replace(/^[#|~`_=<>{}\[\].,;:、\s]+/gm, '');
    s = s.replace(/[ \t]*#[ \t]*/g, ' ');

    // 4.4 行首孤立 i/I/# 残留（OCR 把编号或边框读成字符）
    s = s.replace(/^[#|~`_\s]*[iIl](?=[a-zA-Z]\s*\()/gm, '');
    s = s.replace(/^[iI](?=[a-zA-Z]\s*\()/gm, '');
    // 行尾多余符号
    s = s.replace(/[|_~`]+\s*$/gm, '');

    // 4.5 括号不闭合估算补齐
    //     只在「数学表达式」里补：行内括号差 1 且行内有 ^ 或 = 或函数名
    var lines = s.split('\n');
    lines = lines.map(function (ln) {
      var op = (ln.match(/\(/g) || []).length;
      var cp = (ln.match(/\)/g) || []).length;
      if (op <= cp) return ln;
      // 差太多（>2）说明识别整体崩了，不硬补
      if (op - cp > 2) return ln;
      // 行里得像个数学式
      if (!/[\^=]|(?:sin|cos|tan|ln|log|exp|lim|int)/.test(ln)) return ln;
      // 找最后一个未闭合的 "("，在合适位置补 ")"
      var depth = 0, lastOpen = -1;
      for (var k = 0; k < ln.length; k++) {
        if (ln.charAt(k) === '(') { depth++; lastOpen = k; }
        else if (ln.charAt(k) === ')') depth--;
      }
      if (depth <= 0 || lastOpen < 0) return ln;
      // 从 lastOpen 往后找第一个「中文/逗号/行尾」的位置插 )
      var insertAt = ln.length;
      for (var m2 = lastOpen + 1; m2 < ln.length; m2++) {
        var ch2 = ln.charAt(m2);
        if (/[\u4e00-\u9fa5,;]/.test(ch2)) { insertAt = m2; break; }
      }
      // 去掉插入点前的空格
      var head = ln.slice(0, insertAt).replace(/[ \t]+$/, '');
      var tail = ln.slice(insertAt);
      return head + new Array(depth + 1).join(')') + tail;
    });
    s = lines.join('\n');

    /* ---- 第五层：清理 ---- */
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]{2,}/g, ' ');
    return s.trim();
  }

  /* ---------- 二次校对提示：检测可疑片段 ---------- */
  function suspectList(text) {
    var out = [];
    var s = String(text || '');
    var checks = [
      { re: /[a-zA-Z]\s*\(\s*\d+\s*=\s*[^)]*\^/, msg: '函数括号可能没闭合（如 f(0=x) 应为 f(x)=)' },
      { re: /[a-zA-Z]"\s*[^']/, msg: '二阶导数写法可能不对（应为双层单引号）' },
      { re: /\bvv\b|\bxX\b|\buu\b/, msg: '可能有字母重复' },
      { re: /[^\x00-\x7f\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef±×÷∫√∑π∞≤≥≠≈→∂]/, msg: '有无法识别的特殊字符' },
      { re: /\b(?:1l|Il|O0|0O)\b/, msg: '有字符混淆（1/l、O/0）' }
    ];
    checks.forEach(function (c) {
      var m = s.match(c.re);
      if (m) out.push(c.msg + '：' + m[0]);
    });
    return out;
  }

  /* ---------- 多图队列 ---------- */
  function addFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      if (f && /^image\//.test(f.type)) queue.push(f);
    });
    renderQueue();
  }

  function renderQueue() {
    var box = $('#msOcrQueue');
    if (!box) return;
    box.innerHTML = '';
    queue.forEach(function (f, i) {
      var item = document.createElement('div');
      item.className = 'ms-ocr-item';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.alt = f.name;
      item.appendChild(img);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'ms-ocr-del';
      del.innerHTML = '×';
      del.title = '移除';
      del.addEventListener('click', function () {
        queue.splice(i, 1);
        renderQueue();
      });
      item.appendChild(del);
      box.appendChild(item);
    });
    var run = $('#msOcrRun');
    if (run) {
      run.disabled = queue.length === 0 || busy;
      run.textContent = queue.length > 1 ? ('识别 ' + queue.length + ' 张') : '识别文字';
    }
  }

  function setStatus(t, pct) {
    var st = $('#msOcrStatus');
    if (st) st.textContent = t || '';
    var bar = $('#msOcrBar');
    if (bar) {
      bar.style.width = Math.round((pct || 0) * 100) + '%';
      bar.parentNode.hidden = !pct;
    }
  }

  function run() {
    if (busy || !queue.length) return;
    busy = true;
    renderQueue();
    var files = queue.slice();
    var texts = [];
    var allWords = [];
    var i = 0;

    function next() {
      if (i >= files.length) {
        busy = false;
        queue = [];
        renderQueue();
        var merged = cleanOcr(texts.join('\n'));
        showProofread(merged, allWords);
        setStatus('识别完成 · 请在下面校对，改完点「填入题目框」', 1);
        return;
      }
      var f = files[i];
      setStatus('正在识别第 ' + (i + 1) + ' / ' + files.length + ' 张…', (i) / files.length);
      ocrImage(f, function (p, label) {
        setStatus('第 ' + (i + 1) + ' 张 · ' + label, (i + p) / files.length);
      }).then(function (r) {
        texts.push(r.text);
        allWords = allWords.concat(r.words || []);
        i++;
        next();
      }).catch(function (e) {
        texts.push('[第 ' + (i + 1) + ' 张识别失败：' + (e.message || e) + ']');
        i++;
        next();
      });
    }
    next();
  }

  /* ---------- 逐行校对面板 ----------
     把识别结果按行拆开，每行一个可编辑输入框。
     置信度低的词标黄/红，提示你重点看这一行。
     ------------------------------------------------- */
  function showProofread(text, words) {
    var box = $('#msProof');
    var list = $('#msProofList');
    if (!box || !list) return;

    // 每行的最低置信度
    var lineConf = {};
    (words || []).forEach(function (w) {
      var key = cleanOcr(w.line || '');
      if (!key) return;
      var c = typeof w.conf === 'number' ? w.conf : 0;
      if (!(key in lineConf) || c < lineConf[key]) lineConf[key] = c;
    });

    var lines = String(text || '').split('\n');
    list.innerHTML = '';

    lines.forEach(function (ln, idx) {
      if (!ln.trim()) return;
      var row = document.createElement('div');
      row.className = 'ms-proof-row';

      var no = document.createElement('span');
      no.className = 'ms-proof-no';
      no.textContent = String(idx + 1);
      row.appendChild(no);

      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ms-proof-inp';
      inp.value = ln;
      inp.setAttribute('data-line', String(idx));

      // 找这行的置信度
      var lc = null;
      Object.keys(lineConf).forEach(function (k) {
        if (lc === null && (ln.indexOf(k) >= 0 || k.indexOf(ln.trim()) >= 0)) lc = lineConf[k];
      });
      if (lc !== null) {
        if (lc < 55) { row.classList.add('bad'); inp.title = '这一行识别把握很低（' + Math.round(lc) + '%），建议对照原图改'; }
        else if (lc < 78) { row.classList.add('warn'); inp.title = '这一行把握一般（' + Math.round(lc) + '%），建议核对'; }
      }

      inp.addEventListener('input', function () { inp.classList.remove('bad', 'warn'); });
      row.appendChild(inp);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'ms-proof-del';
      del.textContent = '×';
      del.title = '删除这一行';
      del.addEventListener('click', function () { row.remove(); });
      row.appendChild(del);

      list.appendChild(row);
    });

    if (!list.childElementCount) {
      var empty = document.createElement('div');
      empty.className = 'ms-proof-empty';
      empty.textContent = '没识别出文字，换个光线重拍或直接手打吧';
      list.appendChild(empty);
    }

    box.hidden = false;
    // 滚到校对面板
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  /* ---------- 校对结果合并到题目框 ---------- */
  function applyProofread() {
    var list = $('#msProofList');
    if (!list) return;
    var inputs = list.querySelectorAll('.ms-proof-inp');
    var out = [];
    Array.prototype.forEach.call(inputs, function (inp) {
      var v = (inp.value || '').trim();
      if (v) out.push(v);
    });
    var text = out.join('\n');
    var ta = $('#msInput');
    if (ta) {
      ta.value = text;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var box = $('#msProof');
    if (box) box.hidden = true;
    var panel = $('#msOcrPanel');
    if (panel) panel.hidden = true;
    setStatus('已填入题目框，检查无误后点「解题」', 0);
  }

  /* ---------- 面板 ---------- */
  function build() {
    var ta = $('#msInput');
    if (!ta || document.querySelector('.ms-ocr-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'ms-ocr-wrap';
    wrap.innerHTML =
      '<div class="ms-ocr-actions">' +
        '<button type="button" class="ms-ocr-btn" id="msOcrPick">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
          '拍照 / 选图' +
        '</button>' +
        '<button type="button" class="ms-ocr-btn ghost" id="msOcrPasteHint">或直接 Ctrl+V 粘贴截图</button>' +
      '</div>' +
      '<input type="file" id="msOcrFile" accept="image/*" multiple hidden>' +
      '<div class="ms-ocr-panel" id="msOcrPanel" hidden>' +
        '<div class="ms-ocr-head">' +
          '<span>待识别图片</span>' +
          '<button type="button" class="ms-ocr-run" id="msOcrRun" disabled>识别文字</button>' +
        '</div>' +
        '<div class="ms-ocr-queue" id="msOcrQueue"></div>' +
        '<div class="ms-ocr-progress" hidden><span id="msOcrBar"></span></div>' +
        '<div class="ms-ocr-status" id="msOcrStatus"></div>' +
      '</div>' +
      '<div class="ms-proof" id="msProof" hidden>' +
        '<div class="ms-proof-head">' +
          '<span>逐行校对 <b>（黄/红 = 把握低，重点看）</b></span>' +
          '<button type="button" class="ms-proof-ok" id="msProofOk">填入题目框</button>' +
        '</div>' +
        '<div class="ms-proof-list" id="msProofList"></div>' +
      '</div>';

    // 插在 textarea 后面（符号键盘之前）
    ta.parentNode.insertBefore(wrap, ta.nextSibling);

    var fileInput = wrap.querySelector('#msOcrFile');
    wrap.querySelector('#msOcrPick').addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length) {
        addFiles(fileInput.files);
        var panel = $('#msOcrPanel');
        if (panel) panel.hidden = false;
      }
      fileInput.value = '';
    });
    wrap.querySelector('#msOcrRun').addEventListener('click', run);
    var okBtn = wrap.querySelector('#msProofOk');
    if (okBtn) okBtn.addEventListener('click', applyProofread);

    // 粘贴
    document.addEventListener('paste', function (e) {
      if (!$('#page-solver') || $('#page-solver').hidden) return;
      var items = (e.clipboardData || {}).items || [];
      var imgs = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        addFiles(imgs);
        var panel = $('#msOcrPanel');
        if (panel) panel.hidden = false;
        setStatus('已粘贴 ' + imgs.length + ' 张，点「识别文字」', 0);
      }
    });

    // 拖拽到输入区
    ta.addEventListener('dragover', function (e) {
      e.preventDefault();
      ta.classList.add('ms-drag');
    });
    ta.addEventListener('dragleave', function () {
      ta.classList.remove('ms-drag');
    });
    ta.addEventListener('drop', function (e) {
      e.preventDefault();
      ta.classList.remove('ms-drag');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
        var panel = $('#msOcrPanel');
        if (panel) panel.hidden = false;
      }
    });
  }

  global.MathSolverOcr = {
    build: build,
    addFiles: addFiles,
    run: run,
    apply: applyProofread,
    clean: cleanOcr,
    suspects: suspectList,
    version: '2.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);


