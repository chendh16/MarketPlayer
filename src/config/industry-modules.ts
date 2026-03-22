/**
 * 行业模块配置 - 基于产业链上下游的股票分组
 * 支持: A股 + 港股 + 美股
 * 
 * 核心理念：当某个模块启动时，上下联动公司可能跟随上涨
 * 参考: 推文中电力板块的煤电→水电→核电→新能源联动逻辑
 */

import { StockInfo } from './stock-pools';

/**
 * 市场类型
 */
export type Market = 'a' | 'hk' | 'us';

/**
 * 行业模块定义
 */
export interface IndustryModule {
  id: string;           // 模块ID
  name: string;         // 模块名称
  industry: string;     // 所属行业
  stocks: StockInfo[];  // 核心成分股 (支持A股/港股/美股)
  markets?: Market[];   // 支持的市场 (可选，自动推断)
  upstream?: string[];  // 上游关联模块
  downstream?: string[]; // 下游关联模块
  keyDriver?: string;   // 关键驱动因素
}

/**
 * 电力能源模块 (参考推文)
 */
export const POWER_MODULE: IndustryModule = {
  id: 'power',
  name: '电力能源',
  industry: '公用事业',
  markets: ['a'],
  keyDriver: '电价市场化改革 + 煤炭价格',
  stocks: [
    { code: '600900', name: '长江电力', industry: '水电' },
    { code: '600011', name: '华能国际', industry: '火电' },
    { code: '600027', name: '华电国际', industry: '火电' },
    { code: '601991', name: '大唐发电', industry: '火电' },
    { code: '600795', name: '北方华创', industry: '电力设备' },
    { code: '601615', name: '明阳智能', industry: '风电' },
    { code: '600438', name: '通威股份', industry: '光伏' },
    { code: '601012', name: '隆基绿能', industry: '光伏' },
  ],
  upstream: ['coal', 'natural_gas'],
  downstream: ['steel', 'cement'],
};

/**
 * 煤炭模块 (电力上游)
 */
export const COAL_MODULE: IndustryModule = {
  id: 'coal',
  name: '煤炭',
  industry: '能源',
  keyDriver: '煤炭价格 + 供需格局',
  stocks: [
    { code: '601088', name: '上海能源', industry: '煤炭' },
    { code: '600971', name: '恒源煤电', industry: '煤炭' },
    { code: '600395', name: '盘江股份', industry: '煤炭' },
    { code: '601001', name: '大同煤业', industry: '煤炭' },
    { code: '600121', name: '郑州煤电', industry: '煤炭' },
  ],
  downstream: ['power'],
};

/**
 * 天然气模块
 */
export const NATURAL_GAS_MODULE: IndustryModule = {
  id: 'natural_gas',
  name: '天然气',
  industry: '能源',
  keyDriver: '气价 + 煤改气政策',
  stocks: [
    { code: '600139', name: '西部资源', industry: '天然气' },
    { code: '600509', name: '天富能源', industry: '天然气' },
    { code: '600903', name: '贵州燃气', industry: '燃气' },
    { code: '001914', name: '招商积余', industry: '燃气' },
  ],
  downstream: ['power', 'chemical'],
};

/**
 * 科技模块 (AI/半导体)
 */
export const TECH_MODULE: IndustryModule = {
  id: 'tech',
  name: '科技',
  industry: '信息技术',
  keyDriver: 'AI浪潮 + 国产替代',
  stocks: [
    { code: '002475', name: '立讯精密', industry: '消费电子' },
    { code: '000100', name: 'TCL科技', industry: '显示面板' },
    { code: '002185', name: '华天科技', industry: '半导体' },
    { code: '603986', name: '兆易创新', industry: '半导体' },
    { code: '688981', name: '中芯国际', industry: '半导体' },
  ],
  upstream: ['semiconductor'],
  downstream: ['consumer_electronics'],
};

/**
 * 新能源车模块
 */
export const EV_MODULE: IndustryModule = {
  id: 'ev',
  name: '新能源汽车',
  industry: '汽车',
  keyDriver: '销量 + 渗透率 + 政策',
  stocks: [
    { code: '002594', name: '比亚迪', industry: '整车' },
    { code: '300750', name: '宁德时代', industry: '电池' },
    { code: '002812', name: '恩捷股份', industry: '隔膜' },
    { code: '300014', name: '亿纬锂能', industry: '电池' },
    { code: '002460', name: '赣锋锂业', industry: '锂资源' },
    { code: '002466', name: '天齐锂业', industry: '锂资源' },
  ],
  upstream: ['lithium'],
  downstream: ['auto_parts'],
};

/**
 * 医药模块
 */
export const PHARMA_MODULE: IndustryModule = {
  id: 'pharma',
  name: '医药',
  industry: '医疗',
  keyDriver: '创新药 + 集采 + 老龄化',
  stocks: [
    { code: '600276', name: '恒瑞医药', industry: '创新药' },
    { code: '600529', name: '山东药玻', industry: '药用辅料' },
    { code: '603259', name: '药明康德', industry: 'CXO' },
    { code: '002007', name: '华兰生物', industry: '生物制品' },
    { code: '000513', name: '丽珠集团', industry: '化学制药' },
  ],
};

/**
 * 金融模块
 */
export const FINANCE_MODULE: IndustryModule = {
  id: 'finance',
  name: '金融',
  industry: '金融',
  keyDriver: '利率 + 政策 + 资产质量',
  stocks: [
    { code: '601398', name: '工商银行', industry: '银行' },
    { code: '601939', name: '建设银行', industry: '银行' },
    { code: '601288', name: '农业银行', industry: '银行' },
    { code: '601318', name: '中国平安', industry: '保险' },
    { code: '600030', name: '中信证券', industry: '券商' },
  ],
};

/**
 * 消费模块
 */
export const CONSUMER_MODULE: IndustryModule = {
  id: 'consumer',
  name: '消费',
  industry: '消费',
  keyDriver: '消费复苏 + 居民收入 + 政策',
  stocks: [
    { code: '600519', name: '贵州茅台', industry: '白酒' },
    { code: '600887', name: '伊利股份', industry: '乳制品' },
    { code: '000333', name: '美的集团', industry: '家电' },
    { code: '000651', name: '格力电器', industry: '家电' },
    { code: '603288', name: '海天味业', industry: '调味品' },
  ],
};

/**
 * 房地产模块
 */
export const REALESTATE_MODULE: IndustryModule = {
  id: 'realestate',
  name: '房地产',
  industry: '地产',
  keyDriver: '政策 + 销售 + 融资',
  stocks: [
    { code: '000002', name: '万科A', industry: '地产' },
    { code: '600048', name: '保利发展', industry: '地产' },
    { code: '600340', name: '华夏幸福', industry: '地产' },
    { code: '600383', name: '金地集团', industry: '地产' },
  ],
  downstream: ['steel', 'cement', 'consumer'],
};

/**
 * 钢铁模块 (房地产下游)
 */
export const STEEL_MODULE: IndustryModule = {
  id: 'steel',
  name: '钢铁',
  industry: '建材',
  keyDriver: '需求 + 铁矿石价格 + 产能',
  stocks: [
    { code: '600019', name: '宝钢股份', industry: '钢铁' },
    { code: '000709', name: '华菱钢铁', industry: '钢铁' },
    { code: '600782', name: '新华保险', industry: '钢铁' },
  ],
  upstream: ['iron_ore'],
  downstream: ['realestate', 'infrastructure'],
};

/**
 * 水泥模块 (房地产下游)
 */
export const CEMENT_MODULE: IndustryModule = {
  id: 'cement',
  name: '水泥',
  industry: '建材',
  keyDriver: '需求 + 错峰生产 + 煤炭成本',
  stocks: [
    { code: '600585', name: '海螺水泥', industry: '水泥' },
    { code: '600801', name: '华新水泥', industry: '水泥' },
    { code: '000877', name: '天山股份', industry: '水泥' },
  ],
  downstream: ['realestate', 'infrastructure'],
};

/**
 * 科技板块 - 美股 (AI/半导体)
 */
export const US_TECH_MODULE: IndustryModule = {
  id: 'us_tech',
  name: '美股科技',
  industry: '信息技术',
  markets: ['us'],
  keyDriver: 'AI浪潮 + 利率环境 + 估值',
  stocks: [
    { code: 'AAPL', name: '苹果', industry: '消费电子' },
    { code: 'MSFT', name: '微软', industry: '软件/云' },
    { code: 'GOOGL', name: '谷歌A', industry: '搜索/AI' },
    { code: 'NVDA', name: '英伟达', industry: 'AI芯片' },
    { code: 'META', name: 'Meta', industry: '社交元宇宙' },
    { code: 'AMD', name: 'AMD', industry: 'CPU/GPU' },
    { code: 'INTC', name: '英特尔', industry: '芯片' },
    { code: 'QCOM', name: '高通', industry: '手机芯片' },
    { code: 'AVGO', name: '博通', industry: '芯片' },
    { code: 'CRM', name: 'Salesforce', industry: 'SaaS' },
    { code: 'ADBE', name: 'Adobe', industry: '软件' },
    { code: 'ORCL', name: '甲骨文', industry: '数据库' },
  ],
  downstream: ['us_semi_equip'],
};

/**
 * 半导体设备 - 美股
 */
export const US_SEMI_MODULE: IndustryModule = {
  id: 'us_semi',
  name: '美股半导体',
  industry: '半导体',
  markets: ['us'],
  keyDriver: '国产替代 + AI芯片需求 + 产能扩张',
  stocks: [
    { code: 'AMAT', name: '应用材料', industry: '半导体设备' },
    { code: 'LRCX', name: '拉姆研究', industry: '半导体设备' },
    { code: 'KLAC', name: '科磊', industry: '半导体设备' },
    { code: 'AMAT', name: '应用材料', industry: '半导体设备' },
  ],
  upstream: ['us_tech'],
};

/**
 * 新能源车 - 美股
 */
export const US_EV_MODULE: IndustryModule = {
  id: 'us_ev',
  name: '美股新能源车',
  industry: '汽车',
  markets: ['us'],
  keyDriver: '销量 + 自动驾驶 + 成本控制',
  stocks: [
    { code: 'TSLA', name: '特斯拉', industry: '电动车' },
    { code: 'RIVN', name: 'Rivian', industry: '电动车' },
    { code: 'LCID', name: 'Lucid', industry: '电动车' },
  ],
};

/**
 * 医疗健康 - 美股
 */
export const US_HEALTH_MODULE: IndustryModule = {
  id: 'us_health',
  name: '美股医疗健康',
  industry: '医疗',
  markets: ['us'],
  keyDriver: '创新药 + GLP-1减肥药 + 老龄化',
  stocks: [
    { code: 'LLY', name: '礼来', industry: '创新药/减肥药' },
    { code: 'JNJ', name: '强生', industry: '医药/器械' },
    { code: 'UNH', name: '联合健康', industry: '医保' },
    { code: 'MRK', name: '默克', industry: '创新药' },
    { code: 'ABBV', name: '艾伯维', industry: '创新药' },
    { code: 'PFE', name: '辉瑞', industry: '疫苗/医药' },
    { code: 'TMO', name: '赛默飞', industry: '生命科学' },
    { code: 'DHR', name: '丹纳赫', industry: '医疗器械' },
    { code: 'ISRG', name: '直觉外科', industry: '手术机器人' },
  ],
};

/**
 * 金融 - 美股
 */
export const US_FINANCE_MODULE: IndustryModule = {
  id: 'us_finance',
  name: '美股金融',
  industry: '金融',
  markets: ['us'],
  keyDriver: '利率 + 降息预期 + 资产质量',
  stocks: [
    { code: 'JPM', name: '摩根大通', industry: '银行' },
    { code: 'BAC', name: '美国银行', industry: '银行' },
    { code: 'WFC', name: '富国银行', industry: '银行' },
    { code: 'GS', name: '高盛', industry: '投行' },
    { code: 'MS', name: '摩根士丹利', industry: '投行' },
    { code: 'V', name: 'Visa', industry: '支付' },
    { code: 'MA', name: '万事达', industry: '支付' },
    { code: 'BRK.B', name: '伯克希尔', industry: '综合' },
  ],
};

/**
 * 消费 - 美股
 */
export const US_CONSUMER_MODULE: IndustryModule = {
  id: 'us_consumer',
  name: '美股消费',
  industry: '消费',
  markets: ['us'],
  keyDriver: '消费支出 + 通胀 + 居民储蓄',
  stocks: [
    { code: 'AMZN', name: '亚马逊', industry: '电商/云' },
    { code: 'WMT', name: '沃尔玛', industry: '零售' },
    { code: 'HD', name: '家得宝', industry: '建材零售' },
    { code: 'MCD', name: '麦当劳', industry: '餐饮' },
    { code: 'NKE', name: '耐克', industry: '运动品牌' },
    { code: 'PG', name: '宝洁', industry: '日化' },
    { code: 'KO', name: '可口可乐', industry: '饮料' },
    { code: 'PEP', name: '百事可乐', industry: '饮料' },
    { code: 'COST', name: '好市多', industry: '会员店' },
    { code: 'NFLX', name: '奈飞', industry: '流媒体' },
  ],
};

/**
 * 能源 - 美股
 */
export const US_ENERGY_MODULE: IndustryModule = {
  id: 'us_energy',
  name: '美股能源',
  industry: '能源',
  markets: ['us'],
  keyDriver: '油价 + 产量 + OPEC+',
  stocks: [
    { code: 'XOM', name: '埃克森美孚', industry: '石油' },
    { code: 'CVX', name: '雪佛龙', industry: '石油' },
    { code: 'COP', name: '康菲石油', industry: '石油' },
    { code: 'EOG', name: 'EOG能源', industry: '页岩油' },
    { code: 'SLB', name: '斯伦贝谢', industry: '油田服务' },
  ],
};

/**
 * 港股科技
 */
export const HK_TECH_MODULE: IndustryModule = {
  id: 'hk_tech',
  name: '港股科技',
  industry: '互联网',
  markets: ['hk'],
  keyDriver: 'AI应用 + 监管政策 + 降本增效',
  stocks: [
    { code: '00700', name: '腾讯控股', industry: '社交/游戏/云' },
    { code: '09988', name: '阿里巴巴-SW', industry: '电商/云' },
    { code: '03690', name: '美团-W', industry: '本地生活' },
    { code: '01810', name: '小米集团-W', industry: '消费电子/IoT' },
    { code: '01024', name: '快手-W', industry: '短视频' },
    { code: '09999', name: '网易-S', industry: '游戏' },
    { code: '09618', name: '京东集团-SW', industry: '电商' },
    { code: '02318', name: '中国平安', industry: '金融科技' },
  ],
  downstream: ['hk_fintech'],
};

/**
 * 港股新能源
 */
export const HK_NE_MODULE: IndustryModule = {
  id: 'hk_ne',
  name: '港股新能源',
  industry: '新能源',
  markets: ['hk'],
  keyDriver: '光伏/风电装机 + 政策支持 + 出口',
  stocks: [
    { code: '00968', name: '信义光能', industry: '光伏玻璃' },
    { code: '00981', name: '中芯国际', industry: '半导体' },
    { code: '02208', name: '金风科技', industry: '风电' },
    { code: '06690', name: '海尔智家', industry: '家电' },
  ],
};

/**
 * 港股金融
 */
export const HK_FINANCE_MODULE: IndustryModule = {
  id: 'hk_finance',
  name: '港股金融',
  industry: '金融',
  markets: ['hk'],
  keyDriver: '港股通 + 利率 + 资产荒',
  stocks: [
    { code: '00939', name: '建设银行', industry: '银行' },
    { code: '01398', name: '工商银行', industry: '银行' },
    { code: '02318', name: '中国平安', industry: '保险' },
    { code: '01171', name: '汇丰控股', industry: '银行' },
    { code: '00388', name: '香港交易所', industry: '交易所' },
    { code: '02628', name: '中国人寿', industry: '保险' },
  ],
};

/**
 * 全部模块集合 (支持A股+港股+美股)
 */
export const ALL_MODULES: IndustryModule[] = [
  // A股模块
  POWER_MODULE,
  COAL_MODULE,
  NATURAL_GAS_MODULE,
  TECH_MODULE,
  EV_MODULE,
  PHARMA_MODULE,
  FINANCE_MODULE,
  CONSUMER_MODULE,
  REALESTATE_MODULE,
  STEEL_MODULE,
  CEMENT_MODULE,
  // 美股模块
  US_TECH_MODULE,
  US_SEMI_MODULE,
  US_EV_MODULE,
  US_HEALTH_MODULE,
  US_FINANCE_MODULE,
  US_CONSUMER_MODULE,
  US_ENERGY_MODULE,
  // 港股模块
  HK_TECH_MODULE,
  HK_NE_MODULE,
  HK_FINANCE_MODULE,
];

/**
 * 获取模块By ID
 */
export function getModule(id: string): IndustryModule | undefined {
  return ALL_MODULES.find(m => m.id === id);
}

/**
 * 获取所有模块
 */
export function getAllModules(): IndustryModule[] {
  return ALL_MODULES;
}

/**
 * 获取上下游关联模块
 */
export function getRelatedModules(moduleId: string): IndustryModule[] {
  const module = getModule(moduleId);
  if (!module) return [];
  
  const related: IndustryModule[] = [];
  
  if (module.upstream) {
    for (const upId of module.upstream) {
      const upModule = getModule(upId);
      if (upModule) related.push(upModule);
    }
  }
  
  if (module.downstream) {
    for (const downId of module.downstream) {
      const downModule = getModule(downId);
      if (downModule) related.push(downModule);
    }
  }
  
  return related;
}

/**
 * 获取某股票所属模块
 */
export function getStockModule(stockCode: string): IndustryModule | undefined {
  return ALL_MODULES.find(m => m.stocks.some(s => s.code === stockCode));
}

export default {
  ALL_MODULES,
  getModule,
  getAllModules,
  getRelatedModules,
  getStockModule,
};
