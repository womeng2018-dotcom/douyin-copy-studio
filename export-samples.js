/* 导出真实生成样例（Markdown），供 AI 评审使用 */
const fs = require('fs');
const path = require('path');
global.window = global;

['data.js', 'data-category.js', 'data-lines.js', 'data-compliance.js', 'data-brief.js', 'engine.js']
  .forEach(f => eval(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')));

const out = [];
const W = (s) => out.push(s);

const base = {
  goal: 'groupbuy', style: 'oral', hookType: 'auto',
  storeCount: '100', deadline: '8月10日-16日有效',
  gift: '肩颈按摩5分钟'
};

const cases = [
  {
    name: '美发 · 30秒 · 口语化 · 团购转化', cfg: Object.assign({}, base, {
      category: 'hair', duration: 'd30', style: 'oral', brand: '星悦造型', area: '静安大悦城',
      entryItem: '洗剪吹体验', entryPrice: '9.9', mainItem: '深层护理套餐', mainPrice: '39.9', origPrice: '198'
    }), variants: 3
  },
  {
    name: '生活美容 · 15秒 · 促销感 · 团购转化', cfg: Object.assign({}, base, {
      category: 'beauty', duration: 'd15', style: 'promo', brand: '悦肤美学', area: '五角场',
      entryItem: '深层清洁护理', entryPrice: '19.9', mainItem: '面部管理套卡', mainPrice: '99', origPrice: '580'
    }), variants: 2
  },
  {
    name: '餐饮 · 45-60秒 · 探店测评 · 到店引流', cfg: Object.assign({}, base, {
      category: 'food', duration: 'd60', style: 'review', goal: 'traffic', brand: '楠火锅', area: '中山公园',
      entryItem: '双人套餐', entryPrice: '99', mainItem: '四人聚会餐', mainPrice: '199', origPrice: '386', gift: ''
    }), variants: 2
  },
  {
    name: '教培 · 30秒 · 剧情反转 · 留资', cfg: Object.assign({}, base, {
      category: 'edu', duration: 'd30', style: 'story', goal: 'lead', brand: '橙果少儿美术', area: '莘庄',
      entryItem: '试听体验课', entryPrice: '9.9', mainItem: '季度班', mainPrice: '1280', origPrice: '1980', gift: '画材礼包'
    }), variants: 2
  },
  {
    name: '餐饮 · 30秒 · 方言口语化 · 到店引流（2026 平台鼓励：方言+普通话字幕，拉高同城转化）', cfg: Object.assign({}, base, {
      category: 'food', duration: 'd30', style: 'dialect', goal: 'traffic', brand: '川渝火锅', area: '南京西路',
      entryItem: '双人套餐', entryPrice: '79', mainItem: '四人餐', mainPrice: '159', origPrice: '328', gift: '冰粉一份'
    }), variants: 2
  }
];

W('# 抖音来客投流文案工作台 · 真实输出样例');
W('');
W('> 以下内容由工具引擎实际运行生成（非人工撰写、非示意），用于评估生成质量。');
W('> 生成时间：' + new Date().toLocaleString('zh-CN'));
W('');

cases.forEach((c, ci) => {
  W('---');
  W('');
  W('## 场景 ' + (ci + 1) + '：' + c.name);
  W('');
  W('**输入参数**：品牌「' + c.cfg.brand + '」/ 商圈「' + c.cfg.area + '」/ 引流品「' +
    (c.cfg.entryItem || '未填') + ' ' + (c.cfg.entryPrice || '') + '元」/ 主推品「' +
    (c.cfg.mainItem || '未填') + ' ' + (c.cfg.mainPrice || '') + '元，原价 ' + (c.cfg.origPrice || '-') + '」');
  W('');

  for (let i = 0; i < c.variants; i++) {
    const r = DS.generate(c.cfg, i);
    W('### 变体 ' + r.variant + '｜钩子类型：' + r.hookType + '｜时长档：' + r.durationLabel + '｜口播字数：' + r.wordCount + ' 字');
    W('');
    W('**口播脚本（带时间码）**');
    W('');
    W('```');
    W(r.script);
    W('```');
    W('');
    W('**分镜表**');
    W('');
    W('| 时间 | 画面 | 口播 | 字幕 | 拍摄要点 |');
    W('|---|---|---|---|---|');
    r.rows.forEach(row => {
      W('| ' + row.time + ' | ' + row.shot + ' | ' + String(row.line).replace(/\|/g, '/') +
        ' | ' + String(row.subtitle).replace(/\|/g, '/') + ' | ' + row.note + ' |');
    });
    W('');
    W('- **视频标题**：' + r.title);
    W('- **话题标签**：' + r.topics);
    W('- **评论区置顶**：' + r.comment);
    if (r.reviewLine) W('- **顾客评价引用（选插入）**：' + r.reviewLine);
    if (r.certLabels) W('- **自证标签（角标/字幕）**：' + r.certLabels.join('、'));
    if (r.refundLine) W('- **核销保障话术**：' + r.refundLine);
    W('- **合规自检**：P0=' + r.risk.p0 + '｜P1=' + r.risk.p1 + '｜P2=' + r.risk.p2 +
      (r.risk.hits.length ? '｜命中：' + DS.uniqueHits(r.risk.hits).map(h => h.level + ':' + h.word).join('、') : '｜✅ 全部通过'));
    W('');
  }
});

/* 合规扫描能力演示 */
W('---');
W('');
W('## 合规自检能力实测');
W('');
const badCases = [
  '全网最低价！加微信领券，专业祛痘生发，效果100%保证，比别家好，最后一天限时秒杀！',
  '本店首创国家级美容技术，包治各种皮肤问题，无效退款，永久有效不限次！',
  '原价999现价99，仅此一天，加V信xxx进群抢券，根治脱发不反弹！'
];
badCases.forEach((bad, i) => {
  const s = DS.scan(bad);
  const p = DS.purify(bad);
  W('### 测试用例 ' + (i + 1));
  W('');
  W('**原文**：' + bad);
  W('');
  W('- 扫描结果：**P0=' + s.p0 + '（高危）｜P1=' + s.p1 + '（需核实）｜P2=' + s.p2 + '（需自证）**');
  W('- 命中词：' + DS.uniqueHits(s.hits).map(h => '`' + h.level + ':' + h.word + '`').join(' ') );
  W('- **一键净化后**：' + p.text);
  W('');
});

/* 能力矩阵 */
W('---');
W('');
W('## 参数覆盖矩阵');
W('');
W('| 维度 | 可选项 | 数量 |');
W('|---|---|---|');
W('| 行业品类 | ' + Object.keys(DS.categories).map(k => DS.categories[k].name).join('、') + ' | ' + Object.keys(DS.categories).length + ' |');
W('| 时长档位 | ' + Object.keys(DS.durations).map(k => DS.durations[k].label).join('、') + ' | ' + Object.keys(DS.durations).length + ' |');
W('| 开场钩子 | ' + Object.keys(DS.hooks).map(k => DS.hooks[k].label).join('、') + ' | ' + Object.keys(DS.hooks).length + ' |');
var wordTotal = 0, catCount = { P0: 0, P1: 0, P2: 0 };
DS.riskRules.forEach(function (r) { wordTotal += r.words.length; catCount[r.level] += r.words.length; });
W('| 违禁词库 | P0 高危 ' + catCount.P0 + ' 词 / P1 需核实 ' + catCount.P1 + ' 词 / P2 需自证 ' + catCount.P2 + ' 词 | ' + wordTotal + ' 词 |');
W('| 风险规则组 | ' + DS.riskRules.map(function (r) { return r.level + '·' + r.cat; }).join('、') + ' | ' + DS.riskRules.length + ' 组 |');
W('');

fs.writeFileSync(path.join(__dirname, '..', 'AI评审-真实输出样例.md'), out.join('\n'), 'utf8');
console.log('已导出：AI评审-真实输出样例.md');
console.log('总行数：' + out.length);
