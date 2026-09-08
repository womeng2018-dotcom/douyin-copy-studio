/* B 文案事实回归测试：未经确认的承诺/门店事实必须显式标注【待确认】，
 * 且价格数字保持原值、不臆造价格差。
 * 运行：node test-data-category.js
 */
const fs = require('fs');
const path = require('path');
global.window = global;

['data.js', 'data-category.js', 'data-lines.js', 'data-compliance.js', 'data-brief.js', 'engine.js']
  .forEach(f => eval(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')));

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ✅ ' + name); }
  else { console.error('  ❌ ' + name); failures++; }
}

/* 1) 源码中不得遗留静默的 // 待确认 注释（已改为生成文案内的可见标注） */
const src = fs.readFileSync(path.join(__dirname, 'js', 'data-category.js'), 'utf8');
check('源码无静默 // 待确认 注释', !/\/\/\s*待确认/.test(src));

/* 2) 所有未确认承诺/事实都带可见【待确认】标注，且总数为 11 处 */
const allStrings = [];
Object.keys(DS.categories).forEach(function (k) {
  const c = DS.categories[k];
  (c.benefits || []).concat(c.proofs || []).forEach(function (s) { allStrings.push(s); });
});
const tagged = allStrings.filter(function (s) { return s.indexOf('【待确认') >= 0; });
check('未确认标注总数为 11（10 处注释，其中 hair 连锁标准覆盖 2 个品类）', tagged.length === 11);

/* 3) 关键未确认短语确实存在且带标注（防止误删） */
const mustContain = [
  '{storeCount}家连锁同一套服务标准【待确认：门店数量须与实际一致】',
  '连锁门店、平台担保，跑不了【待确认：门店/平台担保表述须与门店实际一致】',
  '团购未核销随时退【待确认：退款承诺须与后台套餐规则一致】',
  '做完不满意可以调【待确认：服务承诺须与门店实际一致】',
  '未核销随时退【待确认：退款承诺须与后台套餐规则一致】',
  '团购随时退【待确认：退款承诺须与后台套餐规则一致】',
  '连锁品牌统一装修【待确认：连锁门店表述须与门店实际一致】',
  '大众化价位、明码标价【待确认：明码标价须与门店实际一致】',
  '连锁门店统一标准【待确认：连锁统一标准须与门店实际一致】',
  '连锁品牌统一标准【待确认：连锁统一标准须与门店实际一致】'
];
mustContain.forEach(function (sub) {
  check('标注存在：' + sub.slice(0, 10) + '…', allStrings.indexOf(sub) >= 0);
});

/* 4) 数字保持原值（防止误改价格 / 臆造价格差） */
const expect = {
  hair:   { entryPrice: '9.9',  mainPrice: '39.9', origPrice: '198' },
  beauty: { entryPrice: '19.9', mainPrice: '69',   origPrice: '298' },
  nail:   { entryPrice: '19.9', mainPrice: '59',   origPrice: '168' },
  food:   { entryPrice: '39.9', mainPrice: '99',   origPrice: '268' },
  edu:    { entryPrice: '9.9',  mainPrice: '199',  origPrice: '680' },
  fitness:{ entryPrice: '19.9', mainPrice: '99',   origPrice: '399' },
  home:   { entryPrice: '0',    mainPrice: '299',  origPrice: '899' },
  spa:    { entryPrice: '39.9', mainPrice: '89',   origPrice: '198' }
};
Object.keys(expect).forEach(function (k) {
  const c = DS.categories[k];
  const e = expect[k];
  check(k + ' 价格未变（entry/main/orig）',
    c.entryPrice === e.entryPrice && c.mainPrice === e.mainPrice && c.origPrice === e.origPrice);
});

/* 5) 渲染管线（DS.fill）不得丢失标注：每个品类的每条 benefit 渲染后仍保留其是否带标注 */
['beauty', 'hair', 'spa', 'nail', 'edu', 'fitness'].forEach(function (k) {
  const c = DS.categories[k];
  for (let i = 0; i < c.benefits.length; i++) {
    const raw = c.benefits[i];
    const filled = DS.fill(raw, { staff: c.staff, storeCount: '100' });
    const hasBefore = raw.indexOf('【待确认') >= 0;
    const hasAfter = filled.indexOf('【待确认') >= 0;
    check(k + ' benefit[' + i + '] 渲染后标注保持', hasBefore === hasAfter);
  }
});

console.log(failures === 0 ? '\n✅ B 文案事实回归全部通过' : '\n❌ B 文案事实回归失败：' + failures + ' 项');
process.exit(failures === 0 ? 0 : 1);
