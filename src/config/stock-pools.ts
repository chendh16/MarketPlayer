/**
 * 扩展股票池 - 覆盖港股/美股前50只
 * 
 * 港股前50: 按照市值/成交量排序
 * 美股前50: S&P500头部 + 热门科技股
 */

export type Market = 'a' | 'hk' | 'us';

export interface StockInfo {
  code: string;
  name: string;
  industry?: string;
}

/**
 * 港股前50只股票 (按市值/流动性排序)
 */
export const HK_TOP50: StockInfo[] = [
  { code: '00700', name: '腾讯控股', industry: '互联网' },
  { code: '09988', name: '阿里巴巴-SW', industry: '电商' },
  { code: '00981', name: '中芯国际', industry: '半导体' },
  { code: '03690', name: '美团-W', industry: '本地生活' },
  { code: '01810', name: '小米集团-W', industry: '消费电子' },
  { code: '00001', name: '长和', industry: '综合' },
  { code: '02628', name: '中国人寿', industry: '保险' },
  { code: '00939', name: '建设银行', industry: '银行' },
  { code: '01398', name: '工商银行', industry: '银行' },
  { code: '02318', name: '中国平安', industry: '保险' },
  { code: '01171', name: '汇丰控股', industry: '银行' },
  { code: '00522', name: '中国移动', industry: '通信' },
  { code: '06690', name: '海尔智家', industry: '家电' },
  { code: '09999', name: '网易-S', industry: '互联网' },
  { code: '09618', name: '京东集团-SW', industry: '电商' },
  { code: '01024', name: '快手-W', industry: '短视频' },
  { code: '02018', name: '小米集团-W', industry: '消费电子' },
  { code: '01833', name: '健康到一起', industry: '医疗' },
  { code: '01797', name: '新东方在线', industry: '教育' },
  { code: '03888', name: '金山软件', industry: '软件' },
  { code: '02269', name: '药明生物', industry: '医药' },
  { code: '02196', name: '复星医药', industry: '医药' },
  { code: '02607', name: '上海医药', industry: '医药' },
  { code: '01548', name: '金斯瑞生物', industry: '医药' },
  { code: '01801', name: '信达生物', industry: '医药' },
  { code: '02219', name: '百济神州', industry: '医药' },
  { code: '00006', name: '电能实业', industry: '能源' },
  { code: '00388', name: '香港交易所', industry: '金融' },
  { code: '03883', name: '中国生物制药', industry: '医药' },
  { code: '01169', name: '华润啤酒', industry: '消费' },
  { code: '00267', name: '中信股份', industry: '综合' },
  { code: '02333', name: '长城汽车', industry: '汽车' },
  { code: '00175', name: '汇丰控股', industry: '银行' },
  { code: '00291', name: '华润燃气', industry: '能源' },
  { code: '01093', name: '石药集团', industry: '医药' },
  { code: '01928', name: '周大福', industry: '珠宝' },
  { code: '00203', name: '申洲国际', industry: '纺织' },
  { code: '00687', name: '华润电力', industry: '能源' },
  { code: '01773', name: '心动公司', industry: '游戏' },
  { code: '02552', name: '海底捞', industry: '餐饮' },
  { code: '06186', name: '中国飞鹤', industry: '消费' },
  { code: '06098', name: '碧桂园服务', industry: '物业' },
  { code: '06968', name: '新秀美妆', industry: '消费' },
  { code: '06618', name: '京东健康', industry: '医疗' },
  { code: '02180', name: '金蝶国际', industry: '软件' },
  { code: '03908', name: '中金公司', industry: '金融' },
  { code: '06808', name: '京东物流', industry: '物流' },
  { code: '00242', name: '阿里健康', industry: '医疗' },
  { code: '01755', name: '泡泡玛特', industry: '潮玩' },
  { code: '00593', name: '敏华控股', industry: '家具' },
];

/**
 * 美股前50只股票 (S&P500头部 + 热门科技股)
 */
export const US_TOP50: StockInfo[] = [
  { code: 'AAPL', name: '苹果', industry: '科技' },
  { code: 'MSFT', name: '微软', industry: '科技' },
  { code: 'GOOGL', name: '谷歌A', industry: '科技' },
  { code: 'GOOG', name: '谷歌B', industry: '科技' },
  { code: 'AMZN', name: '亚马逊', industry: '电商' },
  { code: 'NVDA', name: '英伟达', industry: '半导体' },
  { code: 'META', name: 'Meta', industry: '社交' },
  { code: 'TSLA', name: '特斯拉', industry: '新能源车' },
  { code: 'BRK.B', name: '伯克希尔B', industry: '综合' },
  { code: 'UNH', name: '联合健康', industry: '医疗' },
  { code: 'JNJ', name: '强生', industry: '医疗' },
  { code: 'V', name: 'Visa', industry: '金融' },
  { code: 'XOM', name: '埃克森美孚', industry: '能源' },
  { code: 'JPM', name: '摩根大通', industry: '金融' },
  { code: 'WMT', name: '沃尔玛', industry: '零售' },
  { code: 'MA', name: '万事达', industry: '金融' },
  { code: 'PG', name: '宝洁', industry: '消费' },
  { code: 'HD', name: '家得宝', industry: '零售' },
  { code: 'CVX', name: '雪佛龙', industry: '能源' },
  { code: 'MRK', name: '默克', industry: '医药' },
  { code: 'ABBV', name: '艾伯维', industry: '医药' },
  { code: 'LLY', name: '礼来', industry: '医药' },
  { code: 'PEP', name: '百事可乐', industry: '消费' },
  { code: 'KO', name: '可口可乐', industry: '消费' },
  { code: 'COST', name: '好市多', industry: '零售' },
  { code: 'AVGO', name: '博通', industry: '半导体' },
  { code: 'TMO', name: '赛默飞世尔', industry: '医疗' },
  { code: 'MCD', name: '麦当劳', industry: '餐饮' },
  { code: 'CSCO', name: '思科', industry: '科技' },
  { code: 'ACN', name: '埃森哲', industry: 'IT服务' },
  { code: 'ABT', name: '雅培', industry: '医疗' },
  { code: 'DHR', name: '丹纳赫', industry: '医疗' },
  { code: 'CRM', name: 'Salesforce', industry: '软件' },
  { code: 'ADBE', name: 'Adobe', industry: '软件' },
  { code: 'NFLX', name: '奈飞', industry: '流媒体' },
  { code: 'AMD', name: 'AMD', industry: '半导体' },
  { code: 'INTC', name: '英特尔', industry: '半导体' },
  { code: 'QCOM', name: '高通', industry: '半导体' },
  { code: 'TXN', name: '德州仪器', industry: '半导体' },
  { code: 'NKE', name: '耐克', industry: '消费' },
  { code: 'ORCL', name: '甲骨文', industry: '软件' },
  { code: 'IBM', name: 'IBM', industry: '科技' },
  { code: 'NOW', name: 'ServiceNow', industry: '软件' },
  { code: 'INTU', name: 'Intuit', industry: '软件' },
  { code: 'AMAT', name: '应用材料', industry: '半导体' },
  { code: 'AMGN', name: '安进', industry: '医药' },
  { code: 'ISRG', name: '直觉外科', industry: '医疗' },
  { code: 'BKNG', name: 'Booking', industry: '旅游' },
  { code: 'GILD', name: '吉利德', industry: '医药' },
  { code: 'ADP', name: 'ADP', industry: 'IT服务' },
  { code: 'MDLZ', name: '亿滋', industry: '消费' },
];

/**
 * A股前50只股票 (沪深市值前50)
 */
export const A_TOP50: StockInfo[] = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '601318', name: '中国平安', industry: '保险' },
  { code: '600036', name: '招商银行', industry: '银行' },
  { code: '601398', name: '工商银行', industry: '银行' },
  { code: '601939', name: '建设银行', industry: '银行' },
  { code: '601988', name: '中国银行', industry: '银行' },
  { code: '601328', name: '交通银行', industry: '银行' },
  { code: '600030', name: '中信证券', industry: '金融' },
  { code: '600016', name: '民生银行', industry: '银行' },
  { code: '600000', name: '浦发银行', industry: '银行' },
  { code: '000001', name: '平安银行', industry: '银行' },
  { code: '600887', name: '伊利股份', industry: '食品' },
  { code: '601288', name: '农业银行', industry: '银行' },
  { code: '601166', name: '兴业银行', industry: '银行' },
  { code: '600585', name: '海螺水泥', industry: '建材' },
  { code: '601012', name: '隆基绿能', industry: '光伏' },
  { code: '601857', name: '中国石油', industry: '能源' },
  { code: '601088', name: '上海银行', industry: '银行' },
  { code: '600900', name: '长江电力', industry: '电力' },
  { code: '600276', name: '恒瑞医药', industry: '医药' },
  { code: '601668', name: '中国建筑', industry: '建筑' },
  { code: '600690', name: '青岛海尔', industry: '家电' },
  { code: '600309', name: '万华化学', industry: '化工' },
  { code: '000333', name: '美的集团', industry: '家电' },
  { code: '002594', name: '比亚迪', industry: '新能源车' },
  { code: '600028', name: '中国石化', industry: '能源' },
  { code: '600031', name: '三一重工', industry: '机械' },
  { code: '601818', name: '光大银行', industry: '银行' },
  { code: '600050', name: '中国联通', industry: '通信' },
  { code: '600104', name: '上汽集团', industry: '汽车' },
  { code: '601766', name: '中国中车', industry: '交通设备' },
  { code: '000651', name: '格力电器', industry: '家电' },
  { code: '601888', name: '中国中铁', industry: '建筑' },
  { code: '600036', name: '招商银行', industry: '银行' },
  { code: '600019', name: '宝钢股份', industry: '钢铁' },
  { code: '601601', name: '中国太保', industry: '保险' },
  { code: '601336', name: '新华保险', industry: '保险' },
  { code: '601628', name: '中国人寿', industry: '保险' },
  { code: '600048', name: '保利发展', industry: '地产' },
  { code: '600048', name: '白云山', industry: '医药' },
  { code: '600537', name: '国电南瑞', industry: '电力设备' },
  { code: '601888', name: '中国中铁', industry: '建筑' },
  { code: '600690', name: '青岛银行', industry: '银行' },
  { code: '601390', name: '中国中铁', industry: '建筑' },
  { code: '601186', name: '中国铁建', industry: '建筑' },
  { code: '600100', name: '同方股份', industry: '科技' },
  { code: '600570', name: '恒生电子', industry: '软件' },
  { code: '603259', name: '药明康德', industry: '医药' },
  { code: '002475', name: '立讯精密', industry: '电子' },
];

/**
 * 获取指定市场的股票池
 */
export function getStockPool(market: Market): StockInfo[] {
  switch (market) {
    case 'hk': return HK_TOP50;
    case 'us': return US_TOP50;
    case 'a': return A_TOP50;
    default: return [];
  }
}

/**
 * 获取所有市场的股票池合并
 */
export function getAllStocks(): StockInfo[] {
  return [...A_TOP50, ...HK_TOP50, ...US_TOP50];
}

export default {
  A_TOP50,
  HK_TOP50,
  US_TOP50,
  getStockPool,
  getAllStocks,
};
