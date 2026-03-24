/**
 * 获取150只美股过去3年数据
 * 使用Twelvedata API
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';
const API_KEY = process.env.TWELVEDATA_API_KEY || '241820ae70274dc09e534c76eea0a160';

// 150只美股股票池
const US_STOCKS = [
  // 科技巨头
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  // 芯片
  'AVGO', 'AMD', 'INTC', 'QCOM', 'TXN', 'AMAT', 'MU', 'MRVL', 'LRCX', 'KLAC', 'ASML',
  // 软件/云
  'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'WORK', 'DOCU', 'ZS', 'OKTA', 'SPLK',
  // 互联网
  'NFLX', 'UBER', 'ABNB', 'SHOP', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'META',
  // 金融
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'COF', 'AXP',
  // 消费
  'WMT', 'COST', 'HD', 'TGT', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'CMCSA',
  // 医药
  'JNJ', 'PFE', 'UNH', 'ABBV', 'LLY', 'MRK', 'BMY', 'AMGN', 'GILD', 'CVS',
  // 能源
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'VLO', 'PSX',
  // 工业
  'CAT', 'BA', 'HON', 'UPS', 'RTX', 'DE', 'GE', 'MMM', 'LMT',
  // 通信
  'V', 'MA', 'T', 'TMUS', 'VZ', 'CMCSA',
  // 房地产/REITs
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA',
  // ETF/指数
  'SPY', 'QQQ', 'IWM', 'DIA',
  // 其他
  'PG', 'KO', 'PEP', 'MMM', 'TFC', 'BKNG', 'ISRG', 'MDT', 'SYK', 'ZTS',
  'AMD', 'MU', 'NXPI', 'ON', 'AMAT', 'MCHP', 'ADI', 'MRVL',
  'F', 'GM', 'TM', 'HMC', 'RACE', 'FCAU',
  'BABA', 'JD', 'PDD', 'BIDU',
  'SAP', 'SNE', 'SONY',
  'BRK.A', 'BRK.B'
];

// 去重
const UNIQUE_STOCKS = [...new Set(US_STOCKS)];

console.log(`总共需要获取 ${UNIQUE_STOCKS.length} 只股票`);

async function getUSKline(symbol: string): Promise<boolean> {
  // 检查是否已存在
  const filePath = path.join(DATA_DIR, `us_${symbol}.json`);
  if (fs.existsSync(filePath)) {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const klines = existing.klines || existing;
    if (Array.isArray(klines) && klines.length > 500) {
      console.log(`⏭️  ${symbol}: 已存在 ${klines.length} 条，跳过`);
      return true;
    }
  }
  
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=3000&apikey=${API_KEY}`;
    
    const res = await axios.get(url, { timeout: 30000 });
    const data = res.data;
    
    if (data.code === 400 || !data.values || data.values.length === 0) {
      console.log(`❌ ${symbol}: 无数据 - ${data.message?.substring(0, 50) || 'unknown'}`);
      return false;
    }
    
    // 转换格式
    const klines = data.values.reverse().map((v: any) => ({
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume)
    })).filter((k: any) => k.close && k.close > 0);
    
    if (klines.length < 500) {
      console.log(`❌ ${symbol}: 数据不足 ${klines.length} 条`);
      return false;
    }
    
    const cacheData = {
      symbol,
      market: 'us',
      klines,
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2));
    console.log(`✅ us_${symbol}: ${klines.length}条 (${klines[0].date} 至 ${klines[klines.length-1].date})`);
    return true;
  } catch (e: any) {
    console.log(`❌ ${symbol}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== 获取150只美股过去3年数据 ===\n');
  
  let success = 0;
  let fail = 0;
  
  for (let i = 0; i < UNIQUE_STOCKS.length; i++) {
    const symbol = UNIQUE_STOCKS[i];
    console.log(`[${i+1}/${UNIQUE_STOCKS.length}] 获取 ${symbol}...`);
    
    if (await getUSKline(symbol)) {
      success++;
    } else {
      fail++;
    }
    
    // 避免请求过快
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`成功: ${success}/${UNIQUE_STOCKS.length}`);
  console.log(`失败: ${fail}/${UNIQUE_STOCKS.length}`);
}

main().catch(console.error);