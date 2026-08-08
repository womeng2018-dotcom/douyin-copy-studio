/* 句式库：钩子 / 卖点 / 优惠 / 信任 / CTA / 标题 / 评论区
 * 变量：{brand} {area} {staff} {entryItem} {mainItem} {entryPrice} {mainPrice}
 *       {origPrice} {storeCount} {deadline} {gift} {catName}
 */
window.DS = window.DS || {};

/* ========== 一、前3秒钩子（按类型分组） ========== */
DS.hooks = {
  benefit: {
    label: '利益点型',
    desc: '开门见山抛价格差，适合团购转化主投',
    lines: [
      '{area}的{aud}先别划走，{entryPrice}块能{verb}{entryItem}，我先说地址。',
      '门市价{origPrice}的{entryItem}，现在团购只要{entryPrice}，就在{area}。',
      '在{area}花{entryPrice}块做个{entryItem}，这个价我得说一下。',
      '{storeCount}家连锁的{catName}，今天团购价掉到{entryPrice}。'
    ]
  },
  question: {
    label: '疑问型',
    desc: '制造好奇，适合拉新与通投',
    lines: [
      '{area}这家{catName}，{entryPrice}块的{entryItem}到底能做成啥样？',
      '你猜这个{entryItem}多少钱？说出来{area}的邻居都得来一趟。',
      '{entryPrice}块钱在{area}还能干啥？我拿它做了个{entryItem}。',
      '为什么{area}的人最近都往这家{catName}跑？'
    ]
  },
  conflict: {
    label: '冲突反常识型',
    desc: '打破预期，完播率通常最高',
    lines: [
      '我一直以为{catName}都很贵，直到我在{area}发现这家。',
      '别再随便找店了，{area}这家连锁我先替你去试了。',
      '花{entryPrice}块之前我也不信，做完我改口了。',
      '同样是{entryItem}，为什么这家能便宜这么多？我去问了。'
    ]
  },
  identity: {
    label: '身份代入型',
    desc: '锁定周边人群，本地推地理围栏适配',
    lines: [
      '{area}附近的{aud}注意了，这条跟你有关。',
      '住在{area}这一片的，这家店你迟早会去。',
      '上班在{area}的{aud}，中午休息那点时间就够，不耽误下午。',
      '{area}这一片的{aud}，顺路就能安排上，不用特意跑一趟。'
    ]
  },
  pain: {
    label: '痛点型',
    desc: '直击顾虑，转化人群更精准',
    lines: [
      '{pain}？我在{area}找了家不用担心这个的。',
      '之前吃过亏——{pain}。这次我换了家连锁的。',
      '{pain}的，我建议你看完这条再做决定。',
      '别问我怎么知道{pain}，直接说我现在去哪家。'
    ]
  }
};

/* ========== 二、卖点/体验段 ========== */
DS.bodyLines = {
  intro: [
    '这家是{brand}，全国{storeCount}多家连锁，{area}这家离地铁口没几步。',
    '{brand}，{storeCount}多家连锁店，{area}这家环境是真干净。',
    '就是{area}的{brand}，连锁牌子，找店不用怕踩坑。'
  ],
  process: [
    '进门先{scene1}，{staff}都是总部统一培训的，手法有标准。',
    '{scene1}、{scene2}一套下来，全程不催不推销。',
    '从{scene1}到{scene3}，{staff}会先问你想要什么样的再动手。'
  ],
  feel: [
    '做完整个人都松快了，关键是全程没人跟我推卡。',
    '效果我自己是满意的，你们看这个状态。',
    '坐下来是真舒服，出来照镜子那一下值了。'
  ],
  differentiate: [
    '{benefit1}，这点我觉得比一般小店强。',
    '最实在的是{benefit1}，不用担心做一半被加价。',
    '{benefit1}，价格也是明码标出来的。'
  ]
};

/* ========== 三、优惠 / 信任 / CTA ========== */
DS.offerLines = [
  '{entryItem}团购价{entryPrice}，{mainItem}{mainPrice}，门市价是{origPrice}，差价自己算。',
  '现在下单{entryItem}只要{entryPrice}，加{mainPrice}能升级{mainItem}，{deadline}。',
  '{entryPrice}的{entryItem}是引流款，想做全套的选{mainPrice}的{mainItem}，{deadline}。'
];

DS.trustLines = [
  '抖音团购下单，没去成随时退、过期自动退，不用怕。',
  '平台担保交易，未核销可以退，到店按套餐来，不加价。',
  '团购券没核销随时退，套餐里写的就是做的，明码标价。'
];

DS.giftLines = [
  '到店还送{gift}。',
  '而且到店额外送{gift}。',
  '现在去的话{gift}也一起给你。'
];

DS.ctaLines = {
  groupbuy: [
    '点下面的团购券，选离你最近的{brand}直接到店就行。',
    '想去的点左下角团购，选好门店当天就能用。',
    '券在下面挂着，选{area}这家，到店报手机号核销。'
  ],
  traffic: [
    '点左下角看门店地址，导航过去十分钟不到。',
    '地址在下方门店里，{area}的直接导航过来。',
    '点进主页看门店定位，就在{area}这一片。'
  ],
  brand: [
    '{brand}，全国{storeCount}多家门店，你家附近大概率就有一家。',
    '想知道你家附近有没有，点主页看门店列表。',
    '{brand}，{area}这家只是其中一家，主页能看全部门店。'
  ]
};

/* ========== 三点五、分品类专属过程/感受句（避免跨行业串味） ========== */
DS.catLines = {
  hair: {
    process: ['进门先洗头按摩，{staff}都是总部统一培训的，会先问你想剪成什么样。',
      '洗、剪、吹一套下来四十分钟，全程不催也不推销办卡。',
      '{staff}上手前先沟通发质和脸型，剪完还教你怎么打理。'],
    feel: ['出来照镜子那一下是真值，整个人清爽了。', '发型我自己很满意，关键是没人跟我推卡。', '这个状态你们看，比我上次花两百做的还顺眼。']
  },
  beauty: {
    process: ['先卸妆洁面，然后做清洁和补水，{staff}手法很稳。',
      '全程躺着做完，中间还有肩颈放松，不会一直跟你推项目。',
      '{staff}会先看你皮肤状态再定方案，用的东西都当面拆。']
  },
  nail: {
    process: ['先挑款，几百个样式随便看，{staff}会帮你配肤色。',
      '修甲、上色、封层一步步来，工具是当面拆的。',
      '做的时候还能躺着刷手机，一个多小时就好了。'],
    feel: ['成品比我想象中精致，颜色特别显白。', '这个款式我很满意，能撑一个多月。', '手抬起来自己都多看两眼。']
  },
  food: {
    process: ['菜是现点现做的，上菜速度不慢，分量看着就实在。',
      '后厨是明档，做菜过程能看见，吃着放心。',
      '点了招牌几样，锅气足，味道比我预期的好。'],
    feel: ['两个人吃到扶墙出，性价比是真高。', '味道我给过关，下次带朋友还来。', '吃完这一顿，人均下来不到一杯奶茶钱。']
  },
  edu: {
    process: ['先带着参观校区，然后跟着上一节完整的体验课。',
      '{staff}会先了解孩子基础，小班上课能顾得过来。',
      '一节课下来孩子自己不想走，课后还有回访。'],
    feel: ['孩子上完自己说还想来，这就够了。', '体验课能看出老师的状态，我是放心的。', '先试一节再决定，不用一上来就交一年。']
  },
  fitness: {
    process: ['{staff}先做体测再排训练，不是甩给你自己练。',
      '场馆器械挺全，人不算多，不用排队等。',
      '一节课带下来，动作哪里不对当场就给纠。'],
    feel: ['练完出一身汗，人是真的松快。', '不办卡也能来，这点对我这种懒人友好。', '一次课下来动作会了，比自己瞎练强。']
  },
  home: {
    process: ['{staff}先上门量尺，然后当面报价，用什么材料都写清楚。',
      '施工是本地团队，进场时间和工期都提前定好。',
      '做完带着验收，有问题当场返工，不是做完就跑。'],
    feel: ['完工效果比我预期的整齐，收边处理得细。', '报价前后没变过，这点最省心。', '住进来才发现细节做得到位。']
  }
};

/* 15秒档专用短优惠句（控制在30字内，避免语速过密） */
DS.shortOffers = [
  '{entryItem}团购{entryPrice}，门市价{origPrice}，{deadline}。',
  '门市{origPrice}的{entryItem}，现在{entryPrice}拿下，{deadline}。',
  '{entryPrice}体验{entryItem}，{mainPrice}升级{mainItem}。'
];

/* ========== 四、标题 & 话题 & 评论区 ========== */
DS.titles = [
  '{area}居然还有{entryPrice}的{entryItem}｜{brand}',
  '{entryPrice}做了个{entryItem}，{area}的别再多花钱了',
  '{area}{catName}实测：门市{origPrice}，团购{entryPrice}',
  '{storeCount}家连锁的{catName}，{entryPrice}就能体验一次',
  '在{area}花{entryPrice}块，我做了这件事'
];

DS.topics = {
  common: ['#本地生活', '#团购', '#抖音团购', '#到店消费'],
  hair: ['#美发', '#换发型', '#理发店推荐'],
  beauty: ['#皮肤管理', '#面部护理', '#美容院'],
  nail: ['#美甲', '#美甲款式', '#美睫'],
  food: ['#美食探店', '#双人餐', '#聚餐'],
  edu: ['#兴趣班', '#体验课', '#亲子'],
  fitness: ['#健身', '#运动打卡', '#健身房'],
  home: ['#家装', '#旧房翻新', '#装修']
};

DS.comments = [
  '门店地址在左下角团购里，{area}这家，导航搜「{brand}」就行～',
  '有问价格的统一回复：{entryItem}{entryPrice}，{mainItem}{mainPrice}，{deadline}',
  '{aud}们下单前看清套餐内容哈，没去成随时退，不踩坑～',
  '问哪家店的都在这条评论里，{area}这家，团购券点下面',
  '核销问题：下单后到店出示团购码，店员扫码即可，7天有效过期自动退',
  '到店记得提「抖音来的」，部分门店有专属小福利～'
];

/* ========== 六、自证标签（2026 平台加分项，优先分发） ========== */
DS.certLabels = [
  '本店实拍，非效果图',
  '视频含拍摄时间水印',
  '顾客真实到店体验',
  '套餐内容与后台一致',
  '未使用修图/特效滤镜'
];

/* ========== 七、顾客评价引用句式（含真实顾客评价的视频到店转化率高 37%） ========== */
DS.reviewLines = [
  '你看这条评论，上周来的客人原话：「{staff}手挺稳，做完没再踩坑」，不是剧本。',
  '这家店的评论我翻了翻，说好的都是真实到店的人，差评我也看了，都是小毛病，不影响。',
  '上次来的客人跟我说：「本来没抱希望，做完觉得还行，下次还来」——这就是真实反馈。',
  '不是我说好，是来过的人说：「跟朋友推荐了三回，没人觉得踩坑」，你自己判断。',
  '评论区里好多老客户，回购了好几次，这个不是花钱能刷出来的。'
];

/* ========== 八、方言口语化钩子（2026 平台明确鼓励方言+普通话字幕，拉高同城转化） ========== */
DS.dialectHooks = {
  benefit: [
    '{area}的{aud}，{entryPrice}块就能{verb}{entryItem}，倍儿划算，我先说地址。',
    '介个价，{entryPrice}就能{verb}{entryItem}，在{area}真不多了，麻溜的。',
    '{area}的{aud}听好了，{entryPrice}块{verb}{entryItem}，整一个不比花大钱香？'
  ],
  question: [
    '你猜{area}的{entryItem}多少钱？{entryPrice}块，我不说你都不信。',
    '在{area}{verb}个{entryItem}，{entryPrice}够不够？我看够。',
    '{area}的{aud}，你花{entryPrice}块能不能{verb}{entryItem}？能，而且不踩坑。'
  ],
  conflict: [
    '都说{area}{verb}{entryItem}得花大几百，我告诉你，{entryPrice}就够了，别被忽悠。',
    '在{area}{verb}{entryItem}真的得花那么多吗？我问了这家店，{entryPrice}真能搞定。',
    '别家{verb}{entryItem}收你两三百，这家{entryPrice}，差的钱吃顿好的不香？'
  ],
  identity: [
    '{area}的{aud}，这家{entryItem}{entryPrice}块，安排上就对了。',
    '住在{area}的{aud}，{entryPrice}块{verb}{entryItem}，顺路就去整一个。',
    '在{area}生活的{aud}，{entryItem}这件事，{entryPrice}就能安排，别磨叽。'
  ],
  pain: [
    '{pain}？{area}这家{entryItem}{entryPrice}，麻溜的整一个试试。',
    '嫌{pain}？{area}{entryItem}才{entryPrice}，整一下比纠结强。'
  ]
};

/* ========== 九、核销与退改保障话术（降低决策门槛、减少到店纠纷） ========== */
DS.refundLines = [
  '团购没去成随时退、过期自动退，不用跟谁解释，不担心。',
  '下单到核销有{deadline}，时间宽裕，安排得开再说。',
  '7天超长核销期，买完不着急，周末/下班顺路过去就行。',
  '到店出示团购码就行，店员扫码核销，不绕弯子。'
];
