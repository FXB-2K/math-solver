(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) return;

  var chrome = document.createElement('div');
  chrome.id = 'v-chrome';
  chrome.setAttribute('aria-hidden', 'true');
  chrome.innerHTML =
    '<div class="v-lights"><i class="r"></i><i class="y"></i><i class="g"></i></div>' +
    '<div class="v-addr"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span class="v-addr-t"></span></div>' +
    '<div class="v-win-title">\u6570\u4e8c\u771f\u9898\u5168\u89e3</div>' +
    '<div class="v-win-right"><span class="v-dot"></span>\u672c\u5730\u8fd0\u884c</div>';
  app.insertBefore(chrome, app.firstChild);

  var t = chrome.querySelector('.v-addr-t');
  if (t) {
    var path = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    t.textContent = location.host + path;
  }

  /* \u661f\u4e91\u9996\u9875\u5165\u53e3\uff08\u684c\u9762\u4fa7\u680f\uff09 */
  var bar = document.getElementById('tabbar');
  if (bar && !bar.querySelector('.tab-home')) {
    var hm = document.createElement('a');
    hm.className = 'tab tab-home';
    hm.href = 'home.html';
    hm.innerHTML = '<span class="bw-dot" style="width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#818cf8,#22d3ee);flex:none"></span><span>\u661f\u4e91\u9996\u9875</span>';
    bar.insertBefore(hm, bar.firstChild);
  }

  /* \u82f1\u8bed\u8bcd\u5e93\u5165\u53e3\uff08\u684c\u9762\u4fa7\u680f\uff09 */
  if (bar && !bar.querySelector('.tab-english')) {
    var en = document.createElement('a');
    en.className = 'tab tab-english';
    en.href = 'english.html';
    en.innerHTML = '<span class="bw-dot" style="width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,var(--ramp-1,#4f46e5),var(--ramp-3,#06b6d4));flex:none"></span><span>\u82f1\u8bed\u8bcd\u5e93</span>';
    bar.appendChild(en);
  }
})();
