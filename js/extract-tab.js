/* ===== 视频提取 Tab ===== */

/* 智能默认 API 地址：
   - 本工具由本地服务同源托管（http://127.0.0.1:8765/）→ 用相对路径 /api/extract
   - 离线单文件版（file://）或 GitHub Pages（https）→ 不再回退到 http://127.0.0.1:8765：
     服务端已拒绝 Origin: null，且 HTTPS 页面访问 HTTP 本地服务会被浏览器拦截。
     这两种情况请在页面里显式配置后端根地址，或由本地服务同源托管后再使用。 */
var EXTRACT_API = localStorage.getItem('extract_api') ||
  (window.DYCSCloud && DYCSCloud.root && DYCSCloud.root()
    ? DYCSCloud.root() + '/api/extract'
    : '/api/extract');

/* 全局 Toast（提取 Tab 使用；若其他脚本已定义则不覆盖） */
if (typeof window.showToast !== 'function') {
  window.showToast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  };
}

(function () {
  'use strict';

  /* ---- DOM ---- */
  var extractBtn      = document.getElementById('extractBtn');
  var extractCopyBtn  = document.getElementById('extractCopyBtn');
  var extractSaveBtn  = document.getElementById('extractSaveBtn');
  var extractOutput   = document.getElementById('extractOutput');
  var extractStatus   = document.getElementById('extractStatus');
  var extractResultMeta = document.getElementById('extractResultMeta');
  var extractResultTitle = document.getElementById('extractResultTitle');
  var extractLog      = document.getElementById('extractLog');
  var extractMode     = document.getElementById('extractMode');
  var extractUrlField = document.getElementById('extractUrlField');
  var extractFileField= document.getElementById('extractFileField');

  var currentExtractResult = null;

  /* ---- 设置面板（API 地址 + 测试连接 + 部署引导容器） ---- */
  var settingsHtml =
    '<div class="extract-settings">' +
      '<details>' +
        '<summary class="settings-summary">提取服务配置</summary>' +
        '<div class="settings-body">' +
          '<div class="field"><label>API 地址</label>' +
            '<input id="extractApiUrl" placeholder="http://127.0.0.1:8765/api/extract 或 https://你的后端域名/api/extract">' +
          '</div>' +
          '<div class="field"><label>后端访问密钥（X-API-Key）</label>' +
            '<input id="extractAccessKey" type="password" placeholder="服务端配置 API_KEYS/TENANT_KEYS 时填写">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
            '<button class="btn-sm" id="saveApiUrl">保存</button>' +
            '<button class="btn-sm" id="testApiUrl">测试连接</button>' +
            '<span class="hint" id="apiTestResult"></span>' +
          '</div>' +
          '<p class="hint" style="margin-top:8px">离线单文件版（file://）与 GitHub Pages 页面默认不连接任何后端，需在此显式填写后端地址；' +
          '本地使用推荐直接 <code>bash start-local.sh</code> 后访问 <code>http://127.0.0.1:8765</code>（页面与 API 同源，无需配置）。</p>' +
        '</div>' +
      '</details>' +
    '</div>';

  var extractGrid = document.querySelector('.extract-grid');
  if (extractGrid) {
    var settingsContainer = document.createElement('div');
    settingsContainer.className = 'extract-settings-wrap';
    settingsContainer.style.cssText = 'margin-bottom:14px;grid-column:1/-1';
    settingsContainer.innerHTML = settingsHtml;
    extractGrid.insertBefore(settingsContainer, extractGrid.firstChild);
  }

  /* ---- 部署引导 HTML（未连接时展示） ---- */
  function deployGuideHtml(reason) {
    return '<div class="extract-guide">' +
      '<div class="eg-head"><span>⚙️ 提取服务未连接</span><span class="eg-state eg-bad">● 需配置</span></div>' +
      '<div class="eg-body">' +
        (reason ? '<div class="eg-note" style="margin:8px 0 2px">' + escapeHtml(reason) + '</div>' : '') +
        '<div class="eg-step"><div class="eg-num">1</div><div class="eg-body-copy">' +
          '<b>本地使用（最简单，Windows/Mac 均可）</b>：在项目目录运行 <code>bash start-local.sh</code>（或 <code>.venv/bin/python server/app.py</code>），' +
          '然后用浏览器打开 <b><code>http://127.0.0.1:8765</code></b> —— 页面与提取 API 同源，链接和本地文件都能提取。' +
        '</div></div>' +
        '<div class="eg-step"><div class="eg-num">2</div><div class="eg-body-copy">' +
          '<b>自托管部署（按需自建，涉及第三方付费与密钥配置，请自行评估）</b>：仓库内提供 render.yaml 与 Dockerfile 作为参考配置，' +
          '部署前必须配置 <code>TENANT_KEYS</code>，否则服务会拒绝启动（fail closed）。' +
          '<div class="eg-note">云端部署下远程 URL 提取默认关闭，仅保留文件上传；且视频提取依赖的 ASR 组件较重，' +
          '云端实例的可用性未在本项目验证过。</div>' +
        '</div></div>' +
        '<div class="eg-step"><div class="eg-num">3</div><div class="eg-body-copy">' +
          '<b>已有云端/局域网服务</b>：在「提取服务配置」填入 API 地址 → <b>保存</b> → <b>测试连接</b>，显示「服务已连接」即可使用。' +
        '</div></div>' +
      '</div>' +
    '</div>';
  }

  function connectedHtml(d) {
    var ff = d && d.ffmpeg_ok ? 'ffmpeg ✅' : 'ffmpeg ❌';
    return '<span class="chip ok">提取服务已连接</span> <span class="hint">' +
      (d && d.status === 'running' ? ff + ' · 支持链接与本地文件' : '请确认服务地址正确') + '</span>';
  }

  /* ---- 保存 / 测试 API 地址 ---- */
  document.addEventListener('click', function (e) {
    if (e.target.id === 'saveApiUrl') {
      var val = document.getElementById('extractApiUrl').value.trim();
      var accessKeyEl = document.getElementById('extractAccessKey');
      var accessKey = accessKeyEl ? accessKeyEl.value.trim() : '';
      if (val) {
        localStorage.setItem('extract_api', val);
        localStorage.setItem('dycs_backend_url', val.replace(/\/+$/, '').replace(/\/(?:api\/)?extract$/i, ''));
        if (accessKey) localStorage.setItem('dycs_api_key', accessKey);
        else localStorage.removeItem('dycs_api_key');
        EXTRACT_API = val;
        showToast('后端配置已保存，正在检测连接…');
        checkServer();
      } else {
        showToast('请输入 API 地址');
      }
    } else if (e.target.id === 'testApiUrl') {
      var v = document.getElementById('extractApiUrl').value.trim();
      var testAccessKeyEl = document.getElementById('extractAccessKey');
      var testAccessKey = testAccessKeyEl ? testAccessKeyEl.value.trim() : '';
      if (v) {
        EXTRACT_API = v;
        localStorage.setItem('extract_api', v);
      }
      if (testAccessKey) localStorage.setItem('dycs_api_key', testAccessKey);
      var res = document.getElementById('apiTestResult');
      if (res) res.innerHTML = '<span class="hint">检测中…</span>';
      fetch(EXTRACT_API).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('json') === -1) throw new Error('非 JSON 响应');
        return r.json();
      }).then(function (d) {
        if (d && d.status === 'running') {
          if (res) res.innerHTML = '<span class="chip ok">✅ 连接成功（' + (d.ffmpeg_ok ? 'ffmpeg 就绪' : 'ffmpeg 缺失') + '）</span>';
          extractStatus.style.display = '';
          extractStatus.innerHTML = connectedHtml(d);
          showToast('连接成功');
        } else {
          if (res) res.innerHTML = '<span class="chip bad">❌ 服务响应异常</span>';
        }
      }).catch(function () {
        if (res) res.innerHTML = '<span class="chip bad">❌ 无法连接，请检查地址与服务状态</span>';
      });
    }
  });

  /* ---- 模式切换 ---- */
  extractMode && extractMode.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn || !btn.dataset.v) return;
    extractMode.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    btn.classList.add('on');
    var mode = btn.dataset.v;
    extractUrlField.style.display = mode === 'url' ? '' : 'none';
    extractFileField.style.display = mode === 'file' ? '' : 'none';
  });

  /* ---- 开始提取 ---- */
  extractBtn && extractBtn.addEventListener('click', startExtract);

  function startExtract() {
    var mode = extractMode ? (extractMode.querySelector('.on') || {}).dataset.v : 'url';
    var url = document.getElementById('extractUrl').value.trim();
    var fileInput = document.getElementById('extractFile');
    var engine = document.getElementById('extractEngine').value;
    var lang = document.getElementById('extractLang').value;
    var hotwords = document.getElementById('extractHotwords').value.trim();
    var brand = document.getElementById('extractBrand').value.trim();
    var area = document.getElementById('extractArea').value.trim();
    /* LLM 凭据由后端管理，前端只携带可选的后端访问密钥。 */

    /* 防滥用：用量限流（超限立即停止） */
    var lim = DSGuard.check('extract');
    if (!lim.ok) {
      showToast(DSGuard.blockMessage(lim));
      return;
    }

    if (mode === 'url' && !url) {
      showToast('请输入视频链接');
      return;
    }
    if (mode === 'file' && (!fileInput || !fileInput.files.length)) {
      showToast('请选择本地文件');
      return;
    }
    DSGuard.consume('extract');

    /* 重置 */
    extractOutput.innerHTML = '<div class="empty-state"><div class="empty-icon" style="font-size:24px">⏳</div><p>正在提取中……</p><span id="extractProgress">准备中</span></div>';
    extractCopyBtn.disabled = true;
    extractSaveBtn.disabled = true;
    extractLog.style.display = 'none';
    currentExtractResult = null;

    var payload = {
      engine: engine,
      language: lang,
      hotwords: hotwords || null,
      brand_name: brand || null,
      area_name: area || null,
      skip_llm: false,
    };

    if (mode === 'url') {
      payload.url = url;
    }

    doExtract(payload, fileInput);
  }

  function doExtract(payload, fileInput) {
    updateProgress('连接提取服务…');

    // 文件上传模式：把文件转成 base64 注入 payload
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      var file = fileInput.files[0];
      var ext = file.name.split('.').pop().toLowerCase();
      var reader = new FileReader();
      reader.onload = function (ev) {
        // readAsDataURL 返回 'data:video/mp4;base64,XXXX'，只取逗号后的纯 base64
        var raw = ev.target.result.split(',')[1];
        payload.file_path = 'base64:' + raw + '.ext:' + ext;
        sendExtract(payload);
      };
      reader.onerror = function () {
        showError('文件读取失败，请重新选择文件');
      };
      reader.readAsDataURL(file);
    } else {
      sendExtract(payload);
    }
  }

  function sendExtract(payload) {
    var headers = { 'Content-Type': 'application/json' };
    var backendKey = localStorage.getItem('dycs_api_key');
    if (backendKey) headers['X-API-Key'] = backendKey;
    fetch(EXTRACT_API, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (resp) {
      return resp.json().then(function (data) { return { status: resp.status, data: data }; });
    }).then(function (result) {
      if (result.status !== 200 || !result.data.ok) {
        var err = result.data.error || '提取失败（服务可能未启动）';
        showError(err);
        return;
      }

      currentExtractResult = result.data;
      saveExtractHistory(result.data, payload);
      showResult(result.data);
    }).catch(function (err) {
      showError('无法连接到提取服务：' + err.message + '\n\n' +
        '请在「提取服务配置」中检查 API 地址。\n' +
        '· 本地：运行 bash start-local.sh 后访问 http://127.0.0.1:8765\n' +
        '· 云端：按引导第 2 步一键部署 Render 后填入 https://xxx.onrender.com/extract');
    });
  }

  function updateProgress(msg) {
    var el = document.getElementById('extractProgress');
    if (el) el.textContent = msg;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function showError(msg) {
    extractOutput.innerHTML =
      '<div class="empty-state" style="color:var(--danger);border-color:var(--danger)">' +
      '<div class="empty-icon" style="font-size:28px;color:var(--danger)">!</div>' +
      '<p>提取失败</p>' +
      '<span style="font-size:12px;white-space:pre-wrap;color:var(--text-2)">' +
      escapeHtml(msg) + '</span></div>';
    extractCopyBtn.disabled = true;
    extractSaveBtn.disabled = true;
  }

  function saveExtractHistory(data, requestPayload) {
    if (!window.DYCSCloud || !data) return;
    var source = requestPayload.url || '本地文件';
    DYCSCloud.save('extract', '视频提取 · ' + source, {
      request: {
        source: source,
        engine: requestPayload.engine,
        language: requestPayload.language,
        brand_name: requestPayload.brand_name,
        area_name: requestPayload.area_name
      },
      result: data
    }).catch(function () { /* 云端不可用不影响当前结果 */ });
  }

  function showResult(data) {
    var method = data.meta && data.meta.extraction_method || 'unknown';
    var engine = data.meta && data.meta.asr_engine || data.source || 'N/A';
    var methodLabel = method === 'subtitle' ? '字幕提取' : '语音识别';
    var wordCount = data.text ? data.text.length : 0;

    extractResultTitle.textContent = '提取结果';
    extractResultMeta.innerHTML =
      '<span class="chip ok">' + methodLabel + '</span>' +
      (engine !== 'N/A' ? '<span class="chip cyan">引擎：' + engine + '</span>' : '') +
      '<span class="chip">' + wordCount + ' 字</span>';

    var fullText = data.text || '(空)';

    var html = '<div class="variant">';
    html += '<div class="v-head"><span class="v-badge">文</span><span class="v-title">提取文案</span>';
    html += '<span class="chip">' + methodLabel + '</span></div>';
    html += '<div class="v-body">';

    /* 时间轴（如果有字幕 items） */
    if (data.subtitle_items && data.subtitle_items.length) {
      html += '<div class="block"><div class="block-label">字幕时间轴</div>';
      data.subtitle_items.forEach(function (it) {
        html += '<div class="script-line"><span class="tcode">' + escapeHtml(it.time) + '</span><span>' + escapeHtml(it.text) + '</span></div>';
      });
      html += '</div>';
    }

    /* 全文 */
    html += '<div class="block"><div class="block-label">完整文案</div>';
    html += '<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.85;padding:12px;background:var(--beige);border-radius:7px;border:1px solid var(--line)">' + escapeHtml(fullText) + '</div></div>';

    /* 后处理日志 */
    if (data.post_process && data.post_process.length) {
      html += '<div class="block"><div class="block-label">后处理管线</div>';
      data.post_process.forEach(function (step) {
        var status = step.skipped ? 'skipped' : (step.ok ? 'ok' : 'fail');
        var cls = status === 'skipped' ? 'mid' : (status === 'ok' ? 'ok' : 'bad');
        html += '<span class="chip ' + cls + '">' + (step.layer != null ? step.layer + '. ' : '') + (step.name || '步骤') + (step.skipped ? ' (' + step.skipped + ')' : '') + '</span> ';
      });
      html += '</div>';
    }

    html += '</div>';
    html += '<div class="v-actions"><button class="btn-sm js-extract-copy-inline">复制文案</button></div>';
    html += '</div>';

    extractOutput.innerHTML = html;
    var inlineBtn = extractOutput.querySelector('.js-extract-copy-inline');
    if (inlineBtn) {
      inlineBtn.addEventListener('click', function () {
        copyClipboard(fullText, '已复制');
      });
    }
    extractCopyBtn.disabled = false;
    extractSaveBtn.disabled = false;
  }

  function copyClipboard(text, okMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast(okMsg || '已复制'); })
        .catch(function () { fallbackCopy(text, okMsg); });
    } else { fallbackCopy(text, okMsg); }
  }
  function fallbackCopy(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast(okMsg || '已复制'); }
    catch (e) { showToast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ---- 复制 ---- */
  extractCopyBtn && extractCopyBtn.addEventListener('click', function () {
    if (!currentExtractResult) return;
    copyClipboard(currentExtractResult.text || '', '已复制到剪贴板');
  });

  /* ---- 导出 Markdown ---- */
  extractSaveBtn && extractSaveBtn.addEventListener('click', function () {
    if (!currentExtractResult) return;
    var data = currentExtractResult;
    var md = '# 视频文案提取结果\n\n';
    md += '- 提取方式：' + (data.meta && data.meta.extraction_method || 'unknown') + '\n';
    md += '- ASR 引擎：' + (data.meta && data.meta.asr_engine || data.source || 'N/A') + '\n';
    md += '- 字数：' + (data.text ? data.text.length : 0) + '\n\n';

    if (data.subtitle_items && data.subtitle_items.length) {
      md += '## 字幕时间轴\n\n';
      data.subtitle_items.forEach(function (it) {
        md += '```' + '\n' + it.time + '\n' + it.text + '\n```\n\n';
      });
    }

    md += '## 完整文案\n\n' + data.text + '\n';

    if (data.post_process) {
      md += '\n## 后处理管线\n\n';
      data.post_process.forEach(function (step) {
        var status = step.skipped ? '⏭️' : (step.ok ? '✅' : '❌');
        md += status + ' Layer ' + step.layer + ': ' + step.name + (step.skipped ? ' — ' + step.skipped : '') + '\n';
      });
    }

    var blob = new Blob([md], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '视频文案提取_' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
  });

  /* ---- 服务状态检测 + 部署引导 ---- */
  function checkServer() {
    if (!extractStatus) return;
    var isHttps = location.protocol === 'https:';
    var isLocalApi = /^http:\/\/127\.0\.0\.1/.test(EXTRACT_API) || EXTRACT_API.charAt(0) === '/';

    if (isHttps && isLocalApi) {
      /* GitHub Pages 线上 + 本地 API：无法直连，展示部署引导 */
      extractStatus.style.display = '';
      extractStatus.innerHTML =
        '<span class="chip bad">⚠️ HTTPS 页面无法访问本地服务</span> ' +
        '<span class="hint">线上站点无法连接你电脑上的本地服务，请按下方引导部署云端服务，或用本地方式使用完整工具。</span>' +
        deployGuideHtml('当前页面是 HTTPS（GitHub Pages），浏览器禁止访问 http://127.0.0.1 本地服务。');
      return;
    }

    /* 其余情况（本地页面 / 已配置云端地址）：探测服务 */
    fetch(EXTRACT_API).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') === -1) throw new Error('非 JSON 响应');
      return r.json();
    }).then(function (d) {
      if (d && d.status === 'running') {
        extractStatus.style.display = '';
        extractStatus.innerHTML = connectedHtml(d);
      } else {
        extractStatus.style.display = '';
        extractStatus.innerHTML = '<span class="chip bad">提取服务未连接</span> <span class="hint">请检查「提取服务配置」中的 API 地址</span>' +
          deployGuideHtml('');
      }
    }).catch(function () {
      extractStatus.style.display = '';
      extractStatus.innerHTML = '<span class="chip bad">提取服务未连接</span> <span class="hint">请检查「提取服务配置」中的 API 地址</span>' +
        deployGuideHtml('无法访问 ' + EXTRACT_API.replace(/^https?:\/\//, '') + '，服务可能未启动或地址不正确。');
    });
  }

  /* 同步 API 地址输入框 */
  var apiInput = document.getElementById('extractApiUrl');
  if (apiInput) apiInput.value = EXTRACT_API;
  var accessKeyInput = document.getElementById('extractAccessKey');
  if (accessKeyInput) accessKeyInput.value = localStorage.getItem('dycs_api_key') || '';

  /* 初始化时检测一次 */
  checkServer();

})();
