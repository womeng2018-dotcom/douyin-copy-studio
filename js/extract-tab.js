/* ===== 视频提取 Tab ===== */

/* 智能默认 API 地址：
   - 本工具由本地服务同源托管（http://127.0.0.1:8765/）→ 用相对路径 /extract
   - GitHub Pages（https://...github.io）→ 保持绝对地址，提示需配置云端 HTTPS 或本地访问 */
var EXTRACT_API = localStorage.getItem('extract_api') ||
  (location.protocol === 'http:' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? location.origin + '/extract'
    : 'http://127.0.0.1:8765/extract');

(function () {
  'use strict';

  /* ---- 设置面板（API 地址） ---- */
  var settingsHtml =
    '<div class="extract-settings">' +
      '<details>' +
        '<summary class="settings-summary">提取服务配置</summary>' +
        '<div class="settings-body">' +
          '<div class="field"><label>API 地址</label>' +
            '<input id="extractApiUrl" placeholder="http://127.0.0.1:8765/extract">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
            '<button class="btn-sm" id="saveApiUrl">保存</button>' +
            '<span class="hint">修改后需刷新页面</span>' +
          '</div>' +
          '<p class="hint" style="margin-top:8px">推荐：本地运行 <code>bash start-local.sh</code> 后直接访问 <code>http://127.0.0.1:8765</code>（页面与 API 同源，无需配置）；GitHub Pages 线上访问需填云端 HTTPS 地址</p>' +
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

  /* 保存 API 地址 */
  document.addEventListener('click', function (e) {
    if (e.target.id === 'saveApiUrl') {
      var val = document.getElementById('extractApiUrl').value.trim();
      if (val) {
        localStorage.setItem('extract_api', val);
        EXTRACT_API = val;
        showToast('API 地址已保存，请刷新页面生效');
      }
    }
  });

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
    var apiKey = document.getElementById('extractApiKey').value.trim();
    var apiBase = document.getElementById('extractApiBase').value.trim() || 'https://token.sensenova.cn/v1';
    var llmModel = document.getElementById('extractLlmModel').value.trim() || 'deepseek-v4-flash';

    if (mode === 'url' && !url) {
      showToast('请输入视频链接');
      return;
    }
    if (mode === 'file' && (!fileInput || !fileInput.files.length)) {
      showToast('请选择本地文件');
      return;
    }

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
      api_key: apiKey || null,
      api_base: apiBase || null,
      llm_model: llmModel || null,
      skip_llm: !apiKey,
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
    fetch(EXTRACT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      showResult(result.data);
    }).catch(function (err) {
      showError('无法连接到提取服务：' + err.message + '\n\n请确认本地已启动服务：\npython server/video-extract.py --serve --port 8765');
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
        html += '<span class="chip ' + cls + '">' + step.layer + '. ' + step.name + (step.skipped ? ' (' + step.skipped + ')' : '') + '</span> ';
      });
      html += '</div>';
    }

    html += '</div>';
    html += '<div class="v-actions"><button class="btn-sm" onclick="navigator.clipboard.writeText(' + JSON.stringify(fullText) + ');showToast(\'已复制\')">复制文案</button></div>';
    html += '</div>';

    extractOutput.innerHTML = html;
    extractCopyBtn.disabled = false;
    extractSaveBtn.disabled = false;
  }

  /* ---- 复制 ---- */
  extractCopyBtn && extractCopyBtn.addEventListener('click', function () {
    if (!currentExtractResult) return;
    navigator.clipboard.writeText(currentExtractResult.text || '').then(function () {
      showToast('已复制到剪贴板');
    });
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

  /* ---- 启动检测 ---- */
  (function checkServer() {
    var isHttps = location.protocol === 'https:';
    var isLocalPage = location.protocol === 'http:' &&
      (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
    var isLocalApi = /^http:\/\/127\.0\.0\.1/.test(EXTRACT_API) || EXTRACT_API.charAt(0) === '/';

    if (isHttps && isLocalApi) {
      extractStatus.style.display = '';
      extractStatus.innerHTML = '<span class="chip bad">⚠️ HTTPS 页面无法访问本地服务</span> ' +
        '<span class="hint">当前页面是 HTTPS（GitHub Pages），浏览器禁止访问 http://127.0.0.1 本地服务。<br>' +
        '<b>本地使用方式：</b>先启动本地服务 <code>bash start-local.sh</code>，然后用浏览器打开 <b><a href="http://127.0.0.1:8765" style="color:inherit">http://127.0.0.1:8765</a></b> 使用完整工具（页面与提取 API 同源，不受此限制）。<br>' +
        '云端使用方式：把「API 地址」配置为已部署的云端 HTTPS 地址（如 Render）并保存。</span>';
      return;
    }

    if (isLocalPage && isLocalApi) {
      extractStatus.style.display = '';
      extractStatus.innerHTML = '<span class="chip ok">同源本地模式：提取服务直接可用</span> <span class="hint">页面与 API 同源（' + location.origin + '），无需跨域</span>';
      return;
    }

    fetch(EXTRACT_API).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.status === 'running') {
        extractStatus.style.display = '';
        extractStatus.innerHTML = '<span class="chip ok">提取服务已连接</span> <span class="hint">ffmpeg ' + (d.ffmpeg_ok ? '✅' : '❌') + '</span>';
      } else {
        extractStatus.style.display = '';
        extractStatus.innerHTML = '<span class="chip bad">提取服务未连接</span> <span class="hint">请先启动：python server/video-extract.py --serve</span>';
      }
    }).catch(function () {
      extractStatus.style.display = '';
      extractStatus.innerHTML = '<span class="chip bad">提取服务未连接</span> <span class="hint">请先启动：bash start-local.sh（自动开启页面+API 服务）</span>';
    });
  })();

})();