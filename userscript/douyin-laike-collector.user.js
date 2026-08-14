// ==UserScript==
// @name         抖音来客数据采集器 → Copy Studio
// @name:zh-CN   抖音来客数据采集器（自动抓取经营数据 → 投流文案工作台数据分析）
// @namespace    dycs.collector
// @version      1.0.0
// @description  在抖音来客商家后台自动采集经营数据接口（受众/消耗/地域/达人等），一键注入 Copy Studio 数据分析板块。纯前端采集，不保存账号密码。
// @description:zh-CN  自动拦截抖音来客后台的数据接口，一键注入 Copy Studio 数据分析板块。
// @author       Copy Studio
// @match        *://laike.douyin.com/*
// @match        *://*.laike.douyin.com/*
// @match        *://business.douyin.com/*
// @match        *://*.business.douyin.com/*
// @match        *://local.life.douyin.com/*
// @match        *://*.local.life.douyin.com/*
// @match        *://ad.oceanengine.com/*
// @match        *://*.ad.oceanengine.com/*
// @match        *://business.oceanengine.com/*
// @match        *://*.business.oceanengine.com/*
// @match        *://*.bytedance.com/*
// @run-at       document-start
// @noframes
// @license      MIT
// ==/UserScript==

/* ============================================================
 * 抖音来客数据采集器
 * ------------------------------------------------------------
 * 功能：
 *   1) 在商家后台自动拦截 XHR / fetch 的数据接口（按 URL 关键词匹配）
 *   2) 悬浮面板展示已采集的接口列表
 *   3) 一键「注入 Copy Studio」：新开页面 + postMessage 推送数据；
 *      同时复制 JSON 到剪贴板作为兜底
 *   4) 「抓取当前页表格」：把页面上渲染出的表格也一并采集
 *
 * 说明：脚本只在你的浏览器里读取页面自己加载的数据，不会把任何
 *       账号凭据发出去；数据最终只进入你自己的 Copy Studio 页面。
 * ============================================================ */
(function () {
  'use strict';

  if (window.__DYCS_COLLECTOR__) return; // 防止重复注入
  window.__DYCS_COLLECTOR__ = true;

  /* ---------- 配置 ---------- */
  // 允许测试环境覆盖目标地址；默认线上 Copy Studio
  var COPY_STUDIO_URL = (typeof window.__DYCS_STUDIO_URL__ !== 'undefined' && window.__DYCS_STUDIO_URL__) ||
    'https://womeng2018-dotcom.github.io/douyin-copy-studio/?src=dycs-collector';
  var MAX_BLOBS = 60;               // 最多保留的 JSON 响应数
  var MAX_BLOB_SIZE = 400 * 1024;   // 单个响应超过 400KB 不存
  // URL 关键词：命中才采集（英文接口名 + 中文兜底）
  var URL_KEYWORDS = [
    'report', 'overview', 'analysis', 'analytics', 'dashboard', 'data', 'stat',
    'consume', 'spend', 'cost', 'audience', 'region', 'gender', 'age', 'creator',
    'reach', 'gmv', 'order', 'verify', 'refund', 'store', 'effect', 'metric',
    'trend', 'fans', 'roi', 'cpa', '核销', '数据', '报表', '经营', '消耗', '分析'
  ];
  var KEYWORD_RE = new RegExp(URL_KEYWORDS.join('|'), 'i');

  /* ---------- 状态 ---------- */
  var blobs = [];        // {url, time, keys, data}
  var tables = [];       // {url, title, headers, rows}

  /* ---------- 工具 ---------- */
  function now() { return new Date().toLocaleString('zh-CN'); }

  function isJsonLike(ct) {
    ct = (ct || '').toLowerCase();
    return ct.indexOf('json') !== -1 || ct.indexOf('text/plain') !== -1;
  }

  function tryParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function topKeys(obj, n) {
    n = n || 8;
    if (!obj || typeof obj !== 'object') return [];
    var out = [];
    Object.keys(obj).slice(0, n).forEach(function (k) {
      var v = obj[k];
      out.push(k + ': ' + (Array.isArray(v) ? '[array ' + v.length + ']' : (typeof v === 'object' ? '{obj}' : String(v).slice(0, 24))));
    });
    return out;
  }

  function addBlob(url, data) {
    var size;
    try { size = JSON.stringify(data).length; } catch (e) { return; }
    if (size > MAX_BLOB_SIZE) return;
    // 同 URL 去重（保留最新）
    blobs = blobs.filter(function (b) { return b.url !== url; });
    blobs.push({ url: url, time: now(), size: size, keys: topKeys(data), data: data });
    if (blobs.length > MAX_BLOBS) blobs.shift();
    updatePanel();
  }

  /* ---------- 拦截 fetch ---------- */
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (url && KEYWORD_RE.test(url)) {
        p.then(function (resp) {
          try {
            resp.clone().text().then(function (text) {
              var d = tryParse(text);
              if (d) addBlob(resp.url || url, d);
            });
          } catch (e) { /* ignore */ }
        }).catch(function () { /* ignore */ });
      }
      return p;
    };
  }

  /* ---------- 拦截 XHR ---------- */
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dycsUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var self = this;
    var url = this.__dycsUrl || '';
    if (url && KEYWORD_RE.test(url)) {
      this.addEventListener('load', function () {
        try {
          if (self.status >= 200 && self.status < 300) {
            var ct = self.getResponseHeader('Content-Type') || '';
            if (isJsonLike(ct)) {
              var d = tryParse(self.responseText);
              if (d) addBlob(self.responseURL || url, d);
            }
          }
        } catch (e) { /* ignore */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  /* ---------- 页面表格采集 ---------- */
  function collectTables() {
    tables = [];
    var list = document.querySelectorAll('table');
    list.forEach(function (tb, i) {
      try {
        var headers = [], rows = [];
        var headRow = tb.querySelector('thead tr');
        if (!headRow) headRow = tb.querySelector('tr');
        if (!headRow) return;
        headRow.querySelectorAll('th,td').forEach(function (c) {
          var t = (c.innerText || '').trim();
          if (t) headers.push(t.slice(0, 30));
        });
        var bodyRows = tb.querySelectorAll('tbody tr');
        if (!bodyRows.length) bodyRows = tb.querySelectorAll('tr:not(:first-child)');
        bodyRows.forEach(function (tr) {
          var cells = [];
          tr.querySelectorAll('td').forEach(function (c) {
            var t = (c.innerText || '').trim().replace(/\s+/g, ' ');
            if (t) cells.push(t.slice(0, 60));
          });
          if (cells.length) rows.push(cells);
        });
        if (headers.length || rows.length) {
          tables.push({ url: location.href, title: '表格 ' + (i + 1), headers: headers, rows: rows });
        }
      } catch (e) { /* ignore */ }
    });
    updatePanel();
    return tables.length;
  }

  /* ---------- 悬浮面板 ---------- */
  var panelEl = null, listEl = null, countEl = null;

  function updatePanel() {
    if (!panelEl) return;
    if (countEl) countEl.textContent = blobs.length + ' 接口';
    if (listEl) {
      listEl.innerHTML = '';
      if (!blobs.length) {
        listEl.innerHTML = '<div style="padding:8px;color:#8a94a3;font-size:12px">尚未采集到数据。<br>请在抖音来客后台打开「经营概览 / 数据报表 / 投放分析」等页面。</div>';
      }
      blobs.slice(-8).reverse().forEach(function (b) {
        var d = document.createElement('div');
        d.className = 'dycs-item';
        var short = b.url.replace(/^https?:\/\/[^/]+/, '');
        if (short.length > 56) short = short.slice(0, 56) + '…';
        d.innerHTML = '<div class="dycs-url" title="' + b.url.replace(/"/g, '&quot;') + '">' + short + '</div>' +
          '<div class="dycs-meta">' + b.time + ' · ' + (b.size / 1024).toFixed(1) + 'KB</div>' +
          '<div class="dycs-keys">' + b.keys.join(' ｜ ') + '</div>';
        listEl.appendChild(d);
      });
    }
  }

  function buildPanel() {
    if (document.getElementById('dycs-panel')) return;
    var css = [
      '#dycs-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      '#dycs-panel .dycs-main{width:320px;background:#fff;border:1px solid #e4e0d6;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.16);overflow:hidden;display:none}',
      '#dycs-panel.open .dycs-main{display:block}',
      '#dycs-panel .dycs-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#6b7fa3;color:#fff;font-size:13px;font-weight:600}',
      '#dycs-panel .dycs-head .dycs-count{margin-left:auto;font-size:11px;background:rgba(255,255,255,.22);padding:2px 8px;border-radius:20px}',
      '#dycs-panel .dycs-body{padding:10px 14px;max-height:340px;overflow:auto}',
      '#dycs-panel .dycs-item{padding:7px 0;border-bottom:1px dashed #ece8dd;font-size:11.5px}',
      '#dycs-panel .dycs-item:last-child{border-bottom:0}',
      '#dycs-panel .dycs-url{font-family:ui-monospace,monospace;font-size:10.5px;color:#4a5c78;word-break:break-all}',
      '#dycs-panel .dycs-meta{color:#8a94a3;font-size:10.5px;margin-top:2px}',
      '#dycs-panel .dycs-keys{color:#5a6675;margin-top:3px;line-height:1.5}',
      '#dycs-panel .dycs-actions{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #ece8dd;flex-wrap:wrap}',
      '#dycs-panel .dycs-btn{flex:1;min-width:120px;border:0;border-radius:7px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}',
      '#dycs-panel .dycs-btn.primary{background:#6b7fa3;color:#fff}',
      '#dycs-panel .dycs-btn.primary:hover{background:#4a5c78}',
      '#dycs-panel .dycs-btn.ghost{background:#f4f2ec;color:#4a5c78;border:1px solid #e4e0d6}',
      '#dycs-panel .dycs-fab{width:46px;height:46px;border-radius:50%;background:#6b7fa3;color:#fff;border:0;font-size:20px;cursor:pointer;box-shadow:0 4px 16px rgba(107,127,163,.45);display:flex;align-items:center;justify-content:center;margin-left:auto}',
      '#dycs-panel .dycs-fab:hover{background:#4a5c78}',
      '#dycs-panel .dycs-hint{font-size:10.5px;color:#8a94a3;padding:0 14px 10px;line-height:1.6}'
    ].join('\n');
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    panelEl = document.createElement('div');
    panelEl.id = 'dycs-panel';
    panelEl.innerHTML =
      '<div class="dycs-main">' +
        '<div class="dycs-head">📊 抖音来客采集器 <span class="dycs-count">0 接口</span></div>' +
        '<div class="dycs-body"></div>' +
        '<div class="dycs-actions">' +
          '<button class="dycs-btn primary" data-act="inject">注入 Copy Studio</button>' +
          '<button class="dycs-btn ghost" data-act="copy">复制 JSON</button>' +
          '<button class="dycs-btn ghost" data-act="tables">抓当前页表格</button>' +
          '<button class="dycs-btn ghost" data-act="clear">清空</button>' +
        '</div>' +
        '<div class="dycs-hint">采集到数据后点「注入 Copy Studio」；若未自动打开，请手动复制 JSON 到数据分析页粘贴。</div>' +
      '</div>' +
      '<button class="dycs-fab" title="抖音来客数据采集器">📊</button>';
    document.body.appendChild(panelEl);
    listEl = panelEl.querySelector('.dycs-body');
    countEl = panelEl.querySelector('.dycs-count');

    panelEl.querySelector('.dycs-fab').addEventListener('click', function () {
      panelEl.classList.toggle('open');
    });
    panelEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'clear') { blobs = []; updatePanel(); }
      else if (act === 'tables') {
        var n = collectTables();
        alert('已采集 ' + n + ' 个表格（计入注入数据）');
      } else if (act === 'copy') {
        copyPayload(JSON.stringify(payload()));
        alert('已复制 JSON（' + payload().blobs.length + ' 个接口）。\n请到 Copy Studio 数据分析页，粘贴到「粘贴抓取数据」输入框并点击导入。');
      } else if (act === 'inject') {
        injectToStudio();
      }
    });
    updatePanel();
  }

  /* ---------- 组装数据 ---------- */
  function payload() {
    var p = {
      source: 'douyin-laike-collector',
      version: '1.0.0',
      capturedAt: now(),
      pageUrl: location.href,
      blobs: blobs.map(function (b) {
        return { url: b.url, time: b.time, size: b.size, data: b.data };
      }),
      tables: tables,
      metrics: extractMetrics(blobs)
    };
    return p;
  }

  /* 从采集到的 JSON 里尽力提取核心指标（GMV/消耗/核销/ROI 等） */
  function extractMetrics(blobList) {
    var out = [];
    var re = /(gmv|consume|spend|cost|verify|refund|roi|cpa|order|核销|消耗|成交|退款|支付)/i;
    var seen = {};
    blobList.forEach(function (b) {
      walk(b.data, function (key, val) {
        if (typeof val === 'number' && re.test(key) && !seen[key]) {
          seen[key] = true;
          out.push({ key: key, value: val, source: b.url.replace(/^https?:\/\/[^/]+/, '') });
        }
      });
    });
    return out.slice(0, 20);
  }

  function walk(obj, fn) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (typeof v === 'number') fn(k, v);
      else walk(v, fn);
    });
  }

  /* ---------- 注入 Copy Studio ---------- */
  function injectToStudio() {
    var p = payload();
    if (!p.blobs.length && !p.tables.length) {
      alert('还没有采集到数据。请先在抖音来客后台打开「经营概览 / 数据报表 / 投放分析」等页面，再回来点注入。');
      return;
    }
    var win = window.open(COPY_STUDIO_URL, '_blank');
    // 等待目标页加载后 postMessage（跨域安全：目标页自行校验数据）
    var sent = false;
    var trySend = function () {
      if (sent) return;
      try {
        win.postMessage({ type: 'DYCS_DATA', data: p, source: 'douyin-laike-collector' }, '*');
        sent = true;
      } catch (e) { /* ignore */ }
    };
    setTimeout(trySend, 1500);
    setTimeout(trySend, 3000);
    // 兜底：复制到剪贴板
    copyPayload(JSON.stringify(p));
    alert('已尝试自动注入 Copy Studio（新标签页）。\n若页面未收到数据，剪贴板里已复制 JSON，请到数据分析页「粘贴抓取数据」导入。');
  }

  function copyPayload(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
      } else {
        fallbackCopy(text);
      }
    } catch (e) { fallbackCopy(text); }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    buildPanel();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
