/* 交互层 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var lastResults = [];

  /* ---------- Toast ---------- */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function copyText(text, okMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg || '已复制'); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- 页签 ---------- */
  $('tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history') renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- 分段选择器 ---------- */
  ['goal', 'duration', 'style', 'count'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      this.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    });
  });
  function segVal(id) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset.v : '';
  }

  /* ---------- 初始化下拉 ---------- */
  (function initSelects() {
    var cat = $('category');
    Object.keys(DS.categories).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = DS.categories[k].name;
      cat.appendChild(o);
    });
    var hk = $('hookType');
    Object.keys(DS.hooks).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = DS.hooks[k].label + ' · ' + DS.hooks[k].desc;
      hk.appendChild(o);
    });
    cat.addEventListener('change', syncCat);
    syncCat();
  })();

  function syncCat() {
    var c = DS.categories[$('category').value];
    var lvMap = { low: '合规风险较低', mid: '合规风险中等', high: '合规风险高，重点自查' };
    $('catRisk').innerHTML = '<b style="color:var(--warn)">' + lvMap[c.riskLevel] + '：</b>' + c.riskNote;
    ['entryItem', 'mainItem', 'entryPrice', 'mainPrice', 'origPrice'].forEach(function (f) {
      $(f).placeholder = c[f === 'origPrice' ? 'origPrice' : f];
    });
  }

  /* ---------- 读取配置 ---------- */
  function readCfg() {
    return {
      category: $('category').value,
      goal: segVal('goal'),
      duration: segVal('duration'),
      style: segVal('style'),
      hookType: $('hookType').value,
      brand: $('brand').value.trim(),
      area: $('area').value.trim(),
      storeCount: $('storeCount').value.trim(),
      deadline: $('deadline').value.trim(),
      entryItem: $('entryItem').value.trim(),
      entryPrice: $('entryPrice').value.trim(),
      mainItem: $('mainItem').value.trim(),
      mainPrice: $('mainPrice').value.trim(),
      origPrice: $('origPrice').value.trim(),
      gift: $('gift').value.trim()
    };
  }

  /* ---------- 生成 ---------- */
  $('genBtn').addEventListener('click', function () {
    var cfg = readCfg();
    var n = parseInt(segVal('count'), 10) || 3;
    lastResults = [];
    for (var i = 0; i < n; i++) lastResults.push(DS.generate(cfg, i));
    renderResults(cfg, lastResults);
    saveHistory(cfg, lastResults);
    toast('已生成 ' + n + ' 条变体');
  });

  $('demoBtn').addEventListener('click', function () {
    $('category').value = 'hair'; syncCat();
    $('brand').value = '星悦造型';
    $('area').value = '静安大悦城';
    $('storeCount').value = '100';
    $('deadline').value = '8月10日-16日有效';
    $('entryItem').value = '洗剪吹体验';
    $('entryPrice').value = '9.9';
    $('mainItem').value = '深层护理套餐';
    $('mainPrice').value = '39.9';
    $('origPrice').value = '198';
    $('gift').value = '肩颈按摩5分钟';
    toast('示例已载入，点击生成');
  });

  function renderResults(cfg, list) {
    var goalMap = { groupbuy: '团购核销', traffic: '门店引流', brand: '品牌曝光' };
    var styleMap = { oral: '口语化', promo: '促销感', review: '测评探店', story: '剧情反转' };
    $('resultMeta').innerHTML =
      '<span class="chip cyan">' + DS.categories[cfg.category].name + '</span>' +
      '<span class="chip">' + goalMap[cfg.goal] + '</span>' +
      '<span class="chip">' + DS.durations[cfg.duration].label + '</span>' +
      '<span class="chip">' + styleMap[cfg.style] + '</span>' +
      '<span class="chip">共 ' + list.length + ' 条变体</span>';
    $('exportBtn').disabled = false;
    $('copyAllBtn').disabled = false;

    var html = list.map(function (r) { return variantHTML(r); }).join('');
    $('output').className = '';
    $('output').innerHTML = html;
    bindVariantActions();
  }

  function variantHTML(r) {
    var risk = r.risk;
    var riskChip = risk.p0 > 0
      ? '<span class="chip bad">红线 P0×' + risk.p0 + '</span>'
      : (risk.p1 > 0 ? '<span class="chip mid">风险 P1×' + risk.p1 + '</span>' : '<span class="chip ok">合规自检通过</span>');

    var lines = r.rows.map(function (row) {
      return '<div class="script-line"><span class="tcode">' + row.time + '</span><span>' + DS.esc(row.line) + '</span></div>';
    }).join('');

    var shots = r.rows.map(function (row) {
      return '<tr><td class="c-time">' + row.time + '</td><td>' + DS.esc(row.shot) +
        '</td><td class="c-sub">' + DS.esc(row.subtitle) + '</td><td class="c-sub">' + DS.esc(row.note) + '</td></tr>';
    }).join('');

    var riskBox = '';
    if (risk.hits.length) {
      var uniq = DS.uniqueHits(risk.hits);
      riskBox = '<div class="risk-box fail"><b>合规提示（' + uniq.length + ' 项）</b>' +
        uniq.map(function (h) {
          return '<div class="risk-item"><span class="lv ' + h.level + '">' + h.level + '</span><span><b>' +
            DS.esc(h.word) + '</b>（' + h.cat + '）— ' + DS.esc(h.fix) + '</span></div>';
        }).join('') + '</div>';
    } else {
      riskBox = '<div class="risk-box pass">✓ 未检出绝对化用语、医疗功效宣称、站外引流等风险点。投放前仍需核对价格与期限与后台一致。</div>';
    }

    return '<article class="variant" data-v="' + r.variant + '">' +
      '<div class="v-head"><div class="v-badge">' + r.variant + '</div>' +
      '<div class="v-title">变体 ' + r.variant + ' · ' + r.hookType +
      '<div class="v-meta">' + r.durationLabel + ' · 约 ' + r.wordCount + ' 字</div></div>' +
      riskChip + '</div>' +
      '<div class="v-body">' +
      '<div class="block"><div class="block-label">口播脚本（含时间码）</div>' + lines + '</div>' +
      '<div class="block"><div class="block-label">分镜与字幕</div>' +
      '<table class="shots"><thead><tr><th>时间</th><th>画面内容</th><th>关键字幕</th><th>拍摄要点</th></tr></thead><tbody>' +
      shots + '</tbody></table></div>' +
      '<div class="block"><div class="block-label">发布信息</div>' +
      '<div class="kv"><b>标题：</b><span>' + DS.esc(r.title) + '</span></div>' +
      '<div class="kv"><b>话题：</b><span class="topics-line">' + DS.esc(r.topics) + '</span></div>' +
      '<div class="kv"><b>评论区置顶：</b><span>' + DS.esc(r.comment) + '</span></div>' +
      (r.reviewLine ? '<div class="kv kv-review"><b>顾客评价引用（选插入）：</b><span>' + DS.esc(r.reviewLine) + '</span></div>' : '') +
      '</div>' +
      (r.certLabels ? '<div class="block block-cert"><div class="block-label">📌 视频自证标签（建议角标/字幕贴出，平台优先分发）</div>' +
      '<div class="cert-tags">' + r.certLabels.map(function (c) { return '<span class="cert-tag">' + DS.esc(c) + '</span>'; }).join('') + '</div></div>' : '') +
      (r.refundLine ? '<div class="block block-refund"><div class="block-label">🔒 核销与退改保障话术</div><div class="kv"><span>' + DS.esc(r.refundLine) + '</span></div></div>' : '') +
      riskBox + '</div>' +
      '<div class="v-actions">' +
      '<button class="btn-sm act-copy-script">复制口播</button>' +
      '<button class="btn-sm act-copy-all">复制整条</button>' +
      '<button class="btn-sm act-to-check">送去红线自检</button>' +
      '</div></article>';
  }

  function bindVariantActions() {
    document.querySelectorAll('.variant').forEach(function (el, i) {
      var r = lastResults[i];
      el.querySelector('.act-copy-script').onclick = function () { copyText(r.script, '口播文案已复制'); };
      el.querySelector('.act-copy-all').onclick = function () { copyText(toMarkdown([r]), '整条内容已复制'); };
      el.querySelector('.act-to-check').onclick = function () {
        $('checkInput').value = r.script + '\n' + r.title + '\n' + r.comment;
        document.querySelector('.tab[data-tab="check"]').click();
        runCheck();
      };
    });
  }

  /* ---------- 导出 ---------- */
  function toMarkdown(list) {
    return list.map(function (r) {
      var s = '## 变体 ' + r.variant + '（' + r.hookType + ' · ' + r.durationLabel + '）\n\n';
      s += '**标题**：' + r.title + '\n\n**话题**：' + r.topics + '\n\n**评论区置顶**：' + r.comment + '\n\n';
      s += '### 口播脚本\n\n';
      r.rows.forEach(function (row) { s += '- （' + row.time + '）' + row.line + '\n'; });
      s += '\n### 分镜表\n\n| 时间 | 画面内容 | 关键字幕 | 拍摄要点 |\n|---|---|---|---|\n';
      r.rows.forEach(function (row) {
        s += '| ' + row.time + ' | ' + row.shot + ' | ' + row.subtitle + ' | ' + row.note + ' |\n';
      });
      s += '\n### 合规自检\n\n';
      if (r.risk.hits.length) {
        DS.uniqueHits(r.risk.hits).forEach(function (h) {
          s += '- [' + h.level + '] ' + h.word + '（' + h.cat + '）：' + h.fix + '\n';
        });
      } else { s += '- 未检出风险词，投放前核对价格与期限与后台一致。\n'; }
      return s + '\n---\n';
    }).join('\n');
  }

  $('copyAllBtn').addEventListener('click', function () {
    copyText(toMarkdown(lastResults), '全部变体已复制');
  });

  $('exportBtn').addEventListener('click', function () {
    var head = '# 抖音来客投流文案交付单\n\n生成时间：' + new Date().toLocaleString('zh-CN') + '\n\n';
    var blob = new Blob([head + toMarkdown(lastResults)], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '投流文案交付单_' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出 Markdown');
  });

  /* ---------- 红线自检 ---------- */
  function runCheck() {
    var text = $('checkInput').value;
    if (!text.trim()) {
      $('checkResult').innerHTML = '';
      $('checkScore').textContent = '';
      return;
    }
    var res = DS.scan(text);
    var uniq = DS.uniqueHits(res.hits);
    $('checkScore').innerHTML = res.p0 > 0
      ? '<span style="color:var(--danger)">P0 高压线 ' + res.p0 + ' 处 · 必须返工</span>'
      : (res.p1 > 0 ? '<span style="color:var(--warn)">P1 风险 ' + res.p1 + ' 处 · 建议修改</span>'
        : '<span style="color:var(--ok)">✓ 未检出 P0/P1 风险</span>');

    var html = '<div class="preview">' + DS.highlight(text, res.hits) + '</div>';
    if (uniq.length) {
      html += '<div class="risk-box fail"><b>共命中 ' + uniq.length + ' 类风险词</b>' +
        uniq.map(function (h) {
          return '<div class="risk-item"><span class="lv ' + h.level + '">' + h.level + '</span><span><b>' +
            DS.esc(h.word) + '</b>（' + h.cat + '）— ' + DS.esc(h.fix) + '</span></div>';
        }).join('') + '</div>';
    } else {
      html += '<div class="risk-box pass">✓ 未检出风险词。仍需人工确认：价格与后台一致、限时有真实期限、出镜授权齐备、BGM 商用授权。</div>';
    }
    $('checkResult').innerHTML = html;
  }
  $('checkInput').addEventListener('input', runCheck);
  $('clearCheck').addEventListener('click', function () {
    $('checkInput').value = ''; runCheck();
  });
  $('purifyBtn').addEventListener('click', function () {
    var r = DS.purify($('checkInput').value);
    if (!r.changed.length) { toast('没有可自动替换的词'); return; }
    $('checkInput').value = r.text;
    runCheck();
    toast('已替换 ' + r.changed.length + ' 处：' + r.changed.slice(0, 2).join('；'));
  });

  /* ---------- Brief 速查 ---------- */
  (function renderBrief() {
    var html = DS.briefSections.map(function (s) {
      var body = '';
      if (s.type === 'table') {
        body = '<table class="shots"><thead><tr>' + s.head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
          '</tr></thead><tbody>' + s.rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>';
      } else if (s.type === 'list') {
        body = '<ul>' + s.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
      } else if (s.type === 'risk') {
        body = s.items.map(function (i) {
          return '<div class="risk-item"><span class="lv ' + i[0] + '">' + i[0] + '</span><span><b>' + i[1] + '</b> — ' + i[2] + '</span></div>';
        }).join('');
      }
      return '<div class="brief-sec"><h3>' + s.title + '</h3>' + body +
        '<div class="brief-note">' + s.note + '</div></div>';
    }).join('');
    $('briefContent').innerHTML = html;
  })();

  /* ---------- Checklist ---------- */
  var CL_KEY = 'dycs_checklist';
  function renderChecklist() {
    var saved = JSON.parse(localStorage.getItem(CL_KEY) || '{}');
    $('checklist').innerHTML = DS.checklist.map(function (item, i) {
      var on = !!saved[i];
      return '<label class="cl-item' + (on ? ' done' : '') + '"><input type="checkbox" data-i="' + i + '"' +
        (on ? ' checked' : '') + '><span>' + item + '</span></label>';
    }).join('');
    updateClScore();
    $('checklist').querySelectorAll('input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var s = JSON.parse(localStorage.getItem(CL_KEY) || '{}');
        s[this.dataset.i] = this.checked;
        localStorage.setItem(CL_KEY, JSON.stringify(s));
        this.closest('.cl-item').classList.toggle('done', this.checked);
        updateClScore();
      });
    });
  }
  function updateClScore() {
    var s = JSON.parse(localStorage.getItem(CL_KEY) || '{}');
    var done = Object.keys(s).filter(function (k) { return s[k]; }).length;
    $('clScore').innerHTML = '已完成 ' + done + ' / ' + DS.checklist.length +
      (done === DS.checklist.length ? ' <span style="color:var(--ok)">✓ 可交付</span>' : '');
  }
  $('resetCl').addEventListener('click', function () {
    localStorage.removeItem(CL_KEY); renderChecklist(); toast('已重置');
  });
  renderChecklist();

  /* ---------- 历史 ---------- */
  var H_KEY = 'dycs_history';
  function saveHistory(cfg, list) {
    var h = JSON.parse(localStorage.getItem(H_KEY) || '[]');
    h.unshift({
      time: new Date().toLocaleString('zh-CN'),
      cat: DS.categories[cfg.category].name,
      brand: cfg.brand || '未填品牌',
      count: list.length,
      md: toMarkdown(list)
    });
    localStorage.setItem(H_KEY, JSON.stringify(h.slice(0, 20)));
  }
  function renderHistory() {
    var h = JSON.parse(localStorage.getItem(H_KEY) || '[]');
    if (!h.length) {
      $('historyList').innerHTML = '<p class="hint">暂无记录。</p>';
      return;
    }
    $('historyList').innerHTML = h.map(function (x, i) {
      return '<div class="hist-item"><div><h4>' + x.brand + ' · ' + x.cat + '</h4>' +
        '<p>' + x.time + ' · ' + x.count + ' 条变体</p></div>' +
        '<button class="btn-sm" data-h="' + i + '">复制内容</button></div>';
    }).join('');
    $('historyList').querySelectorAll('button[data-h]').forEach(function (b) {
      b.onclick = function () { copyText(h[this.dataset.h].md, '已复制该次生成结果'); };
    });
  }
  $('clearHistory').addEventListener('click', function () {
    localStorage.removeItem(H_KEY); renderHistory(); toast('历史已清空');
  });
})();
