/**
 * 运营计划生成器 — 数据分析板块专用模块
 * ------------------------------------------------------------
 * 功能：上传图片（抖音来客后台截图 / 经营日报）+ 文档（CSV/TXT/Excel 导出）
 *       → 自动分析 → 生成结构化「未来运营计划」（含投流预算分配）
 * 架构：
 *   1) LLM 视觉分析（OpenAI 兼容 API，可配置 Key）—— 优先
 *   2) 规则引擎降级（无 Key 时基于内置数据 + 用户参数自动生成）—— 保底
 * 隔离性：本模块自包含 IIFE，仅操作 #planGen 容器，不影响其他板块。
 */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var STORE_KEY = 'dycs_plan_llm';
  var DEFAULT_API = 'https://api.deepseek.com/v1/chat/completions';

  var STAGES = [
    { key: 's1', name: '第一阶段 · 冷启动蓄水', days: '第 1-14 天', tag: '测款蓄水' },
    { key: 's2', name: '第二阶段 · 放量起量', days: '第 15-45 天', tag: '放量爬坡' },
    { key: 's3', name: '第三阶段 · 优化收割', days: '第 46-90 天', tag: '优化收割' }
  ];

  /* ---------------- 状态 ---------------- */
  var attachedFile = null; // 当前待分析文件 {name, type, dataUrl, text}

  /* ---------------- 工具函数 ---------------- */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.className = 'toast show'; clearTimeout(t._tm); t._tm = setTimeout(function () { t.className = 'toast'; }, 2600); }
    else { alert(msg); }
  }

  function loadLLM() {
    try {
      var cfg = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { key: cfg.key || '', base: cfg.base || DEFAULT_API, model: cfg.model || 'deepseek-chat' };
    } catch (e) { return { key: '', base: DEFAULT_API, model: 'deepseek-chat' }; }
  }

  /* ---------------- 降级规则引擎（无 Key 保底） ---------------- */
  function buildPlanFromParams(p) {
    // 基于内置真实数据 + 用户输入的参数生成结构化计划
    var budget = Number(p.budget) || 30000;
    var targetGmv = Number(p.targetGmv) || 500000;
    var stores = Number(p.stores) || 5;

    var alloc = [
      { ch: '本地推（门店引流）', pct: 0.35, amt: Math.round(budget * 0.35), desc: '3-5km 围栏 + 男客定向，拉新到店' },
      { ch: '团购推广（核销转化）', pct: 0.30, amt: Math.round(budget * 0.30), desc: '主推 ¥98-128 主力款，冲核销率' },
      { ch: '达人探店（种草）', pct: 0.20, amt: Math.round(budget * 0.20), desc: '元帅/桃桃/魔都蜜探 4:3:3 组合' },
      { ch: '品牌信息流（曝光）', pct: 0.10, amt: Math.round(budget * 0.10), desc: '休闲娱乐标签人群，扩大声量' },
      { ch: '私域承接（到店转化）', pct: 0.05, amt: Math.round(budget * 0.05), desc: '到店核销后会员复购运营' }
    ];

    var roiTarget = (targetGmv / budget).toFixed(2);
    var cpa = Math.max(1, Math.round(budget * 0.30 / Math.max(1, Math.round(targetGmv / 120))));

    return {
      overview: {
        title: '足浴·SPA 门店未来 90 天运营计划',
        goal: '目标月 GMV ¥' + targetGmv.toLocaleString() + '，90 天核销率提升至 45%+，ROI 稳定 1:' + roiTarget,
        cycle: '执行周期：90 天 · 覆盖 ' + stores + ' 家门店',
        basis: '数据依据：男客 89.99% / 31-40 岁 43.33% / 主销价带 ¥98-147 占 60% / 上海 77%'
      },
      stages: [
        { name: STAGES[0].name, days: STAGES[0].days, tag: STAGES[0].tag,
          actions: ['上线 ¥39.9 引流款 + ¥98 主力款双套餐，锁定男客 25-45 岁定向',
            '首批合作元帅（89.57 指数）+ 桃桃逛魔都，产出 9-15 条探店视频',
            '本地推 3-5km 围栏投放，日预算按 35% 总预算 ÷ 30 天控制',
            '建立达人资源库与素材库，跑通「门头→环境→手法→价签」标准片型'],
          kpi: '核销率 ≥ 20% · 到店成本 ≤ ¥60/人 · 视频完播率 ≥ 18%' },
        { name: STAGES[1].name, days: STAGES[1].days, tag: STAGES[1].tag,
          actions: ['根据首周数据放大赢家素材：ROI>1:4 的素材提量 30%',
            '团购推广主投 ¥98-128 主力款，客单上探 15%',
            '拓展魔都蜜探等腰部达人，预算 4:3:3 复投',
            '开启老客 Lookalike 扩量，叠加江浙同城 17% 人群'],
          kpi: '月 GMV 达成 70% 目标 · ROI ≥ 1:5 · 新客占比 ≥ 40%' },
        { name: STAGES[2].name, days: STAGES[2].days, tag: STAGES[2].tag,
          actions: ['数据复盘：CPA/ROI/核销率三表对齐，砍掉低效素材',
            '私域承接：到店核销即引导会员入群（合规口径），提升复购',
            '高端款 ¥198 上线，承接资深中产 17.92% 客群',
            '沉淀 SOP：达人筛选清单 + 素材模板 + 定向包，复制到新店'],
          kpi: '月 GMV 达成 100% 目标 · ROI ≥ 1:6 · 复购率 ≥ 25%' }
      ],
      budget: {
        total: budget,
        rows: alloc,
        note: '分配依据：本地推承担拉新、团购推广承担转化、达人承担种草信任、信息流扩大声量，比例随数据周复盘调整。'
      },
      channel: [
        { ch: '抖音本地推', grp: '新锐白领 55.54% + 都市蓝领 13.66%', age: '31-40 岁为主', geo: '门店 3-5km 围栏', note: '第一消耗渠道，占预算 35%' },
        { ch: '抖音团购推广', grp: '品类兴趣 + 团购高潜人群', age: '25-45 岁', geo: '上海 77% + 江浙 17%', note: '主力转化渠道，占预算 30%' },
        { ch: '达人探店', grp: '休闲娱乐标签人群', age: '18-40 岁', geo: '同城', note: '信任背书渠道，占预算 20%' },
        { ch: '品牌信息流', grp: 'Lookalike 老客扩量', age: '22-50 岁', geo: '上海 + 江浙', note: '声量渠道，占预算 10%' }
      ],
      effect: [
        { name: '月 GMV 目标', val: '¥' + targetGmv.toLocaleString(), note: '分 3 阶段爬坡：30% → 70% → 100%' },
        { name: '预估 ROI', val: '1:' + roiTarget, note: '基准线 1:4，优质素材可到 1:6' },
        { name: '核销率目标', val: '45%+', note: '行业均值约 35%，男客效率型消费更易核销' },
        { name: '客单价', val: '¥98-128', note: '主力款上探后客单提升约 15%' }
      ],
      risks: [
        { lv: 'P0', txt: '合规红线：任何「疏通经络/排毒/治疗」等医疗功效词 → 素材直接返工，不计交付' },
        { lv: 'P0', txt: '价格不一致：视频口播价与抖音来客后台套餐价不一致 → 判 P1 违规，需全量改稿' },
        { lv: 'P1', txt: '定向过宽：精致妈妈/城镇中老年消耗 >2% 即无效流量，需收紧人群包' },
        { lv: 'P1', txt: '素材疲劳：单素材投放超 14 天 ROI 下滑，需按「9-15 条/波次」持续上新' },
        { lv: 'P2', txt: '达人风险：达人自带功效承诺口播需剪掉；授权文件须齐备' }
      ]
    };
  }

  /* ---------------- LLM 视觉分析（优先） ---------------- */
  function callVision(payload, cb) {
    var cfg = loadLLM();
    if (!cfg.key) { cb({ needKey: true }, null); return; }  // needKey 走错误通道
    if (typeof fetch !== 'function') { cb({ needKey: true }, null); return; } // 无 fetch 环境降级
    var model = cfg.model || 'deepseek-chat';

    var sys = '你是资深本地生活运营总监（抖音来客/美业SPA方向）。用户上传经营数据图片或文档，请分析并输出 JSON（不要 markdown 代码块），结构严格如下：'
      + '{"overview":{"title","goal","cycle","basis"},"stages":[{"name","days","tag","actions":[3-4条],"kpi"}x3],'
      + '"budget":{"total":数值,"rows":[{"ch","pct","amt","desc"}],"note"},"channel":[{"ch","grp","age","geo","note"}x4],'
      + '"effect":[{"name","val","note"}x4],"risks":[{"lv","txt"}x5]}'
      + '。要求：投流预算分配必须覆盖本地推/团购推广/达人/信息流/私域；分3阶段(冷启动/放量/优化)；数据引用用户上传内容中的真实数值，缺失时用行业经验值并标注"预估"。';

    var msgs = [{ role: 'system', content: sys }];
    if (attachedFile && attachedFile.isImage) {
      msgs.push({ role: 'user', content: [
        { type: 'text', text: '请分析这张经营数据图片（后台截图/日报），提取关键数据并生成未来运营计划：' },
        { type: 'image_url', image_url: { url: attachedFile.dataUrl } }
      ]});
    } else if (attachedFile && attachedFile.text) {
      msgs.push({ role: 'user', content: '请分析这份经营数据文档并生成未来运营计划：\n' + attachedFile.text.slice(0, 6000) });
    } else {
      msgs.push({ role: 'user', content: '请基于以下经营参数生成未来运营计划：月预算 ' + payload.budget + ' 元，目标月GMV ' + payload.targetGmv + ' 元，门店数 ' + payload.stores + '，品类：足浴SPA。' });
    }

    try {
      fetch(cfg.base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: model, messages: msgs, temperature: 0.4, max_tokens: 3000 })
      }).then(function (r) { return r.json(); }).then(function (d) {
        var txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!txt) { cb({ needKey: true, raw: d }, null); return; }
        txt = txt.replace(/^```(json)?/m, '').replace(/```$/m, '').trim();
        var j = JSON.parse(txt);
        cb(null, j);
      }).catch(function (e) { cb({ err: e.message }, null); });
    } catch (e) { cb({ err: e.message }, null); }
  }

  /* ---------------- 渲染：上传区 ---------------- */
  function render() {
    var el = document.getElementById('planGen');
    if (!el) return;

    var cfg = loadLLM();
    var html = '';
    html += '<div style="margin:20px 0 6px;padding-top:18px;border-top:1px solid var(--border)">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">';
    html += '<span style="font-size:15px">🚀</span>';
    html += '<span style="font-size:14px;font-weight:700;color:var(--text)">运营计划生成器</span>';
    html += '<span style="font-size:10px;color:var(--text-3);border:1px solid var(--border);border-radius:4px;padding:1px 6px">上传数据 → 自动生成未来 90 天计划（含投流预算）</span>';
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px">支持上传：后台截图（PNG/JPG）、经营文档（CSV/TXT/Excel 导出）。有 Key 走视觉 AI 分析，无 Key 自动用内置数据 + 参数生成。</div>';

    // 上传区
    html += '<div id="planDrop" style="border:1.5px dashed var(--border);border-radius:10px;padding:22px 16px;text-align:center;cursor:pointer;background:var(--bg);transition:border-color .2s">';
    html += '<div style="font-size:22px;margin-bottom:6px">📤</div>';
    html += '<div style="font-size:12.5px;color:var(--text-2)">点击或拖拽上传 <b>经营数据图片 / 文档</b></div>';
    html += '<div style="font-size:11px;color:var(--text-3);margin-top:4px" id="planFileInfo">未选择文件</div>';
    html += '</div>';

    // 参数区
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0">';
    html += '<div><label style="font-size:11px;color:var(--text-3)">月投放预算（元）</label><input id="planBudget" type="number" value="30000" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:#fff;font-size:12.5px;margin-top:3px"></div>';
    html += '<div><label style="font-size:11px;color:var(--text-3)">目标月 GMV（元）</label><input id="planGmv" type="number" value="500000" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:#fff;font-size:12.5px;margin-top:3px"></div>';
    html += '<div><label style="font-size:11px;color:var(--text-3)">门店数</label><input id="planStores" type="number" value="5" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:#fff;font-size:12.5px;margin-top:3px"></div>';
    html += '</div>';

    // LLM 配置（折叠）
    html += '<details style="margin-bottom:12px">';
    html += '<summary style="font-size:11.5px;color:var(--text-3);cursor:pointer">⚙️ LLM 视觉分析配置（可选，填了更精准；不填自动用内置数据）</summary>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:10px">';
    html += '<div><label style="font-size:11px;color:var(--text-3)">API Key</label><input id="planKey" type="password" value="' + esc(cfg.key) + '" placeholder="sk-..." style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;margin-top:3px"></div>';
    html += '<div><label style="font-size:11px;color:var(--text-3)">API Base</label><input id="planBase" type="text" value="' + esc(cfg.base) + '" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;margin-top:3px"></div>';
    html += '<div><label style="font-size:11px;color:var(--text-3)">模型</label><input id="planModel" type="text" value="' + esc(cfg.model) + '" placeholder="deepseek-chat" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;margin-top:3px"></div>';
    html += '</div></details>';

    html += '<button id="planRun" style="width:100%;padding:11px;border:0;border-radius:9px;background:var(--pri);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer">开始生成运营计划</button>';
    html += '<div style="font-size:11px;color:var(--text-3);margin-top:8px" id="planStatus"></div>';
    html += '<div id="planResult" style="margin-top:14px"></div>';
    html += '</div>';

    el.innerHTML = html;

    /* ------- 事件绑定 ------- */
    var drop = document.getElementById('planDrop');
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.csv,.txt,.md,.json';
    fileInput.style.display = 'none';
    el.appendChild(fileInput);

    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.style.borderColor = 'var(--pri)'; });
    drop.addEventListener('dragleave', function () { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () { if (this.files.length) handleFile(this.files[0]); });

    function handleFile(f) {
      var info = document.getElementById('planFileInfo');
      if (!f) return;
      var isImg = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
      attachedFile = { name: f.name, type: f.type, isImage: isImg };
      var r = new FileReader();
      if (isImg) {
        r.onload = function (ev) { attachedFile.dataUrl = ev.target.result; info.textContent = '✅ ' + f.name + '（图片，' + Math.round(f.size / 1024) + 'KB）'; };
        r.readAsDataURL(f);
      } else {
        r.onload = function (ev) { attachedFile.text = String(ev.target.result).slice(0, 8000); info.textContent = '✅ ' + f.name + '（文档，' + Math.round(f.size / 1024) + 'KB）'; };
        r.readAsText(f);
      }
    }

    document.getElementById('planRun').addEventListener('click', run);
  }

  /* ---------------- 生成 ---------------- */
  function run() {
    var status = document.getElementById('planStatus');
    var res = document.getElementById('planResult');
    var budget = document.getElementById('planBudget').value;
    var gmv = document.getElementById('planGmv').value;
    var stores = document.getElementById('planStores').value;

    // 保存 LLM 配置
    var cfg = loadLLM();
    var k = document.getElementById('planKey').value.trim();
    var b = document.getElementById('planBase').value.trim();
    var m = document.getElementById('planModel').value.trim();
    if (k) { localStorage.setItem(STORE_KEY, JSON.stringify({ key: k, base: b || DEFAULT_API, model: m || 'deepseek-chat' })); cfg = { key: k, base: b || DEFAULT_API, model: m || 'deepseek-chat' }; }

    if (!budget || !gmv || !stores) { toast('请填写预算 / GMV / 门店数'); return; }
    var params = { budget: budget, targetGmv: gmv, stores: stores };

    status.textContent = '⏳ 正在分析数据并生成计划…';
    res.innerHTML = '';

    var payload = { budget: budget, targetGmv: gmv, stores: stores };
    callVision(payload, function (err, plan) {
      if (err && err.needKey) {
        status.textContent = '未配置 API Key，已用内置数据 + 您的参数生成（如需 AI 精准识图，请填 Key）';
        plan = buildPlanFromParams(params);
      } else if (err) {
        status.textContent = 'AI 调用失败（' + (err.err || '未知') + '），已降级为规则引擎生成';
        plan = buildPlanFromParams(params);
      }
      renderResult(plan);
      status.textContent = plan.overview && plan.overview.title ? '✅ 计划已生成' : '✅ 已生成';
    });
  }

  /* ---------------- 渲染结果 ---------------- */
  function renderResult(plan) {
    var res = document.getElementById('planResult');
    if (!plan || typeof plan !== 'object') { res.innerHTML = '<div style="padding:16px;color:var(--danger);font-size:12.5px">生成失败，请重试</div>'; return; }
    plan.overview = plan.overview || {};
    plan.stages = plan.stages || [];
    plan.budget = plan.budget || {};
    plan.budget.rows = plan.budget.rows || [];
    plan.channel = plan.channel || [];
    plan.effect = plan.effect || [];
    plan.risks = plan.risks || [];

    var h = '';
    h += '<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">';

    /* 1. 概览 */
    h += '<div style="background:var(--pri);color:#fff;padding:14px 16px">';
    h += '<div style="font-size:15px;font-weight:700">' + esc(plan.overview.title || '未来运营计划') + '</div>';
    h += '<div style="font-size:12px;opacity:.9;margin-top:3px">' + esc(plan.overview.goal || '') + '</div>';
    h += '<div style="font-size:11px;opacity:.75;margin-top:3px">' + esc(plan.overview.cycle || '') + ' · ' + esc(plan.overview.basis || '') + '</div>';
    h += '</div>';

    h += '<div style="padding:16px">';

    /* 2. 分阶段执行 */
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px">📅 分阶段执行建议</div>';
    (plan.stages || []).forEach(function (s, i) {
      h += '<div style="padding:12px;margin-bottom:10px;border:1px solid var(--border);border-radius:9px;background:var(--bg)">';
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">';
      h += '<span style="background:var(--pri);color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:2px 8px">阶段 ' + (i + 1) + '</span>';
      h += '<span style="font-size:13px;font-weight:600;color:var(--text)">' + esc(s.name) + '</span>';
      h += '<span style="font-size:11px;color:var(--text-3)">' + esc(s.days || '') + '</span>';
      if (s.tag) h += '<span style="font-size:10px;color:var(--pri);border:1px solid var(--pri);border-radius:4px;padding:1px 6px">' + esc(s.tag) + '</span>';
      h += '</div>';
      h += '<ul style="margin:0;padding:0 0 0 16px">';
      (s.actions || []).forEach(function (a) { h += '<li style="font-size:12px;color:var(--text-2);line-height:1.8">' + esc(a) + '</li>'; });
      h += '</ul>';
      if (s.kpi) h += '<div style="font-size:11.5px;color:#2e7d32;margin-top:6px">🎯 ' + esc(s.kpi) + '</div>';
      h += '</div>';
    });

    /* 3. 投流预算分配 */
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin:16px 0 10px">💰 投流预算分配（月预算 ¥' + ((plan.budget && plan.budget.total) || 0).toLocaleString() + '）</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">';
    h += '<tr style="background:var(--bg);color:var(--text-3);font-size:11px"><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">渠道</th><th style="padding:6px 8px;border:1px solid var(--border)">占比</th><th style="padding:6px 8px;border:1px solid var(--border)">金额</th><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">用途</th></tr>';
    (plan.budget && plan.budget.rows || []).forEach(function (r) {
      h += '<tr><td style="padding:6px 8px;border:1px solid var(--border)">' + esc(r.ch) + '</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--pri);font-weight:600">' + Math.round((r.pct || 0) * 100) + '%</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border);text-align:center">¥' + (r.amt || 0).toLocaleString() + '</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border);color:var(--text-2)">' + esc(r.desc) + '</td></tr>';
    });
    h += '</table>';
    if (plan.budget && plan.budget.note) h += '<div style="font-size:11px;color:var(--text-3);margin-bottom:8px">' + esc(plan.budget.note) + '</div>';

    /* 4. 渠道与人群 */
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin:16px 0 10px">🎯 投放渠道与目标人群</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">';
    h += '<tr style="background:var(--bg);color:var(--text-3);font-size:11px"><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">渠道</th><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">人群包</th><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">年龄</th><th style="text-align:left;padding:6px 8px;border:1px solid var(--border)">地域</th></tr>';
    (plan.channel || []).forEach(function (c) {
      h += '<tr><td style="padding:6px 8px;border:1px solid var(--border);font-weight:600">' + esc(c.ch) + '</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(c.grp) + '</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(c.age) + '</td>';
      h += '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(c.geo) + '</td></tr>';
    });
    h += '</table>';

    /* 5. 预期效果 */
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin:16px 0 10px">📈 预期效果评估</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px">';
    (plan.effect || []).forEach(function (e) {
      h += '<div style="padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--bg)">';
      h += '<div style="font-size:11px;color:var(--text-3)">' + esc(e.name) + '</div>';
      h += '<div style="font-size:15px;font-weight:700;color:var(--pri);margin:2px 0">' + esc(e.val) + '</div>';
      h += '<div style="font-size:10.5px;color:var(--text-3)">' + esc(e.note) + '</div>';
      h += '</div>';
    });
    h += '</div>';

    /* 6. 风险提示 */
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin:16px 0 10px">⚠️ 风险提示</div>';
    (plan.risks || []).forEach(function (r) {
      var color = r.lv === 'P0' ? 'var(--danger)' : r.lv === 'P1' ? '#e65100' : '#c9a227';
      h += '<div style="display:flex;gap:8px;padding:8px 10px;margin-bottom:6px;border:1px solid var(--border);border-radius:7px;background:var(--bg)">';
      h += '<span style="flex:none;background:' + color + ';color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:1px 7px;height:fit-content">' + esc(r.lv) + '</span>';
      h += '<span style="font-size:12px;color:var(--text-2);line-height:1.6">' + esc(r.txt) + '</span></div>';
    });

    /* 复制按钮 */
    h += '<div style="margin-top:14px;display:flex;gap:8px">';
    h += '<button id="planCopy" style="flex:1;padding:9px;border:1px solid var(--pri);border-radius:8px;background:transparent;color:var(--pri);font-size:12.5px;font-weight:600;cursor:pointer">复制计划文本</button>';
    h += '</div>';

    h += '</div></div>';
    res.innerHTML = h;

    var cp = document.getElementById('planCopy');
    if (cp) cp.addEventListener('click', function () { copyPlan(plan); });
  }

  function copyPlan(plan) {
    var lines = [];
    lines.push('【' + plan.overview.title + '】');
    lines.push(plan.overview.goal + ' / ' + plan.overview.cycle);
    lines.push('');
    (plan.stages || []).forEach(function (s, i) {
      lines.push('阶段' + (i + 1) + ' ' + s.name + '（' + s.days + '）');
      (s.actions || []).forEach(function (a) { lines.push('  - ' + a); });
      if (s.kpi) lines.push('  KPI: ' + s.kpi);
      lines.push('');
    });
    lines.push('【投流预算分配】');
    (plan.budget && plan.budget.rows || []).forEach(function (r) {
      lines.push('  ' + r.ch + ' ' + Math.round((r.pct || 0) * 100) + '% ¥' + (r.amt || 0).toLocaleString());
    });
    lines.push('');
    lines.push('【预期效果】');
    (plan.effect || []).forEach(function (e) { lines.push('  ' + e.name + ': ' + e.val); });
    lines.push('');
    lines.push('【风险提示】');
    (plan.risks || []).forEach(function (r) { lines.push('  [' + r.lv + '] ' + r.txt); });

    var txt = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('已复制到剪贴板'); }, function () { fallbackCopy(txt); });
    } else { fallbackCopy(txt); }
  }

  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请手动选择文本'); }
    document.body.removeChild(ta);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
