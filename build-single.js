#!/usr/bin/env node
/* 打包为单文件 HTML：内联全部 CSS 与 JS，便于离线使用 / 上传给 AI 分析
 *
 * 用法：
 *   node build-single.js                      构建并写入仓库内 standalone.html
 *   node build-single.js --check               只校验 standalone.html 是否与模块源一致（CI 用）
 *   node build-single.js --out <path>          指定输出路径（不再默认写仓库上级目录）
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const isCheck = argv.includes('--check');
const outIdx = argv.indexOf('--out');
const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const JS_FILES = [
  'js/guard.js', 'js/data.js', 'js/data-category.js', 'js/data-lines.js',
  'js/data-compliance.js', 'js/data-brief.js', 'js/engine.js', 'js/app.js',
  'js/extract-tab.js', 'js/rewrite-tab.js', 'js/data-analysis.js', 'js/plan-generator.js',
];

function build() {
  let html = read('index.html');
  const css = read('css/app.css');

  /* 内联 CSS */
  const cssLink = /<link rel="stylesheet" href="css\/app\.css">/;
  if (!cssLink.test(html)) {
    throw new Error('index.html 未找到 css/app.css 外链标签，内联规则需同步更新');
  }
  html = html.replace(cssLink, '<style>\n' + css + '\n</style>');

  /* 移除所有外链 script */
  const scriptCount = (html.match(/<script src="js\/[^"]+"><\/script>/g) || []).length;
  html = html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');

  const bundle = JS_FILES.map(
    (f) => '/* ==================== ' + f + ' ==================== */\n' + read(f)
  ).join('\n\n');

  /* 防止内联脚本中出现 </script 提前闭合标签 */
  const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');
  html = html.replace(/<\/body>/, '<script>\n' + safeBundle + '\n</script>\n</body>');

  html = html.replace(/<title>([^<]*)<\/title>/, '<title>$1（单文件版）</title>');
  return { html, scriptCount };
}

function validate(html) {
  const problems = [];
  if (/href="css\//.test(html)) problems.push('残留外链 CSS');
  if (/src="js\//.test(html)) problems.push('残留外链 JS');
  if (!/<style>/.test(html)) problems.push('CSS 未内联');
  if (html.split('<script>').length < 2) problems.push('JS 未内联');
  /* 单文件版不得再直连第三方 LLM */
  if (/https?:\/\/(integrate\.api\.nvidia|api\.deepseek|api\.openai|api\.sensenova)/.test(html)) {
    problems.push('单文件版仍包含第三方 LLM 直连地址');
  }
  return problems;
}

const { html, scriptCount } = build();
const problems = validate(html);

if (problems.length) {
  console.error('构建校验失败：');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}

const outPath = outArg ? path.resolve(outArg) : path.join(root, 'standalone.html');

if (isCheck) {
  if (!fs.existsSync(outPath)) {
    console.error(`--check 失败：${outPath} 不存在`);
    process.exit(1);
  }
  const current = fs.readFileSync(outPath, 'utf8');
  if (current === html) {
    console.log('✅ --check 通过：standalone.html 与 index.html + css + js 完全一致');
    console.log(`   体积 ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB ｜ 内联脚本 ${JS_FILES.length} 个`);
    process.exit(0);
  }
  const delta = Buffer.byteLength(html, 'utf8') - Buffer.byteLength(current, 'utf8');
  console.error('❌ --check 失败：standalone.html 与模块源不一致');
  console.error(`   现有 ${Buffer.byteLength(current, 'utf8')} 字节 ｜ 重建 ${Buffer.byteLength(html, 'utf8')} 字节 ｜ 差值 ${delta} 字节`);
  console.error('   请运行 node build-single.js 重新生成');
  process.exit(1);
}

fs.writeFileSync(outPath, html, 'utf8');
console.log(`已生成：${outPath}`);
console.log(`体积：${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`内联脚本：${JS_FILES.length} 个（index.html 原有外链 ${scriptCount} 个）`);
console.log(`残留外链 CSS：${/href="css\//.test(html)} ｜ 残留外链 JS：${/src="js\//.test(html)}`);
