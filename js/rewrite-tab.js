/* ===== 文案改写 Tab · Humanizer-zh / ai-copywriter / CopyGPT ===== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function showToast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function copyText(text, okMsg) {
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

  /* ---------- LLM 设置 ---------- */
  var LLM_KEY = 'dycs_rw_llm';
  var PRESETS = {
    deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  };
  function loadLLM() {
    try { return JSON.parse(localStorage.getItem(LLM_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveLLM(cfg) { localStorage.setItem(LLM_KEY, JSON.stringify(cfg)); }

  function fillLLMSettings() {
    var cfg = loadLLM();
    var prov = $('rwLlmProvider');
    if (cfg.provider) prov.value = cfg.provider;
    $('rwLlmKey').value = cfg.key || '';
    if (cfg.base) $('rwLlmBase').value = cfg.base;
    if (cfg.model) $('rwLlmModel').value = cfg.model;
    if (cfg.key) $('rwLlmStatus').innerHTML = '<span class="chip ok">已配置</span>';
  }
  function onProviderChange() {
    var p = $('rwLlmProvider').value;
    if (PRESETS[p]) {
      $('rwLlmBase').value = PRESETS[p].base;
      $('rwLlmModel').value = PRESETS[p].model;
    }
  }

  /* ---------- 232 文案公式库 ---------- */
  /* group, name, framework(用于离线脚手架 + 提示词增强) */
  var FORMULAS = [
    // 经典转化模型
    { g: '经典转化模型', n: 'AIDA', f: '注意力(Attention)→兴趣(Interest)→渴望(Desire)→行动(Action)' },
    { g: '经典转化模型', n: 'PAS', f: '问题(Problem)→激化(Agitate)→解决(Solution)' },
    { g: '经典转化模型', n: 'PASTOR', f: '痛点(Pain)→放大(Amplify)→故事(Story)→真相(Truth)→价值(Offer)→保证(Guarantee)→呼吁(Response)' },
    { g: '经典转化模型', n: 'FAB', f: '特征(Feature)→优势(Advantage)→利益(Benefit)' },
    { g: '经典转化模型', n: 'BAB', f: '现状(Before)→桥接(And)→愿景(After)' },
    { g: '经典转化模型', n: '4Ps', f: '产品(Product)→价格(Price)→渠道(Place)→促销(Promotion)' },
    { g: '经典转化模型', n: '4Cs', f: '顾客(Customer)→成本(Cost)→便利(Convenience)→沟通(Communication)' },
    { g: '经典转化模型', n: '4Us', f: '有用(Useful)→独特(Unique)→紧迫(Urgent)→超级具体(Ultra-specific)' },
    { g: '经典转化模型', n: 'QUEST', f: '限定(Qualify)→理解(Understand)→教育(Educate)→刺激(Stimulate)→激发(Test)' },
    { g: '经典转化模型', n: 'ACCA', f: '认知(Awareness)→理解(Comprehension)→ conviction(信服)→行动(Action)' },
    { g: '经典转化模型', n: 'OATH', f: '目标(Objective)→受众(Audience)→语气(Tone)→手写(Handwriting)' },
    { g: '经典转化模型', n: 'APP', f: '认知(Awareness)→偏好(Preference)→购买(Purchase)' },
    { g: '经典转化模型', n: 'RECIPE', f: '关联(Relevance)→共鸣(Emotion)→清晰(Clarity)→证据(Proof)→诱因(Incentive)→简洁(Ease)→行动(Execution)' },
    { g: '经典转化模型', n: 'PPPP', f: '描绘(Picture)→承诺(Promise)→证明(Prove)→推动(Push)' },
    { g: '经典转化模型', n: 'SLAP', f: '停止(Stop)→看(Look)→行动(Act)→购买(Purchase)' },
    { g: '经典转化模型', n: 'STAR', f: '情境(Situation)→任务(Task)→行动(Action)→结果(Result)' },
    { g: '经典转化模型', n: 'SSS', f: '明星(Star)→故事(Story)→方案(Solution)' },
    { g: '经典转化模型', n: '4A', f: '认知(Aware)→态度(Attitude)→行动(Act)→习惯(Act again)' },
    { g: '经典转化模型', n: 'CAKE', f: '清晰(Clear)→吸引(Attractive)→可信(Believable)→知识(Knowledge)' },
    { g: '经典转化模型', n: 'CUB', f: '清晰(Clear)→独特(Unique)→有益(Beneficial)' },
    { g: '经典转化模型', n: 'VAD', f: '价值(Value)→优势(Advantage)→差异(Differentiation)' },
    { g: '经典转化模型', n: 'WWHW', f: '为什么(Why)→什么(What)→如何(How)→何时(When)' },
    { g: '经典转化模型', n: 'SCQA', f: '情境(Situation)→冲突(Complication)→问题(Question)→答案(Answer)' },
    { g: '经典转化模型', n: 'KISS', f: '保持简单直接(Keep It Simple, Stupid)' },
    { g: '经典转化模型', n: 'SUCCES', f: '简单(Simple)→意外(Unexpected)→具体(Concrete)→可信(Credible)→情感(Emotional)→故事(Story)' },
    { g: '经典转化模型', n: 'SOAP', f: '主题(Subject)→目标(Objective)→评估(Assessment)→计划(Plan)' },
    { g: '经典转化模型', n: 'FOG', f: '事实(Fact)→目标(Objective)→引导(Guide)' },
    { g: '经典转化模型', n: 'AIDA-O', f: 'AIDA + 异议处理(Objection)' },
    { g: '经典转化模型', n: 'PASO', f: 'PAS + 异议(Objection)' },
    // 故事与叙事
    { g: '故事与叙事', n: '英雄之旅 (Hero’s Journey)', f: '平凡世界→冒险召唤→跨越门槛→试炼→回报→归来' },
    { g: '故事与叙事', n: 'StoryBrand', f: '主角(顾客)+问题+引导者(品牌)+计划+行动+失败+成功' },
    { g: '故事与叙事', n: '7-Step Story Arc', f: '钩子→上升→转折→中点→危机→高潮→结局' },
    { g: '故事与叙事', n: '三幕剧 (3-Act)', f: '建置→对抗→结局' },
    { g: '故事与叙事', n: '钩子-副钩系统', f: '强钩子抓住注意→副钩维持到转化' },
    { g: '故事与叙事', n: '金句法则 (Rule of Three)', f: '三元素并列，强化节奏与记忆' },
    { g: '故事与叙事', n: '高脚凳测试 (Barstool Test)', f: '像在酒吧和熟人聊天一样自然地说' },
    { g: '故事与叙事', n: '叙事弧 (Narrative Arc)', f: '铺垫→冲突→转折→释怀' },
    { g: '故事与叙事', n: '英雄的失败 (Hero’s Flaw)', f: '先暴露缺陷，再给出转变' },
    // 标题与钩子
    { g: '标题与钩子', n: 'Jon Morrow 标题黑客', f: '禁忌/秘密/错误/警告/需要/想要 五种钩子' },
    { g: '标题与钩子', n: '好奇心钩子 (Curiosity-Driven)', f: '留下信息缺口，逼读者点开' },
    { g: '标题与钩子', n: 'UPWORDS 框架', f: '用非常规角度重组标题' },
    { g: '标题与钩子', n: '数字清单体', f: '用具体数字制造可信与可执行感' },
    { g: '标题与钩子', n: '疑问体', f: '用问题替代陈述，引发自省' },
    { g: '标题与钩子', n: '否定式钩子', f: '“别再做 X”制造反差注意' },
    // 邮件与留存
    { g: '邮件与留存', n: 'Dean Jackson 9 词邮件', f: '用 9 个词达成约访：我想知道你是否在用 X' },
    { g: '邮件与留存', n: 'Ben Settle 邮件玩法', f: '每日邮件 + 争议观点建立黏性' },
    { g: '邮件与留存', n: '序列孵化 (Nurture Sequence)', f: '认知→教育→案例→促销 的邮件节奏' },
    { g: '邮件与留存', n: '欢迎序列 (Welcome Sequence)', f: '首封建立预期，逐封交付价值' },
    // 大师公式（人名）
    { g: '大师公式', n: 'Ogilvy 标题法则', f: '利益前置+具体数据+新闻性+好奇' },
    { g: '大师公式', n: 'Dan Kennedy 上帝之手', f: '无法拒绝的报价 + 稀缺 + 紧迫' },
    { g: '大师公式', n: 'Gary Halbert A/B 堆', f: '列出全部购买理由再排序' },
    { g: '大师公式', n: 'Joe Sugarman 广告体', f: '滑动体验：每句都让人读下一句' },
    { g: '大师公式', n: 'Bob Bly 公式', f: '问题→方案→证明→行动' },
    { g: '大师公式', n: 'John Caples 测试广告', f: '强标题 + 具体好处 + 免费赠品' },
    { g: '大师公式', n: 'Robert Collier 信函', f: '从对方立场出发的连续对话' },
    { g: '大师公式', n: 'Eugene Schwartz 突破广告', f: '按市场成熟度选择诉求' },
    { g: '大师公式', n: 'David Ogilvy 品牌长文', f: '权威+细节+证据的长文案' },
    { g: '大师公式', n: 'Claude Hopkins 科学化广告', f: '提供样品+ measurable 诉求' },
    { g: '大师公式', n: 'Gary Bencivenga 说服等式', f: '独特机制+可感知价值+证明' },
    { g: '大师公式', n: 'Ray Edwards PASTOR', f: 'PAS 扩展版，含故事与保证' },
    { g: '大师公式', n: 'Joanna Wiebe 转化文案', f: '用用户原话做文案，A/B 验证' },
    { g: '大师公式', n: 'Seth Godin 许可营销', f: '用信任替代打扰' },
    { g: '大师公式', n: 'Don Miller StoryBrand', f: '把品牌放进顾客故事' },
    { g: '大师公式', n: 'Neville Medhora Kopywriting', f: '口语化+短句+直接对话' },
    // 现代数字营销
    { g: '现代数字营销', n: 'Skyscraper 技术', f: '找到爆款内容→做得更好→主动分发' },
    { g: '现代数字营销', n: '紫牛 (Purple Cow)', f: '用惊人差异制造自发传播' },
    { g: '现代数字营销', n: '粘住 (Made to Stick)', f: '简单/意外/具体/可信/情感/故事' },
    { g: '现代数字营销', n: '蝴蝶结漏斗 (Bow Tie Funnel)', f: '获取→激活→留存→推荐 的循环' },
    { g: '现代数字营销', n: '黄金圈 (Golden Circle)', f: '为什么(Why)→如何(How)→什么(What)' },
    { g: '现代数字营销', n: '价值主张画布', f: '客户任务+痛点+收益 对齐 产品增益' },
    { g: '现代数字营销', n: 'LIFT 模型', f: '价值主张/相关性/清晰度/紧迫/焦虑/分心 六维优化' },
    { g: '现代数字营销', n: '钩子-价值-号召 (HVC)', f: '短视频黄金三秒结构' },
    { g: '现代数字营销', n: '痛点-方案-证明-逼单', f: '直播带货四步循环' },
    { g: '现代数字营销', n: 'Before-After-Bridge', f: '展示改变，再给桥' },
    { g: '现代数字营销', n: 'FOMO 框架', f: '稀缺+限时+社会证明 制造紧迫' }
  ];

  var FORMULA_MAP = {};
  FORMULAS.forEach(function (x) { FORMULA_MAP[x.n] = x.f || '（经典文案公式，请按其公认结构重写）'; });

  function populateFormulas() {
    var sel = $('rwCgFormula');
    if (!sel) return;
    var groups = {};
    FORMULAS.forEach(function (f) { (groups[f.g] = groups[f.g] || []).push(f); });
    var html = '';
    Object.keys(groups).forEach(function (g) {
      html += '<optgroup label="' + esc(g) + '">';
      groups[g].forEach(function (f) {
        html += '<option value="' + esc(f.n) + '">' + esc(f.n) + (f.f ? ' · ' + esc(f.f.split('→')[0].split('(')[0].trim()) : '') + '</option>';
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
  }

  /* ---------- Humanizer-zh 离线规则引擎 ---------- */
  /* p = 正则源(无 flags)；r = 替换串 */
  var HM_TIERS = {
    light: [
      { p: '此外[，,]?', r: '' },
      { p: '另外[，,]?', r: '' },
      { p: '除此之外[，,]?', r: '' },
      { p: '值得注意的是[，,]?', r: '' },
      { p: '需要指出的是[，,]?', r: '' },
      { p: '总而言之[，,]?', r: '说到底，' },
      { p: '综上所述[，,]?', r: '' },
      { p: '总的来说[，,]?', r: '' },
      { p: '在当前[^，。！？]*背景下[，,]?', r: '' },
      { p: '在当今[^，。！？]*时代[，,]?', r: '' },
      { p: '在[^，。！？]*的今天[，,]?', r: '' },
      { p: '随着[^，。！？]*的发展[，,]?', r: '' },
      { p: '随着[^，。！？]*的不断进步[，,]?', r: '' },
      { p: '毋庸置疑[，,]?', r: '' },
      { p: '不仅([^，。！？]*)[，,]?而且([^，。！？]*)', r: '$1，$2' },
      { p: '首先[，,]?', r: '' },
      { p: '其次[，,]?', r: '' },
      { p: '最后[，,]?', r: '' },
      { p: '—', r: '，' },
      { p: '——', r: '：' }
    ],
    mid: [
      { p: '至关重要', r: '很关键' },
      { p: '举足轻重', r: '重要' },
      { p: '大有裨益', r: '很有帮助' },
      { p: '旨在', r: '为了' },
      { p: '致力于', r: '专心做' },
      { p: '赋能', r: '帮…提升' },
      { p: '打造', r: '做出' },
      { p: '构建', r: '建立' },
      { p: '深度融合', r: '深度结合' },
      { p: '不可或缺', r: '不能少' },
      { p: '应运而生[，,]?', r: '' },
      { p: '焕然一新', r: '变新' },
      { p: '脱颖而出', r: '更突出' },
      { p: '尽显', r: '显出' },
      { p: '宛如', r: '像' },
      { p: '犹如', r: '像' },
      { p: '谱写', r: '写' },
      { p: '筑牢', r: '打好' },
      { p: '保驾护航', r: '保护' },
      { p: '可以说[，,]?', r: '' },
      { p: '从某种角度来说[，,]?', r: '' },
      { p: '显而易见[，,]?', r: '显然，' }
    ],
    strong: [
      { p: '一系列', r: '一些' },
      { p: '诸多', r: '很多' },
      { p: '众多', r: '很多' },
      { p: '进一步', r: '更' },
      { p: '有效地?', r: '' },
      { p: '高效地?', r: '' },
      { p: '充分地?', r: '' },
      { p: '起到了[^，。！？]*的作用', r: '' },
      { p: '具有重要的[^，。！？]*意义', r: '有意义' },
      { p: '为[^，。！？]*提供了便利', r: '方便' }
    ]
  };

  function humanize(text, level) {
    var ruleset = {
      light: HM_TIERS.light.slice(),
      mid: HM_TIERS.light.concat(HM_TIERS.mid),
      strong: HM_TIERS.light.concat(HM_TIERS.mid, HM_TIERS.strong)
    };
    var rules = (ruleset[level] || ruleset.mid).slice();
    // 收集命中位置用于高亮（去掉重叠）
    var marks = [];
    rules.forEach(function (r) {
      var re = new RegExp(r.p, 'g');
      var m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        marks.push({ i: m.index, len: m[0].length });
        if (marks.length > 800) break;
      }
    });
    marks.sort(function (a, b) { return a.i - b.i; });
    var cleanMarks = [], last = 0;
    marks.forEach(function (m) {
      if (m.i < last) return;
      cleanMarks.push(m); last = m.i + m.len;
    });
    // 生成清理后文本
    var cleaned = text;
    rules.forEach(function (r) { cleaned = cleaned.replace(new RegExp(r.p, 'g'), r.r); });
    // 高亮原文
    var hi = '', pos = 0;
    cleanMarks.forEach(function (m) {
      hi += esc(text.slice(pos, m.i));
      hi += '<mark class="hl P2">' + esc(text.slice(m.i, m.i + m.len)) + '</mark>';
      pos = m.i + m.len;
    });
    hi += esc(text.slice(pos));
    return { cleaned: cleaned, highlighted: hi, count: cleanMarks.length };
  }

  /* ---------- 提示词构建 ---------- */
  function buildCopywriterPrompt(text, params) {
    var system = '你是一位资深的中文营销文案专家，擅长把平淡陈述改写成有说服力、有"人味"、能驱动转化的社媒文案。\n'
      + '要求：\n'
      + '1. 保留原文核心信息、品牌、价格、卖点，不虚构事实。\n'
      + '2. 用口语化、有画面感的语言，像真实用户在安利，而不是官方通稿。\n'
      + '3. 强化一个核心卖点，加入具体场景/情绪/结果，避免空话。\n'
      + '4. 节奏以短句为主，多用"你""咱们"拉近距离。\n'
      + '5. 严格遵守广告法：不出现"最/第一/国家级"等绝对化用语，不夸大功效，不承诺疗效。\n'
      + '6. 输出可直接用于【' + params.type + '】，语气【' + params.tone + '】。';
    var user = '核心卖点参考：' + (params.sell || '（无，按原文提炼）') + '\n\n请改写以下文案：\n' + text;
    return { system: system, user: user };
  }

  function buildCopgptPrompt(text, formulaName, params) {
    var fw = FORMULA_MAP[formulaName] || '（经典文案公式，请按其公认结构重写）';
    var system = '你是一位精通经典文案公式的撰稿人。请严格按【' + formulaName + '】公式结构重写用户文案。\n'
      + '公式框架：' + fw + '\n'
      + '要求：\n'
      + '1. 完全遵循该公式的分段结构与逻辑顺序。\n'
      + '2. 保留原文核心事实与卖点，不虚构。\n'
      + '3. 口语自然、有说服力，遵守广告法（无绝对化/疗效宣称）。\n'
      + '4. 字数控制在 ' + (params.max && params.max > 0 ? params.max + ' 字' : '合理范围') + ' 以内。\n'
      + '5. 输出类型：' + params.out + '。';
    var user = '原文：\n' + text;
    return { system: system, user: user };
  }

  /* ---------- LLM 调用 ---------- */
  function callLLM(system, user, cb) {
    var cfg = loadLLM();
    if (!cfg.key) { cb({ needKey: true }, null); return; }
    var url = (cfg.base || '').replace(/\/+$/, '') + '/chat/completions';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.7
      })
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    }).then(function (res) {
      if (res.status !== 200 || !res.data.choices || !res.data.choices.length) {
        cb(res.data && (res.data.error && (res.data.error.message || res.data.error)) || ('HTTP ' + res.status), null);
        return;
      }
      cb(null, res.data.choices[0].message.content);
    }).catch(function (err) {
      cb('网络/跨域错误：' + (err && err.message ? err.message : err) + '\n（可复制提示词到 AI 工具使用）', null);
    });
  }

  /* ---------- 状态 ---------- */
  var currentMode = 'humanizer';
  var currentRewritten = '';
  var currentPrompt = '';

  /* ---------- 渲染对照 ---------- */
  function renderCompare(original, rewritten, metaChips, note, opts) {
    opts = opts || {};
    var html = '';
    if (metaChips && metaChips.length) {
      html += '<div class="results-head" style="margin-bottom:14px;padding:12px 16px">'
        + metaChips.map(function (c) { return '<span class="chip ' + (c.cls || '') + '">' + esc(c.t) + '</span>'; }).join(' ') + '</div>';
    }
    html += '<div class="rw-compare">';
    html += '<div class="rw-col"><div class="rw-col-head"><span>原文</span><span class="rw-tag">输入</span></div>'
      + '<div class="rw-col-body' + (opts.markOriginal ? ' marked' : '') + '">' + (opts.markOriginal ? original : esc(original)) + '</div></div>';
    html += '<div class="rw-col"><div class="rw-col-head"><span>改写结果</span><span class="rw-tag after">输出</span></div>'
      + '<div class="rw-col-body">' + esc(rewritten) + '</div></div>';
    html += '</div>';
    if (note) html += '<div class="rw-note">' + note + '</div>';
    $('rwResult').className = '';
    $('rwResult').innerHTML = html;
    currentRewritten = rewritten;
    $('rwCopyBtn').disabled = false;
  }

  function renderPromptOnly(promptText, metaChips, note) {
    var html = '';
    if (metaChips && metaChips.length) {
      html += '<div class="results-head" style="margin-bottom:14px;padding:12px 16px">'
        + metaChips.map(function (c) { return '<span class="chip ' + (c.cls || '') + '">' + esc(c.t) + '</span>'; }).join(' ') + '</div>';
    }
    html += '<div class="rw-note">' + (note || '') + '</div>';
    html += '<div class="rw-prompt">' + esc(promptText) + '</div>';
    $('rwResult').className = '';
    $('rwResult').innerHTML = html;
    currentPrompt = promptText;
    $('rwCopyBtn').disabled = true;
    $('rwCopyPromptBtn').style.display = '';
    $('rwCopyPromptBtn').disabled = false;
  }

  /* ---------- 主流程 ---------- */
  function run() {
    var text = $('rwInput').value.trim();
    if (!text) { showToast('请先输入原文'); return; }
    if (currentMode === 'humanizer') return runHumanizer(text);
    return runLLMMode(text);
  }

  function runHumanizer(text) {
    var level = ($('rwHmLevel').querySelector('.on') || {}).dataset
      ? ($('rwHmLevel').querySelector('.on')).dataset.v : 'mid';
    var tone = $('rwHmTone').value;
    var lang = $('rwHmLang').value;
    var res = humanize(text, level);
    var chips = [
      { t: 'Humanizer-zh', cls: 'cyan' },
      { t: '强度：' + ({ light: '轻', mid: '中', strong: '强' }[level]), cls: '' },
      { t: '语气：' + tone, cls: '' },
      { t: '替换 ' + res.count + ' 处', cls: res.count ? 'ok' : 'mid' }
    ];
    var note = res.count === 0
      ? '未检出明显 AI 腔表达，文案已较自然。'
      : '已识别并替换 <b>' + res.count + '</b> 处中文 AI 惯用表达（高亮部分）。如仍偏书面，可调高「去 AI 强度」或改用「串联模式」再做一轮。';
    renderCompare(res.highlighted, res.cleaned, chips, note, { markOriginal: true });
    currentPrompt = '';
    $('rwCopyPromptBtn').style.display = 'none';
    $('rwCopyPromptBtn').disabled = true;
  }

  function runLLMMode(text) {
    var prompt, metaChips, note;
    if (currentMode === 'copywriter') {
      var cw = {
        type: $('rwCwType').value,
        tone: $('rwCwTone').value,
        sell: $('rwCwSell').value.trim()
      };
      prompt = buildCopywriterPrompt(text, cw);
      metaChips = [{ t: 'ai-copywriter', cls: 'cyan' }, { t: '类型：' + cw.type, cls: '' }, { t: '语气：' + cw.tone, cls: '' }];
    } else {
      var fn = $('rwCgFormula').value;
      var cg = {
        max: parseInt($('rwCgMax').value, 10) || 0,
        out: $('rwCgOut').value
      };
      prompt = buildCopgptPrompt(text, fn, cg);
      metaChips = [{ t: 'CopyGPT', cls: 'cyan' }, { t: '公式：' + fn, cls: '' }, { t: '输出：' + cg.out, cls: '' }];
    }

    var modeLabel = currentMode === 'copywriter' ? 'ai-copywriter' : 'CopyGPT';
    var chain = $('rwChain').checked;

    callLLM(prompt.system, prompt.user, function (err, out) {
      if (err && typeof err === 'object' && err.needKey) {
        var kc = metaChips.concat([{ t: '未配置 LLM', cls: 'mid' }]);
        var kn = '未检测到 LLM API Key。<b>' + modeLabel + '</b> 需要大模型生成改写结果。已为你生成完整提示词，复制后粘贴到任意 AI 工具即可获得改写。'
          + (chain ? '<br>串联模式需先完成主改写，暂未执行。' : '');
        renderPromptOnly(prompt.system + '\n\n------\n\n' + prompt.user, kc, kn);
        return;
      }
      if (err) {
        showToast('改写失败，已生成提示词可手动使用');
        renderPromptOnly(prompt.system + '\n\n------\n\n' + prompt.user, metaChips.concat([{ t: '调用失败', cls: 'bad' }]),
          'LLM 调用出错：<b>' + esc(err) + '</b><br>已生成提示词，可复制到 AI 工具使用。');
        return;
      }
      // 成功得到 LLM 结果（非字符串时按失败处理，避免崩溃）
      if (typeof out !== 'string' || !out.trim()) {
        renderPromptOnly(prompt.system + '\n\n------\n\n' + prompt.user, metaChips.concat([{ t: '返回异常', cls: 'bad' }]),
          'LLM 返回内容为空或格式异常，已生成提示词，可复制到 AI 工具使用。');
        return;
      }
      var primaryOut = out;
      if (chain) {
        var h = humanize(stripCodeFence(primaryOut), 'mid');
        var chainNote = '已串联 <b>Humanizer-zh</b> 人味化，去除 ' + h.count + ' 处 AI 腔表达。';
        renderCompare(esc(text), h.cleaned, metaChips.concat([{ t: '串联 Humanizer', cls: 'ok' }]), chainNote, {});
      } else {
        renderCompare(esc(text), stripCodeFence(primaryOut), metaChips, '改写完成。如需更自然，可开启「串联模式」再过一遍 Humanizer-zh。', {});
      }
      currentPrompt = '';
      $('rwCopyPromptBtn').style.display = 'none';
      $('rwCopyPromptBtn').disabled = true;
    });
  }

  function stripCodeFence(s) {
    if (!s) return s;
    return s.replace(/^```(?:json|markdown|text)?\s*/i, '').replace(/```$/i, '').trim();
  }

  /* ---------- 模式切换 ---------- */
  function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.rw-params').forEach(function (el) {
      el.style.display = (el.dataset.mode === mode) ? '' : 'none';
    });
  }

  /* ---------- 示例 ---------- */
  var DEMO = '此外，我们的深层护理套餐至关重要，不仅能让你的发质柔顺，而且能深层修护受损毛鳞片。'
    + '随着人们生活水平的不断提高，毋庸置疑，这家店在众多竞品中脱颖而出。'
    + '总而言之，欢迎前来体验，享受焕然一新的改变。';

  /* ---------- 初始化 ---------- */
  function init() {
    populateFormulas();
    fillLLMSettings();

    $('rwMode').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !b.dataset.v) return;
      $('rwMode').querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      switchMode(b.dataset.v);
    });

    $('rwHmLevel').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      this.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    });

    $('rwLlmProvider').addEventListener('change', onProviderChange);
    $('rwLlmSave').addEventListener('click', function () {
      var cfg = {
        provider: $('rwLlmProvider').value,
        key: $('rwLlmKey').value.trim(),
        base: $('rwLlmBase').value.trim(),
        model: $('rwLlmModel').value.trim()
      };
      saveLLM(cfg);
      $('rwLlmStatus').innerHTML = cfg.key ? '<span class="chip ok">已保存</span>' : '<span class="chip mid">已保存（未填 Key）</span>';
      showToast('LLM 设置已保存');
    });

    $('rwRun').addEventListener('click', run);
    $('rwDemo').addEventListener('click', function () {
      $('rwInput').value = DEMO;
      if (currentMode !== 'humanizer') {
        $('rwMode').querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        $('rwMode').querySelector('button[data-v="humanizer"]').classList.add('on');
        switchMode('humanizer');
      }
      showToast('示例已载入，点击开始改写');
    });

    $('rwCopyBtn').addEventListener('click', function () {
      if (currentRewritten) copyText(currentRewritten, '改写结果已复制');
    });
    $('rwCopyPromptBtn').addEventListener('click', function () {
      if (currentPrompt) copyText(currentPrompt, '提示词已复制');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
