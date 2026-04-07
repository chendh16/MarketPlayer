/**
 * fetch-us-fundamentals.js - 美股财务数据获取
 * 
 * 数据源：SEC EDGAR (官方财报)
 * 
 * Usage: node fetch-us-fundamentals.js
 */

const fs = require('fs');
const https = require('https');

// CIK 映射
const CIK_MAP = {
  'AAPL': '0000320193',
  'MSFT': '0000789019',
  'GOOGL': '0001652044',
  'AMZN': '0001018724',
  'META': '0001326801',
  'NVDA': '0001045810',
  'TSLA': '0001318605',
};

const CONFIG = {
  SYMBOLS: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
  OUTPUT_DIR: '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/fundamental',
  KLINES_DIR: '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines',
  DELAY_MS: 1000,
  USER_AGENT: 'MarketPlayer admin@marketplayer.com',
};

const USER_AGENT = CONFIG.USER_AGENT;

/**
 * 获取最新股价
 */
function getLatestPrice(symbol) {
  const filePath = `${CONFIG.KLINES_DIR}/us_${symbol}.json`;
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const klines = data.klines || [];
    return klines.length > 0 ? parseFloat(klines[klines.length - 1].close) : null;
  } catch { return null; }
}

/**
 * HTTP请求
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * 获取SEC EDGAR数据
 */
async function fetchFromSEC(symbol) {
  const cik = CIK_MAP[symbol];
  if (!cik) throw new Error(`Unknown symbol: ${symbol}`);
  
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  console.log(`[SEC] 请求 ${url}`);
  
  const data = await httpGet(url);
  const json = JSON.parse(data);
  
  const facts = json?.facts;
  if (!facts) throw new Error('No facts data');
  
  // 获取净利润
  const netIncome = facts?.us_gaap?.NetIncomeLoss || {};
  const netIncomeValues = netIncome?.units?.USD || [];
  const annualNI = netIncomeValues.filter(v => v.form === '10-K' && v.end?.startsWith('20'));
  const latestNI = annualNI[0];
  
  // 获取股东权益
  const stockholdersEquity = facts?.us_gaap?.StockholdersEquity || {};
  const equityValues = stockholdersEquity?.units?.USD || [];
  const annualEquity = equityValues.filter(v => v.form === '10-K');
  const latestEquity = annualEquity[0];
  
  // 计算ROE
  const ni = latestNI ? parseFloat(latestNI.val) : 0;
  const equity = latestEquity ? parseFloat(latestEquity.val) : 1;
  const roe = equity > 0 ? (ni / equity) * 100 : 0;
  
  // 计算PE (使用最近4季度净利润)
  const quarterly = netIncomeValues.filter(v => v.form === '10-Q' || v.form === '10-K');
  const last4Q = quarterly.slice(0, 4);
  const total4Q = last4Q.reduce((sum, v) => sum + parseFloat(v.val), 0);
  
  const price = getLatestPrice(symbol);
  const eps = total4Q / 4;
  const pe = eps > 0 ? price / eps : 0;
  
  return {
    symbol,
    pe: pe.toFixed(2),
    roe: roe.toFixed(2),
    netIncomeGrowth: 'N/A',
    freeCashFlow: 'N/A',
    debtRatio: 'N/A',
    updated_at: new Date().toISOString().split('T')[0],
  };
}

/**
 * 主函数
 */
async function main() {
  console.log('🧊 US Fundamentals Fetcher (SEC EDGAR)');
  console.log('======================================\n');
  
  const results = [];
  
  for (let i = 0; i < CONFIG.SYMBOLS.length; i++) {
    const symbol = CONFIG.SYMBOLS[i];
    console.log(`📡 Fetching ${symbol}...`);
    
    try {
      const data = await fetchFromSEC(symbol);
      results.push(data);
      
      // 保存
      const outputPath = `${CONFIG.OUTPUT_DIR}/${symbol}_fundamental.json`;
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`  ✅ ${symbol}: PE=${data.pe}, ROE=${data.roe}%`);
      
    } catch (e) {
      console.log(`  ❌ ${symbol}: ${e.message}`);
    }
    
    if (i < CONFIG.SYMBOLS.length - 1) {
      await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));
    }
  }
  
  console.log(`\n✅ 完成: ${results.length}/${CONFIG.SYMBOLS.length}`);
}

main().catch(console.error);