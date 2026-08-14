/* 打包为单文件 HTML：内联全部 CSS 与 JS，便于上传给 AI 分析 / 离线使用 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
const css = read('css/app.css');

const jsFiles = ['js/data.js', 'js/data-category.js', 'js/data-lines.js',
  'js/data-compliance.js', 'js/data-brief.js', 'js/engine.js', 'js/app.js', 'js/extract-tab.js', 'js/rewrite-tab.js',
  'js/data-analysis.js', 'js/plan-generator.js'];

/* 内联 CSS */
html = html.replace(/<link rel="stylesheet" href="css\/app\.css">/,
  '<style>\n' + css + '\n</style>');

/* 移除所有外链 script，并在原位置注入合并后的 JS */
html = html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');

const bundle = jsFiles.map(f =>
  '/* ==================== ' + f + ' ==================== */\n' + read(f)
).join('\n\n');

html = html.replace(/<\/body>/, '<script>\n' + bundle + '\n</script>\n</body>');

/* 标注单文件版本 */
html = html.replace(/<title>([^<]*)<\/title>/, '<title>$1（单文件版）</title>');

/* 输出：仓库内 standalone.html（随站点发布）+ 上级目录便携版 */
const outPath = path.join(root, 'standalone.html');
fs.writeFileSync(outPath, html, 'utf8');
try {
  fs.writeFileSync(path.join(root, '..', '投流文案工作台-单文件版.html'), html, 'utf8');
} catch (e) { /* 上级目录不可写时忽略 */ }

/* 校验 */
const remainLink = /href="css\//.test(html);
const remainScript = /src="js\//.test(html);
console.log('已生成：standalone.html（仓库内） + 投流文案工作台-单文件版.html（上级目录）');
console.log('体积：' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB');
console.log('残留外链 CSS：' + remainLink + ' ｜ 残留外链 JS：' + remainScript);
console.log('内联脚本文件数：' + jsFiles.length);
