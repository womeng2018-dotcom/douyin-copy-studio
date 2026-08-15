/* ============================================================
 * 防滥用安全守卫（用量限流 / 输入上限 / 图片压缩 / 错误解析）
 * ------------------------------------------------------------
 * 纯前端实现，按浏览器本地记录用量：
 *   - 每个功能动作有「窗口期最大次数」与「每日上限」
 *   - 超限立即拦截（check 返回 ok:false + 等待秒数），前端直接停止使用
 *   - 输入长度上限：防止一次性塞入超大文本把 API 上下文打爆（400 报错）
 *   - 图片上传前压缩：降低 token 消耗，防止超大截图超限
 *
 * 说明：本机制阻止同一浏览器内的过量使用；清缓存/无痕可绕过。
 * 若要按「人/IP」强制限制，需要后端服务（如部署 video-extract 服务后
 * 在其上做 per-IP 限流），本模块已预留对应接口。
 * ============================================================ */
window.DSGuard = (function () {
  'use strict';

  var STORE_KEY = 'dycs_guard_usage_v1';

  /* 各动作限流规则：windowMs 窗口内最多 max 次；每日最多 dayMax 次 */
  var RULES = {
    rewrite: { windowMs: 60 * 60 * 1000, max: 60, dayMax: 200, label: '文案改写' },
    plan:    { windowMs: 60 * 60 * 1000, max: 30, dayMax: 100, label: '运营计划' },
    extract: { windowMs: 60 * 60 * 1000, max: 30, dayMax: 100, label: '视频提取' }
  };

  /* 输入长度上限（字符）：超过直接拦截 */
  var TEXT_LIMITS = { rewrite: 20000, plan: 8000 };

  /* 图片上传压缩参数 */
  var IMG_MAX_DIM = 1280;   // 最大边长（px）
  var IMG_QUALITY = 0.8;    // JPEG 质量

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* 超出配额忽略 */ }
  }
  function pruneDay(arr, now) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (t) { return typeof t === 'number' && now - t < 24 * 60 * 60 * 1000; });
  }

  /* 检查某动作当前是否可用 */
  function check(action) {
    var now = Date.now();
    var o = load();
    var r = RULES[action];
    if (!r) return { ok: true };
    var hourArr = pruneDay(o[action + '_h'], now);
    var dayArr = pruneDay(o[action + '_d'], now);
    var hourUsed = hourArr.filter(function (t) { return now - t < r.windowMs; }).length;
    var dayUsed = dayArr.length;
    if (dayUsed >= r.dayMax) {
      var next = new Date(now);
      next.setHours(24, 0, 0, 0);
      return {
        ok: false, daily: true,
        wait: Math.max(1, Math.ceil((next.getTime() - now) / 1000)),
        used: hourUsed, max: r.max, dayUsed: dayUsed, dayMax: r.dayMax
      };
    }
    if (hourUsed >= r.max) {
      var oldest = hourArr[hourArr.length - r.max];
      return {
        ok: false, daily: false,
        wait: Math.max(1, Math.ceil((r.windowMs - (now - oldest)) / 1000)),
        used: hourUsed, max: r.max, dayUsed: dayUsed, dayMax: r.dayMax
      };
    }
    return { ok: true, used: hourUsed, max: r.max, dayUsed: dayUsed, dayMax: r.dayMax };
  }

  /* 记录一次使用；返回更新后的用量 */
  function consume(action) {
    var now = Date.now();
    var o = load();
    var r = RULES[action];
    var h = pruneDay(o[action + '_h'], now);
    var d = pruneDay(o[action + '_d'], now);
    h.push(now);
    d.push(now);
    o[action + '_h'] = h;
    o[action + '_d'] = d;
    save(o);
    return {
      hourUsed: h.filter(function (t) { return now - t < r.windowMs; }).length,
      dayUsed: d.length
    };
  }

  /* 当前用量统计 */
  function usage(action) {
    var now = Date.now();
    var o = load();
    var r = RULES[action] || { windowMs: 0, max: 0, dayMax: 0 };
    var h = pruneDay(o[action + '_h'], now);
    var d = pruneDay(o[action + '_d'], now);
    return {
      hourUsed: h.filter(function (t) { return now - t < r.windowMs; }).length,
      hourMax: r.max,
      dayUsed: d.length,
      dayMax: r.dayMax,
      label: r.label || action
    };
  }

  /* 限流拦截的提示文案 */
  function blockMessage(lim) {
    if (!lim || lim.ok) return '';
    if (lim.daily) {
      return '⛔ ' + (RULES[lim._a] || {}).label + '：今日用量已达上限（' + lim.dayUsed + '/' + lim.dayMax + ' 次），请明天再试';
    }
    var mins = Math.max(1, Math.ceil(lim.wait / 60));
    return '⛔ ' + (RULES[lim._a] || {}).label + '：使用过于频繁（' + lim.used + '/' + lim.max + ' 次/小时），已临时停止，请 ' + mins + ' 分钟后重试';
  }

  /* 文本长度校验（超限拦截，不截断） */
  function checkTextLength(action, text) {
    var limit = TEXT_LIMITS[action];
    if (!limit) return { ok: true };
    var n = (text || '').length;
    if (n > limit) {
      return {
        ok: false,
        msg: '输入过长：' + n + ' 字（上限 ' + limit + ' 字）。请分段处理，避免超出模型上下文限制。'
      };
    }
    return { ok: true, len: n };
  }

  /* 图片压缩：返回压缩后的 dataURL（Promise）；失败时 reject */
  function shrinkImage(file, maxDim, quality) {
    maxDim = maxDim || IMG_MAX_DIM;
    quality = quality == null ? IMG_QUALITY : quality;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w: cw, h: ch });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }

  /* LLM API 错误 → 友好中文提示 */
  function llmErrorMsg(res) {
    res = res || {};
    var data = res.data || {};
    var err = data.error || {};
    var msg = String(err.message || err.msg || (res.status ? 'HTTP ' + res.status : '未知错误'));
    var code = String(err.code || '');
    var status = res.status;
    if (status === 401 || status === 403 || /authentication|invalid.*api|invalid.*key|api.?key/i.test(code + ' ' + msg)) {
      return 'API Key 无效或已过期，请检查 LLM 设置中的 Key。';
    }
    if (status === 402 || /insufficient_quota|quota|balance|余额|计费|充值/i.test(msg)) {
      return '账户余额不足（配额耗尽）。请到对应平台充值，或更换 API Key。';
    }
    if (status === 429 || /rate.?limit|too many requests|请求过于频繁/i.test(msg)) {
      return '接口限流（请求过于频繁）。请稍等一会儿再试。';
    }
    if (status === 400 && /token|context|length|input|maximum context/i.test(msg)) {
      return '输入内容过长，超出模型上下文限制（400）。请缩短原文或分段处理。';
    }
    if (status === 400 && /json|parse|format/i.test(msg)) {
      return '模型返回格式异常（400）。已自动降级为提示词模式。';
    }
    if (status === 404 || /not.?found|endpoint|模型不存在/i.test(msg)) {
      return '接口地址或模型名不存在（404）。请检查 API Base 与模型名。';
    }
    return msg;
  }

  return {
    RULES: RULES,
    check: function (a) { var r = check(a); r._a = a; return r; },
    consume: consume,
    usage: usage,
    blockMessage: blockMessage,
    checkTextLength: checkTextLength,
    shrinkImage: shrinkImage,
    llmErrorMsg: llmErrorMsg
  };
})();
