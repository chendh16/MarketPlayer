/**
 * 使用Twelvedata API获取24个月美股数据
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

// 使用Twelvedata API
const API_KEY = process.env.TWELVEDATA_API_KEY || 'demo';

const STOCKS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];

async function getUSKline(symbol: string): Promise<boolean> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 3);  // 3年
    
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=3000&apikey=${API_KEY}`;
    
    const res = await axios.get(url, { timeout: 30000 });
    const data = res.data;
    
    if (data.code === 400 || !data.values || data.values.length === 0) {
      console.log(`❌ ${symbol}: 无数据 - ${data.message || 'unknown'}`);
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
    
    if (klines.length === 0) {
      console.log(`❌ ${symbol}: 无有效数据`);
      return false;
    }
    
    // 保存为标准格式
    const cacheData = {
      symbol,
      market: 'us',
      klines,
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join(DATA_DIR, `us_${symbol}.json`), JSON.stringify(cacheData, null, 2));
    console.log(`✅ us_${symbol}: ${klines.length}条 (${klines[0].date} 至 ${klines[klines.length-1].date})`);
    return true;
  } catch (e: any) {
    console.log(`❌ ${symbol}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== 使用Twelvedata获取24个月美股数据 ===\n');
  
  for (const symbol of STOCKS) {
    await getUSKline(symbol);
    await new Promise(r => setTimeout(r, 1000)); // 防止请求过快
  }
  
  console.log('\n=== 完成 ===');
}

main().catch(console.error);
