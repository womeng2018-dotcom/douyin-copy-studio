/* 引擎自测：在 Node 中模拟 window 环境 */
const fs = require('fs');
const path = require('path');
global.window = global;

['data.js', 'data-category.js', 'data-lines.js', 'data-compliance.js', 'data-brief.js', 'engine.js']
  .forEach(f => eval(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')));

const cfg = {
  category: 'hair', goal: 'groupbuy', duration: 'd30', style: 'oral', hookType: 'auto',
  brand: '星悦造型', area: '静安大悦城', storeCount: '100', deadline: '8月10日-16日有效',
  entryItem: '洗剪吹体验', entryPrice: '9.9', mainItem: '深层护理套餐',
  mainPrice: '39.9', origPrice: '198', gift: '肩颈按摩5分钟'
};

console.log('===== 30s 美发 · 3条变体 =====\n');
for (let i = 0; i < 3; i++) {
  const r = DS.generate(cfg, i);
  console.log(`--- 变体 ${r.variant} | ${r.hookType} | ${r.wordCount}字 ---`);
  console.log(r.script);
  console.log('标题：' + r.title);
  console.log('评论：' + r.comment);
  console.log('自检：P0=' + r.risk.p0 + ' P1=' + r.risk.p1 + ' P2=' + r.risk.p2 +
    (r.risk.hits.length ? ' | 命中: ' + DS.uniqueHits(r.risk.hits).map(h => h.level + ':' + h.word).join(', ') : ' | 通过'));
  console.log('');
}

console.log('===== 15s 美容 · 促销感 =====\n');
const cfg2 = Object.assign({}, cfg, { category: 'beauty', duration: 'd15', style: 'promo', entryItem: '', entryPrice: '', mainItem: '', mainPrice: '', origPrice: '', brand: '悦肤美学', area: '五角场' });
const r2 = DS.generate(cfg2, 0);
console.log(r2.script);
console.log('自检：P0=' + r2.risk.p0 + ' P1=' + r2.risk.p1);
console.log('');

console.log('===== 60s 餐饮 · 探店 =====\n');
const cfg3 = Object.assign({}, cfg, { category: 'food', duration: 'd60', style: 'review', entryItem: '', entryPrice: '', mainItem: '', mainPrice: '', origPrice: '', gift: '', brand: '楠火锅', area: '中山公园' });
const r3 = DS.generate(cfg3, 1);
console.log(r3.script);
console.log('分镜行数：' + r3.rows.length);
console.log('自检：P0=' + r3.risk.p0 + ' P1=' + r3.risk.p1);
console.log('');

console.log('===== 违规文案检测测试 =====');
const bad = '全网最低价！加微信领券，专业祛痘生发，效果100%保证，比别家好，最后一天限时秒杀！';
const s = DS.scan(bad);
console.log('P0=' + s.p0 + ' P1=' + s.p1 + ' P2=' + s.p2);
console.log('命中：' + DS.uniqueHits(s.hits).map(h => h.level + ':' + h.word).join(' | '));
const p = DS.purify(bad);
console.log('净化后：' + p.text);
