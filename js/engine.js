/* 生成引擎 + 合规扫描器 */
window.DS = window.DS || {};

/* ---------- 工具 ---------- */
DS.fill = function (tpl, v) {
  return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
    return v[k] !== undefined && v[k] !== '' ? v[k] : (m === '{gift}' ? '小礼品' : '');
  });
};

DS.pick = function (arr, idx) {
  if (!arr || !arr.length) return '';
  return arr[idx % arr.length];
};

/* ---------- 时长结构模板 ---------- */
DS.durations = {
  d15: {
    label: '15秒 · 强钩子拉新',
    total: 15,
    segments: [
      { t: '0-3s', role: 'hook', shot: '门店门头/主体特写，达人入画', note: '前3秒必须出现利益点或疑问' },
      { t: '3-10s', role: 'core', shot: '服务过程快剪（2-3个镜头）', note: '卖点+价格同时上大字幕' },
      { t: '10-15s', role: 'cta', shot: '门店定位 + 团购按钮贴片', note: '明确行动指令' }
    ]
  },
  d30: {
    label: '30秒 · 团购转化主投',
    total: 30,
    segments: [
      { t: '0-3s', role: 'hook', shot: '门店外景 + 达人走近', note: '痛点或利益点开场' },
      { t: '3-12s', role: 'intro', shot: '门店环境 + 服务过程', note: '建立信任，露出品牌' },
      { t: '12-20s', role: 'offer', shot: '成品展示 + 价签特写', note: '价格对比用色块大字' },
      { t: '20-27s', role: 'trust', shot: '门店环境 + 顾客满意瞬间', note: '保障信息，降低决策成本' },
      { t: '27-30s', role: 'cta', shot: '门店定位 + 团购按钮贴片', note: '点击团购、就近到店' }
    ]
  },
  d60: {
    label: '45-60秒 · 达人探店/品牌',
    total: 60,
    segments: [
      { t: '0-5s', role: 'hook', shot: '达人出镜自述 + 街景', note: '第一人称人设建立' },
      { t: '5-15s', role: 'intro', shot: '进店、接待、环境巡览', note: '真实感优先，避免摆拍' },
      { t: '15-32s', role: 'process', shot: '完整服务过程记录', note: '细节镜头，体现专业度' },
      { t: '32-42s', role: 'feel', shot: '成品/状态展示 + 真实反应', note: '自然表情，不夸张' },
      { t: '42-52s', role: 'offer', shot: '套餐内容板 + 价签特写', note: '优惠+保障一起说清' },
      { t: '52-60s', role: 'cta', shot: '门店门头定位 + 团购贴片', note: '收尾强化品牌与行动' }
    ]
  }
};

/* ---------- 主生成函数 ---------- */
DS.generate = function (cfg, variantIndex) {
  var cat = DS.categories[cfg.category] || DS.categories.hair;
  var i = variantIndex;

  var v = {
    brand: cfg.brand || '本店',
    area: cfg.area || '你家附近',
    storeCount: cfg.storeCount || '100',
    entryItem: cfg.entryItem || cat.entryItem,
    mainItem: cfg.mainItem || cat.mainItem,
    entryPrice: cfg.entryPrice || cat.entryPrice,
    mainPrice: cfg.mainPrice || cat.mainPrice,
    origPrice: cfg.origPrice || cat.origPrice,
    deadline: cfg.deadline || '本周有效',
    gift: cfg.gift || '',
    staff: cat.staff,
    aud: cat.aud || '朋友',
    verb: cat.verb || '做',
    catName: cat.name.split(' · ')[1] || cat.name,
    people: '2',
    scene1: cat.scenes[0], scene2: cat.scenes[1], scene3: cat.scenes[2],
    pain: DS.pick(cat.pains, i),
    benefit1: DS.fill(DS.pick(cat.benefits, i), { staff: cat.staff, storeCount: cfg.storeCount || '100' })
  };

  /* 钩子：按选定类型轮换句式；若选"自动"则每个变体换一种类型 */
  var hookTypes = Object.keys(DS.hooks);
  var hType = cfg.hookType === 'auto' ? hookTypes[i % hookTypes.length] : cfg.hookType;
  var hookPool = (DS.hooks[hType] || DS.hooks.benefit).lines;
  var hook = DS.fill(DS.pick(hookPool, i), v);

  /* 品类专属过程/感受句优先，回退到通用句式 */
  var cl = DS.catLines[cfg.category] || {};
  var processPool = cl.process && cl.process.length ? cl.process : DS.bodyLines.process;
  var feelPool = cl.feel && cl.feel.length ? cl.feel : DS.bodyLines.feel;

  /* 15秒档使用短句，避免语速过密 */
  var isShort = cfg.duration === 'd15';
  var corePool = isShort ? DS.shortOffers : DS.offerLines;

  /* 各段文案 */
  var parts = {
    hook: hook,
    intro: DS.fill(DS.pick(DS.bodyLines.intro, i), v),
    process: DS.fill(DS.pick(processPool, i), v),
    feel: DS.fill(DS.pick(feelPool, i), v),
    core: isShort
      ? DS.fill(DS.pick(corePool, i), v)
      : DS.fill(DS.pick(DS.bodyLines.differentiate, i), v) + DS.fill(DS.pick(DS.offerLines, i), v),
    offer: DS.fill(DS.pick(DS.offerLines, i), v) + (v.gift ? DS.fill(DS.pick(DS.giftLines, i), v) : ''),
    trust: DS.fill(DS.pick(DS.trustLines, i), v),
    cta: DS.fill(DS.pick(DS.ctaLines[cfg.goal] || DS.ctaLines.groupbuy, i), v)
  };

  /* 风格微调 */
  if (cfg.style === 'promo') {
    parts.offer = '划重点——' + parts.offer;
    parts.cta = '别刷走，' + parts.cta;
  } else if (cfg.style === 'review') {
    parts.hook = '我自己去试了下，' + parts.hook;
    parts.feel = '说实话，' + parts.feel;
  } else if (cfg.style === 'story') {
    parts.hook = parts.hook + '事情是这样的——';
  }

  /* 组装分镜与脚本 */
  var dur = DS.durations[cfg.duration] || DS.durations.d30;
  var rows = dur.segments.map(function (seg) {
    var line = parts[seg.role] || parts.core || '';
    return {
      time: seg.t,
      shot: seg.shot,
      line: line,
      subtitle: DS.subtitleOf(seg.role, v),
      note: seg.note
    };
  });

  var script = rows.map(function (r) { return '（' + r.time + '）' + r.line; }).join('\n');
  var title = DS.fill(DS.pick(DS.titles, i), v);
  var topics = (DS.topics.common.slice(0, 2)).concat(DS.topics[cfg.category] || []).join(' ');
  var comment = DS.fill(DS.pick(DS.comments, i), v);

  return {
    variant: String.fromCharCode(65 + i),
    hookType: (DS.hooks[hType] || {}).label || '',
    durationLabel: dur.label,
    rows: rows,
    script: script,
    title: title,
    topics: topics,
    comment: comment,
    wordCount: script.replace(/[（）\s\-0-9a-zA-Z]/g, '').length,
    risk: DS.scan(script + ' ' + title + ' ' + comment)
  };
};

DS.subtitleOf = function (role, v) {
  var map = {
    hook: v.entryItem + ' 仅 ' + v.entryPrice + ' 元',
    intro: v.brand + '｜' + v.storeCount + '+ 连锁',
    process: '总部统一培训 · 流程标准',
    feel: '真实体验',
    core: '门市 ' + v.origPrice + ' → 团购 ' + v.entryPrice,
    offer: '门市 ' + v.origPrice + ' → 团购 ' + v.entryPrice,
    trust: '未核销随时退 · 过期自动退',
    cta: '点击下方团购 · 就近到店'
  };
  return map[role] || '';
};

/* ---------- 合规扫描 ---------- */
DS.scan = function (text) {
  var hits = [];
  if (!text) return { hits: hits, p0: 0, p1: 0, p2: 0, pass: true };
  DS.riskRules.forEach(function (rule) {
    rule.words.forEach(function (w) {
      var idx = text.indexOf(w);
      while (idx !== -1) {
        hits.push({ word: w, level: rule.level, cat: rule.cat, fix: rule.fix, index: idx });
        idx = text.indexOf(w, idx + w.length);
      }
    });
  });
  var count = function (lv) { return hits.filter(function (h) { return h.level === lv; }).length; };
  return {
    hits: hits,
    p0: count('P0'), p1: count('P1'), p2: count('P2'),
    pass: count('P0') === 0 && count('P1') === 0
  };
};

/* 去重后的命中词（用于展示） */
DS.uniqueHits = function (hits) {
  var seen = {}, out = [];
  hits.forEach(function (h) {
    if (!seen[h.word]) { seen[h.word] = true; out.push(h); }
  });
  var order = { P0: 0, P1: 1, P2: 2 };
  return out.sort(function (a, b) { return order[a.level] - order[b.level]; });
};

/* 高亮渲染 */
DS.highlight = function (text, hits) {
  if (!hits.length) return DS.esc(text);
  var marks = new Array(text.length).fill(null);
  hits.forEach(function (h) {
    for (var k = h.index; k < h.index + h.word.length; k++) {
      if (!marks[k] || (marks[k] === 'P2' && h.level !== 'P2') || (marks[k] === 'P1' && h.level === 'P0')) marks[k] = h.level;
    }
  });
  var out = '', cur = null;
  for (var i = 0; i < text.length; i++) {
    if (marks[i] !== cur) {
      if (cur) out += '</mark>';
      if (marks[i]) out += '<mark class="hl ' + marks[i] + '">';
      cur = marks[i];
    }
    out += DS.esc(text[i]);
  }
  if (cur) out += '</mark>';
  return out;
};

DS.esc = function (s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
};

/* 一键净化：P0 词有替换用替换、无替换则删除；P1/P2 仅提示不自动改 */
DS.purify = function (text) {
  var out = text, changed = [], todo = {};

  /* 收集所有 P0 词与替换词典键 */
  DS.riskRules.forEach(function (rule) {
    if (rule.level === 'P0') {
      rule.words.forEach(function (w) { todo[w] = DS.replaceMap[w] !== undefined ? DS.replaceMap[w] : ''; });
    }
  });
  Object.keys(DS.replaceMap).forEach(function (w) { todo[w] = DS.replaceMap[w]; });

  /* 按词长降序，避免「全网最低」被「最低价」拆坏 */
  Object.keys(todo).sort(function (a, b) { return b.length - a.length; }).forEach(function (bad) {
    if (out.indexOf(bad) !== -1) {
      changed.push(bad + ' → ' + (todo[bad] || '（删除）'));
      out = out.split(bad).join(todo[bad]);
    }
  });

  /* 清理替换后残留的标点空洞 */
  out = out.replace(/[，,、]{2,}/g, '，').replace(/[！!]{2,}/g, '！')
    .replace(/^[，,、。！!]+/, '').replace(/\s{2,}/g, ' ').trim();

  return { text: out, changed: changed };
};

/* P1/P2 仅提示的修改建议（不自动改写） */
DS.advise = function (text) {
  var res = DS.scan(text);
  return DS.uniqueHits(res.hits).filter(function (h) { return h.level !== 'P0'; });
};
