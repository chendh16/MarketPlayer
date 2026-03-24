/**
 * 继续获取剩余美股数据
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';
const API_KEY = '241820ae70274dc09e534c76eea0a160';

// 失败/未获取的股票
const RETRY_STOCKS = [
  'LRCX', 'KLAC', 'ASML', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'WORK', 'DOCU', 'ZS', 'OKTA', 'SPLK',
  'NFLX', 'UBER', 'ABNB', 'SHOP', 'ROKU', 'PINS', 'SNAP', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'COF', 'AXP',
  'WMT', 'COST', 'HD', 'TGT', 'LOW', 'NKE', 'LLY', 'MRK', 'BMY', 'AMGN', 'GILD', 'CVS',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'VLO', 'PSX',
  'CAT', 'BA', 'HON', 'UPS', 'RTX', 'DE', 'GE', 'MMM', 'LMT',
  'V', 'MA', 'T', 'TMUS', 'VZ', 'AMT', 'PLD', 'CCI', 'EQIX', 'PSA',
  'SPY', 'QQQ', 'IWM', 'DIA', 'PG', 'NXPI', 'ON', 'MCHP', 'ADI',
  'F', 'GM', 'TM', 'HMC', 'RACE', 'FCAU', 'BABA', 'JD', 'PDD', 'BIDU', 'SAP', 'SNE', 'SONY', 'BRK.A', 'BRK.B'
];

async function getStock(sym: string): Promise<boolean> {
  const fp = path.join(DATA_DIR, `us_${sym}.json`);
  
  // 检查是否已存在且足够
  if (fs.existsSync(fp)) {
    const d = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const klines = d.klines || d;
    if (Array.isArray(klines) && klines.length > 500) {
      console.log(`⏭️  ${sym}: 已存在 ${klines.length} 条，跳过`);
      return true;
    }
  }
  
  try {
    const r = await axios.get(`https://api.twelvedata.com/time_series?symbol=${sym}&interval=1day&outputsize=3000&apikey=${API_KEY}`, { timeout: 30000 });
    if (!r.data.values || r.data.values.length === 0) {
      console.log(`❌ ${sym}: 无数据`);
      return false;
    }
    const klines = r.data.values.reverse().map((v: any) => ({
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume)
    })).filter((k: any) => k.close && k.close > 0);
    
    if (klines.length < 500) {
      console.log(`❌ ${sym}: 数据不足 ${klines.length} 条`);
      return false;
    }
    
    fs.writeFileSync(fp, JSON.stringify({ symbol: sym, market: 'us', klines, updatedAt: new Date().toISOString() }, null, 2));
    console.log(`✅ ${sym}: ${klines.length}条`);
    return true;
  } catch(e: any) {
    console.log(`❌ ${sym}: ${e.message}`);
    return false;
  }
}

(async () => {
  console.log(`=== 继续获取 ${RETRY_STOCKS.length} 只股票 ===\n`);
  let ok = 0, fail = 0;
  
  for (let i = 0; i < RETRY_STOCKS.length; i++) {
    const sym = RETRY_STOCKS[i];
    console.log(`[${i+1}/${RETRY_STOCKS.length}] ${sym}...`);
    if (await getStock(sym)) ok++; else fail++;
    await new Promise(r => setTimeout(r, 2000)); // 每2秒请求一次，避免限流
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`成功: ${ok}/${RETRY_STOCKS.length}`);
  console.log(`失败: ${fail}/${RETRY_STOCKS.length}`);
})();
