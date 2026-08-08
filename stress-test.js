/* 全量功能测试：7 品类 × 3 时长 × 4 风格 + 边界情况 */
const fs = require('fs');
const path = require('path');
global.window = global;

['data.js', 'data-category.js', 'data-lines.js', 'data-compliance.js', 'data-brief.js', 'engine.js']
  .forEach(f => eval(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')));

const cats = Object.keys(DS.categories);
const durs = Object.keys(DS.durations);
const styles = ['oral', 'promo', 'review', 'story'];
const hooks = Object.keys(DS.hooks);

const issues = [];
let total = 0, pass = 0, fail = 0;

const check = (cond, msg, level = 'error') => {
  total++;
  if (cond) { pass++; return; }
  fail++;
  issues.push({ level, msg });
};

/* ========== 1. 7品类 × 3时长 × 4风格 生成测试 ========== */
console.log('===== 1. 生成能力矩阵（' + (cats.length*durs.length*styles.length) + ' 组）=====\n');
cats.forEach(cat => {
  durs.forEach(dur => {
    styles.forEach(sty => {
      const cfg = {
        category: cat, duration: dur, style: sty, goal: 'groupbuy',
        hookType: 'auto', brand: '测试' + DS.categories[cat].staff,
        area: '上海', entryItem: '测试引流', entryPrice: '9.9',
        mainItem: '测试套餐', mainPrice: '39.9', origPrice: '198'
      };
      for (let i = 0; i < 2; i++) {
        try {
          const r = DS.generate(cfg, i);
          const wc = r.wordCount;
          const durTotal = DS.durations[dur].total;
          const maxWords = Math.round(durTotal * 5); // 5字/秒
          check(r.variant && r.script && r.rows.length >= 3,
            `[${cat}|${dur}|${sty}] 变体${r.variant}: 缺少必要字段(rows=${r.rows.length})`, 'error');
          check(r.title.length > 5,
            `[${cat}|${dur}|${sty}] 变体${r.variant}: 标题太短「${r.title}」`, 'warn');
          check(wc <= maxWords + 15,
            `[${cat}|${dur}|${sty}] 变体${r.variant}: ${wc}字超过${maxWords}字上限`, 'warn');
          check(r.risk.p0 === 0,
            `[${cat}|${dur}|${sty}] 变体${r.variant}: P0违禁词 ${r.risk.p0} 个`, 'error');
        } catch(e) {
          check(false, `[${cat}|${dur}|${sty}] 崩溃: ${e.message}`, 'error');
        }
      }
    });
  });
});

/* ========== 2. 4种指定钩子 ========== */
console.log('\n===== 2. 4 种指定钩子测试 =====');
hooks.forEach(hk => {
  const cfg = { category: 'hair', duration: 'd30', style: 'oral', goal: 'groupbuy',
    hookType: hk, brand: 'A', area: 'B', entryItem: 'X', entryPrice: '9',
    mainItem: 'Y', mainPrice: '39', origPrice: '198' };
  const r = DS.generate(cfg, 0);
  check(r.hookType === DS.hooks[hk].label,
    `[钩子:${hk}] 应为「${DS.hooks[hk].label}」, 实际「${r.hookType}」`, 'error');
});

/* ========== 3. 异常/边界输入 ========== */
console.log('\n===== 3. 边界输入测试 =====');
const empty = { category: 'hair', duration: 'd30', style: 'oral', goal: 'groupbuy', hookType: 'auto' };
const re = DS.generate(empty, 0);
check(re.script.length > 0, '全空参数仍能生成（应回退品类预设）', 'error');

const unknownCat = Object.assign({}, empty, { category: '不存在的品类' });
const ru = DS.generate(unknownCat, 0);
check(ru.script.length > 0, '未知品类应优雅降级而非崩溃', 'error');

/* ========== 4. 合规扫描深度 ========== */
console.log('\n===== 4. 合规扫描边界测试 =====');
const tests = [
  { text: '加微信', expect: 'P0', reason: '站外引流' },
  { text: '最佳效果', expect: 'P0', reason: '绝对化' },
  { text: '祛痘生发', expect: 'P0', reason: '医疗功效' },
  { text: '随时退', expect: 'P2', reason: '承诺类需自证' },
  { text: '限时秒杀', expect: 'P1', reason: '限时真实性' },
  { text: '好评如潮', expect: 'P1', reason: '数据需依据' },
  { text: '纹绣半永久', expect: 'P2', reason: '资质相关' },
  { text: '明星同款', expect: 'P2', reason: '肖像版权' },
  { text: '洗剪吹很划算', expect: null, reason: '正常表述不应命中' }
];
tests.forEach(t => {
  const s = DS.scan(t.text);
  const got = s.p0 > 0 ? 'P0' : (s.p1 > 0 ? 'P1' : (s.p2 > 0 ? 'P2' : null));
  check(got === t.expect,
    `[合规:${t.reason}] 输入「${t.text}」应判${t.expect || '通过'}, 实际${got || '通过'}`, 'error');
});

/* ========== 5. 一键净化 ========== */
console.log('\n===== 5. 净化测试 =====');
const dirty = '我们是全网最低价，加微信领券，专业祛痘生发，效果100%保证，比别家好！';
const pu = DS.purify(dirty);
check(pu.text.indexOf('加微信') === -1, '净化后应无「加微信」', 'error');
check(pu.text.indexOf('生发') === -1, '净化后应无「生发」', 'error');
check(pu.text.indexOf('100%') === -1, '净化后应无「100%」', 'error');
check(pu.text.indexOf('比别家') === -1, '净化后应无「比别家」', 'error');
check(!pu.text.match(/(^|[,，])价[,，。]|\b价\b[^。]*$/) || pu.text.endsWith('！') || pu.text.endsWith('。'),
  '净化后不应出现孤立的「价」残字', 'warn');
console.log('  净化前：' + dirty);
console.log('  净化后：' + pu.text);

/* ========== 6. 品类辨识度抽查 ========== */
console.log('\n===== 6. 品类辨识度抽查 =====');
['hair', 'food', 'edu', 'fitness'].forEach(cat => {
  const cfg = { category: cat, duration: 'd30', style: 'oral', goal: 'groupbuy',
    hookType: 'auto', brand: 'X', area: 'Y', entryItem: 'Z', entryPrice: '9',
    mainItem: 'W', mainPrice: '39', origPrice: '198' };
  const r = DS.generate(cfg, 0);
  console.log(`  ${cat}: ${r.hookType} | ${r.script.replace(/\n/g, ' ')}...`);
});

/* ========== 汇总 ========== */
console.log('\n' + '='.repeat(50));
console.log(`测试完成：${total} 项，通过 ${pass}，失败 ${fail}`);
if (issues.length) {
  console.log('\n问题列表：');
  issues.forEach((i, idx) => console.log(`  [${i.level.toUpperCase()}] #${idx+1} ${i.msg}`));
}
console.log('\n' + '='.repeat(50));
