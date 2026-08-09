/**
 * 足浴·SPA 品类 — 抖音来客后台数据分析
 * 数据来源：用户后台截图（2026-08-09）
 * 用途：指导投流定向、套餐定价、达人合作、视频内容策略
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};

  DS.spaAnalysis = {
    /* ============================================================
     * 一、潜在用户画像（截图1）
     * ============================================================ */
    audience: {
      title: '潜在用户画像',
      groups: [
        { name: 'GenZ（18-23岁）', pct: '20%', note: '第一主力，悦己消费+社交需求' },
        { name: '新锐白领（24-30岁）', pct: '19%', note: '核心客群，通勤放松+形象管理' },
        { name: '都市蓝领（31-40岁）', pct: '13%', note: '稳定客群，健康保养刚需' },
        { name: '都市银发', pct: '6%', note: '低占比但高客单，中老年养生' },
        { name: '资深中产', pct: '3%', note: '品质型，愿为服务体验买单' },
        { name: '城镇青年', pct: '3%', note: '县域市场，价格敏感' },
        { name: '精致妈妈', pct: '2%', note: '携家/亲子时段引流' },
        { name: '城镇中老年', pct: '1%', note: '增量空间' }
      ],
      gender: [
        { age: '18-23岁', female: 5, male: 10, note: 'GenZ 女多男少' },
        { age: '24-30岁', female: 15, male: 16, note: '白领核心层' },
        { age: '31-40岁', female: 21, male: 22, note: '主力消费年龄段（男>女）' },
        { age: '41-50岁', female: 5, male: 6, note: '中年保养' },
        { age: '>50岁', female: 2, male: 3, note: '银发潜力' }
      ],
      insight: '八大人群中，GenZ+新锐白领+都市蓝领占 52%，是投流定向的核心三人群。31-40岁人群男女消费额几乎持平（男21万/女22万），说明该品类男客占比远超行业平均，需重点关注男客定向。'
    },

    /* ============================================================
     * 二、同品类品牌与价格分析（截图1下部）
     * ============================================================ */
    category: {
      title: '同品类品牌与价格',
      topBrands: [
        { name: '郑远元', index: '99.94', note: '修脚品类头部品牌' },
        { name: '大桶大足道', index: '96.07', note: '足疗连锁' }
      ],
      priceDist: [
        { range: '¥0-49', pct: '10%', note: '引流款，走量' },
        { range: '¥98-147', pct: '17%', note: '入门款' },
        { range: '¥98-147', pct: '35%', note: '主销价格带 ⭐' },
        { range: '¥98-147', pct: '25%', note: '次主力' },
        { range: '¥196-245', pct: '10%', note: '中端' },
        { range: '¥294-343', pct: '9%', note: '高端' },
        { range: '¥294-343', pct: '7%', note: '高端' },
        { range: '¥392-441', pct: '4%', note: '顶配' },
        { range: '¥392-441', pct: '5%', note: '顶配' }
      ],
      insight: '主销价格带集中在 ¥98-147（占 60%），当前工作台的 mainPrice ¥89 偏低——建议把主力套餐提至 ¥98-128 区间，保留 ¥39.9 引流款。'
    },

    /* ============================================================
     * 三、用户搜索与视频偏好（截图1词云 + 截图2）
     * ============================================================ */
    interest: {
      title: '用户搜索词与内容偏好',
      topSearch: ['按摩', '足浴', 'SPA', '台球', '石锅鱼', '采耳', '头疗', '网吧', 'K歌', '健身房', '洗浴', '理发店', '烧烤', '漂流'],
      videoCategories: [
        { name: '休闲娱乐', score: 280, note: '第一内容偏好' },
        { name: '家居家政', score: 120, note: '家居服务关联' },
        { name: '运动健身', score: 110, note: '运动恢复/拉伸' },
        { name: '文旅', score: 100, note: '旅游场景' },
        { name: '个人护理', score: 98, note: '美容美体' },
        { name: '宠物', score: 95, note: '陪伴场景' },
        { name: '美食', score: 92, note: '休闲组合' },
        { name: '教育培训', score: 70, note: '低关联' },
        { name: '结婚', score: 65, note: '低关联' },
        { name: '亲子', score: 60, note: '低关联' }
      ],
      insight: '视频内容应走「休闲娱乐」路线（探店、放松、解压），而非医疗养生。搜索词中「按摩/足浴/SPA」与「台球/网吧/K歌」强关联，说明用户多为年轻男性休闲娱乐场景，口播文案应避免过度强调"养生/保健"标签。'
    },

    /* ============================================================
     * 四、TOP成交达人（截图2）
     * ============================================================ */
    creators: {
      title: '近15日同品类TOP成交达人',
      list: [
        { rank: 1, name: '张子晨', fans: '10.2万', index: '99.93', note: '头部，探店+剧情' },
        { rank: 2, name: '包子脸', fans: '1.8万', index: '91.41', note: '中腰部，高性价比' },
        { rank: 3, name: '上海按摩哪家强｜元帅', fans: '1.8万', index: '89.57', note: '垂类账号' },
        { rank: 4, name: '桃桃逛魔都', fans: '1.8万', index: '88.96', note: '探店种草' },
        { rank: 5, name: '魔都蜜探', fans: '7.2万', index: '87.41', note: '本地生活探店' }
      ],
      insight: '成交指数TOP5达人粉丝量集中在 1.8万-10.2万，均为上海本地生活探店类。合作策略：优先「上海按摩哪家强｜元帅」（垂类最匹配，粉丝量低但成交指数89.57），其次桃桃逛魔都、魔都蜜探（本地流量）。预算分配：1个腰部+2个尾部组合投放，ROI 最稳。'
    },

    /* ============================================================
     * 五、投放人群画像（截图3）
     * ============================================================ */
    targeting: {
      title: '投放人群画像（实际消耗）',
      core: [
        { dim: '核心人群', value: '新锐白领 55.54% + 资深中产 17.92% + 都市蓝领 13.66%', note: '三类人群占 87%' },
        { dim: '性别', value: '男性 89.99%', note: '几乎纯男客，与行业认知一致' },
        { dim: '年龄段', value: '31-40岁 43.33%', note: '消费主力' },
        { dim: '城市', value: '上海市 77.01% + 扬州市 6.6%', note: '上海为主，扬州次之' }
      ],
      groups: [
        { name: '新锐白领', pct: '55.54%', amount: '¥1,769.78', note: '第一消耗人群' },
        { name: '资深中产', pct: '17.92%', amount: '-', note: '高客单' },
        { name: '都市蓝领', pct: '13.66%', amount: '-', note: '稳定' },
        { name: '都市银发', pct: '3.80%', amount: '-', note: '低量高客单' },
        { name: 'GenZ', pct: '5.01%', amount: '-', note: '年轻增量' },
        { name: '精致妈妈', pct: '0.66%', amount: '-', note: '几乎无消耗' },
        { name: '城镇青年', pct: '0.45%', amount: '-', note: '微量' },
        { name: '城镇中老年', pct: '0.04%', amount: '-', note: '微量' }
      ],
      ageDist: [
        { age: '18-23岁', amount: '¥低', note: '消耗极少' },
        { age: '24-30岁', amount: '¥470', note: '次主力' },
        { age: '31-40岁', amount: '¥880', note: '绝对主力 ⭐' },
        { age: '41-50岁', amount: '¥350', note: '次主力' },
        { age: '>50岁', amount: '¥30', note: '微量' }
      ],
      regions: [
        { city: '上海市', amount: '¥1,769.78', pct: '77.01%', note: '主战场' },
        { city: '浙江省', amount: '¥239.46', pct: '10.42%', note: '次区域' },
        { city: '江苏省', amount: '¥153.28', pct: '6.67%', note: '次区域' },
        { city: '陕西省', amount: '¥0.17', pct: '0.01%', note: '微量' },
        { city: '湖北省', amount: '¥0.01', pct: '0.00%', note: '微量' }
      ],
      insight: '实际消耗数据印证了「男客导向」：男性占 89.99%，31-40 岁占 43.33%，上海占 77%。投流策略：地域定向以上海为核心（77%消耗），叠加江浙（17%）扩量；人群包锁定「新锐白领+资深中产+都市蓝领」三类，剔除「精致妈妈/城镇中老年」（<1%消耗）。'
    },

    /* ============================================================
     * 六、综合优化建议
     * ============================================================ */
    recommendations: [
      {
        category: '投流定向',
        title: '定向人群包调整',
        detail: '核心包：上海+新锐白领+资深中产+都市蓝领（31-40岁男性为主）。扩量包：江浙地区+都市蓝领+GenZ。剔除：精致妈妈/城镇中老年（消耗<1%）。'
      },
      {
        category: '套餐定价',
        title: '主力套餐定价上探',
        detail: '主销价格带 ¥98-147 占 60%，当前 ¥89 偏低。建议：引流款 ¥39.9 保留；主力套餐提至 ¥98-128；新增 ¥198 高端款（匹配资深中产需求）。'
      },
      {
        category: '内容策略',
        title: '口播文案去"医疗化"',
        detail: '用户搜索「按摩/足浴/SPA」与「台球/网吧/K歌」强关联，说明是年轻男性休闲娱乐场景。文案避免「治疗/保健/中医」字眼，改走「解压/放松/下班去哪」路线。'
      },
      {
        category: '达人合作',
        title: '垂类+本地组合投放',
        detail: '首选「上海按摩哪家强｜元帅」（垂类，89.57指数）；搭配桃桃逛魔都/魔都蜜探（本地流量）。预算比例 4:3:3，跑两周后看 ROI 优化。'
      },
      {
        category: '视频方向',
        title: '内容标签匹配',
        detail: '按视频偏好排序：休闲娱乐（280分）> 家居家政（120分）> 运动健身（110分）。口播开头 3 秒可用「下班不知道去哪放松」「打工人周末好去处」切入。'
      },
      {
        category: '品类话术',
        title: '男客定向话术优化',
        detail: '针对 89.99% 男性客群：强调「不推销不办卡」「30分钟做完不耽误事」「技师手法标准化」——直击男性「怕被推销+重效率」两大痛点。'
      }
    ]
  };

  /* ============================================================
   * 渲染函数：将数据分析插入工作台 Tab
   * ============================================================ */
  function renderDataTab() {
    var container = document.getElementById('dataContent');
    if (!container) return;

    var d = DS.spaAnalysis;
    var html = '';

    // 标题
    html += '<div style="margin-bottom:20px">';
    html += '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);font-weight:600;margin-bottom:6px">数据分析</div>';
    html += '<div style="font-size:20px;font-weight:700;color:var(--text);letter-spacing:-.02em">足浴·SPA 品类 — 抖音来客数据洞察</div>';
    html += '<div style="font-size:12px;color:var(--text-3);margin-top:4px">数据来源：2026-08-09 后台截图 · 指导投流、定价、内容、达人合作</div>';
    html += '</div>';

    // ---- 一、受众画像 ----
    html += '<div class="shot" style="margin-bottom:20px"><div class="shot-title">一、潜在用户画像</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px">';
    d.audience.groups.forEach(function (g) {
      html += '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">' + g.name + '</div>';
      html += '<div style="font-size:18px;font-weight:700;color:var(--pri)">' + g.pct + '</div>';
      html += '<div style="font-size:11px;color:var(--text-3)">' + g.note + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="padding:12px;background:#e8f0fe;border-radius:8px;border-left:3px solid var(--pri);font-size:12px;color:var(--text-2);line-height:1.7">' + d.audience.insight + '</div>';
    html += '</div>';

    // ---- 二、品牌与价格 ----
    html += '<div class="shot" style="margin-bottom:20px"><div class="shot-title">二、同品类品牌与价格分布</div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
    d.category.topBrands.forEach(function (b) {
      html += '<span style="padding:4px 10px;background:#fff3e0;border-radius:6px;font-size:11px;color:#e65100;font-weight:500">' + b.name + '（成交指数 ' + b.index + '）</span>';
    });
    html += '</div>';
    html += '<div style="display:flex;gap:6px;align-items:flex-end;height:60px;margin-bottom:12px">';
    var maxPct = 35;
    d.category.priceDist.forEach(function (p) {
      var h = Math.round((parseInt(p.pct) / maxPct) * 50);
      var color = p.pct === '35%' ? 'var(--pri)' : p.pct === '25%' ? 'var(--cyan)' : 'var(--border)';
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
      html += '<div style="font-size:10px;font-weight:600;color:var(--text-2)">' + p.pct + '</div>';
      html += '<div style="width:100%;height:' + h + 'px;background:' + color + ';border-radius:3px 3px 0 0;min-height:4px"></div>';
      html += '<div style="font-size:9px;color:var(--text-3);white-space:nowrap">' + p.range + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="padding:12px;background:#e8f5e9;border-radius:8px;border-left:3px solid #4caf50;font-size:12px;color:var(--text-2);line-height:1.7">' + d.category.insight + '</div>';
    html += '</div>';

    // ---- 三、搜索与偏好 ----
    html += '<div class="shot" style="margin-bottom:20px"><div class="shot-title">三、用户搜索词与视频偏好</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">';
    d.interest.topSearch.forEach(function (w) {
      html += '<span style="padding:3px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-2)">' + w + '</span>';
    });
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-bottom:12px">';
    d.interest.videoCategories.slice(0, 5).forEach(function (v) {
      html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-size:12px;color:var(--text-2)">' + v.name + '</span>';
      html += '<span style="font-size:13px;font-weight:600;color:var(--pri)">' + v.score + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="padding:12px;background:#fff8e1;border-radius:8px;border-left:3px solid #ffc107;font-size:12px;color:var(--text-2);line-height:1.7">' + d.interest.insight + '</div>';
    html += '</div>';

    // ---- 四、达人 ----
    html += '<div class="shot" style="margin-bottom:20px"><div class="shot-title">四、近15日同品类TOP成交达人</div>';
    html += '<table class="shots" style="margin-bottom:12px"><thead><tr><th>排名</th><th>达人</th><th>粉丝量</th><th>成交指数</th><th>类型</th></tr></thead><tbody>';
    d.creators.list.forEach(function (c) {
      html += '<tr><td style="font-weight:600;color:var(--pri)">#' + c.rank + '</td><td>' + c.name + '</td><td>' + c.fans + '</td><td style="font-weight:600">' + c.index + '</td><td style="font-size:11px;color:var(--text-3)">' + c.note + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="padding:12px;background:#f3e5f5;border-radius:8px;border-left:3px solid #9c27b0;font-size:12px;color:var(--text-2);line-height:1.7">' + d.creators.insight + '</div>';
    html += '</div>';

    // ---- 五、投放人群 ----
    html += '<div class="shot" style="margin-bottom:20px"><div class="shot-title">五、投放人群画像（实际消耗）</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px">';
    d.targeting.core.forEach(function (t) {
      html += '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">';
      html += '<div style="font-size:11px;color:var(--text-3);margin-bottom:4px">' + t.dim + '</div>';
      html += '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">' + t.value + '</div>';
      html += '<div style="font-size:11px;color:var(--pri)">' + t.note + '</div>';
      html += '</div>';
    });
    html += '</div>';
    // 消耗表
    html += '<table class="shots" style="margin-bottom:12px"><thead><tr><th>城市</th><th>消耗金额</th><th>占比</th></tr></thead><tbody>';
    d.targeting.regions.forEach(function (r) {
      html += '<tr><td>' + r.city + '</td><td style="font-weight:600">' + r.amount + '</td><td>' + r.pct + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="padding:12px;background:#e8f0fe;border-radius:8px;border-left:3px solid var(--pri);font-size:12px;color:var(--text-2);line-height:1.7">' + d.targeting.insight + '</div>';
    html += '</div>';

    // ---- 六、优化建议 ----
    html += '<div class="shot"><div class="shot-title">六、综合优化建议</div>';
    d.recommendations.forEach(function (r, i) {
      html += '<div style="padding:12px;margin-bottom:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html += '<span style="padding:2px 8px;background:var(--pri);color:#fff;border-radius:4px;font-size:10px;font-weight:600">' + r.category + '</span>';
      html += '<span style="font-size:13px;font-weight:600;color:var(--text)">' + (i + 1) + '. ' + r.title + '</span>';
      html += '</div>';
      html += '<div style="font-size:12px;color:var(--text-2);line-height:1.7">' + r.detail + '</div>';
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
  }

  /* 初始化 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDataTab);
  } else {
    renderDataTab();
  }
})();
