/**
 * 扩展股票池脚本
 * 扩展美股到200+只，港股到50+只
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const CONFIG = {
  KLINES_DIR: '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines',
  OUTPUT_DIR: '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/fundamental',
  DELAY_MS: 1000,
  USER_AGENT: 'MarketPlayer admin@marketplayer.com',
};

// 扩展美股列表 (S&P 500 + 热门科技股)
const US_STOCKS = [
  // 科技巨头 (已有的7只)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  // 热门科技股
  'CRM', 'ADBE', 'ORCL', 'CSCO', 'INTC', 'AMD', 'QCOM', 'TXN', 'IBM', 'NOW', 'SNOW', 'TEAM', 'DDOG', 'PANW', 'CRWD', 'FTNT', 'NET', 'SQ', 'SHOP', 'UBER', 'ABNB', 'DASH',
  // 金融
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'SPGI', 'MCO', 'COF', 'PYPL', 'SQ',
  // 消费
  'WMT', 'HD', 'COST', 'TGT', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'CMCSA', 'NFLX', 'KO', 'PEP', 'PG', 'CL', 'KMB',
  // 医疗
  'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'AMGN', 'GILD', 'BMY', 'BMY', 'MRNA', 'REGN', 'VRTX', 'ISRG', 'MDT', 'SYK', 'BDX',
  // 能源
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'VLO', 'PSX',
  // 工业
  'BA', 'CAT', 'DE', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM',
  // 通信
  'VZ', 'T', 'TMUS',
  // 房地产
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA',
  // 原材料
  'LIN', 'APD', 'ECL', 'SHW',
  // 公用事业
  'NEE', 'DUK', 'SO', 'D',
  // ETF
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO',
];

// 扩展港股列表 (恒生指数 + 热门中概股)
const HK_STOCKS = [
  // 恒生指数成分股 (已有的5只)
  '00700', '09988', '03690', '01810', '02015',
  // 金融
  '00939', // 中国移动
  '02628', // 中国平安
  '02318', // 中国太保
  '03968', // 招商银行
  '00914', // 工商银行
  '00941', // 建设银行
  '02388', // 中银香港
  '00001', // 长和
  // 科技/互联网
  '02269', // 腾讯音乐
  '09618', // 京东
  '09888', // 百度
  '06618', // 京东健康
  '02120', // 快手
  '06381', // 携程
  '09955', // 华住
  // 地产
  '00016', // 九龙仓
  '00017', // 新世界发展
  '01171', // 嘉里建设
  '06808', // 融创服务
  '0960', // 贝壳找房
  // 新经济
  '02569', // 农夫山泉
  '06186', // 泡泡玛特
  '02285', // 微博
  '01093', // 石药集团
  '02272', // 兰桂坊
  '01928', // 金沙中国
  '01169', // 中国奥园
  '02552', // 海底捞
];

/**
 * HTTP请求
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': CONFIG.USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// 去重并统计
const uniqueUS = [...new Set(US_STOCKS)];
const uniqueHK = [...new Set(HK_STOCKS)].filter(s => s !== '00700' && s !== '09988' && s !== '03690' && s !== '01810' && s !== '02015');

console.log('=== 股票池扩展 ===');
console.log(`美股目标: 90 -> ${uniqueUS.length}+`);
console.log(`港股目标: 10 -> ${uniqueHK.length + 5}`);

console.log('\n=== 美股列表 (前50只) ===');
console.log(uniqueUS.slice(0, 50).join(', '));

console.log('\n=== 港股列表 ===');
console.log(uniqueHK.join(', '));

// 检查现有数据
console.log('\n=== 现有K线数据 ===');
const existingUS = fs.readdirSync(CONFIG.KLINES_DIR).filter(f => f.startsWith('us_')).map(f => f.replace('us_', '').replace('.json', ''));
const existingHK = fs.readdirSync(CONFIG.KLINES_DIR).filter(f => f.startsWith('hk_')).map(f => f.replace('hk_', '').replace('.json', ''));
console.log(`现有美股: ${existingUS.length}只`);
console.log(`现有港股: ${existingHK.length}只`);

// 找出缺失的股票
const missingUS = uniqueUS.filter(s => !existingUS.includes(s));
const missingHK = uniqueHK.filter(s => !existingHK.includes(s));

console.log('\n=== 需要获取 ===');
console.log(`缺失美股: ${missingUS.length}只`);
console.log(`缺失港股: ${missingHK.length}只`);

// 输出完整的缺失列表供参考
console.log('\n=== 美股缺失列表 ===');
console.log(missingUS.join(', '));

console.log('\n=== 港股缺失列表 ===');
console.log(missingHK.join(', '));