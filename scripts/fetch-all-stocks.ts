/**
 * 批量获取股票K线数据
 * 扩充港股到20只，美股到50只
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

// 港股股票池 (20只)
const HK_STOCKS = [
  '00700', // 腾讯
  '09988', // 阿里
  '03690', // 美团
  '01810', // 小米
  '02318', // 平安
  '02628', // 中国人寿
  '00939', // 建设银行
  '01093', // 石药集团
  '00175', // 汇丰银行
  '02269', // 联想
  '00883', // 中国海洋石油
  '00981', // 中芯国际
  '03888', // 金山软件
  '06618', // 京东健康
  '09618', // 京东
  '09888', // 百度
  '09999', // 网易
  '02018', // 阿里健康
  '01313', // 华润置地
  '03333', // 中国铁建
];

// 美股股票池 (50只)
const US_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  'AVGO', 'ORCL', 'COST', 'HD', 'MRK', 'LLY', 'JPM', 'UNH',
  'V', 'MA', 'JNJ', 'WMT', 'PG', 'ABBV', 'ACN', 'ADBE',
  'CRM', 'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN', 'AMAT',
  'MU', 'NOW', 'SNOW', 'UBER', 'ABNB', 'SQ', 'SHOP',
  'COIN', 'MSTR', 'PLTR', 'NET', 'DDOG', 'CRWD', 'ZS',
  'PANW', 'FTNT', 'TEAM', 'WORK', 'DOCU', 'ZM', 'ROKU'
];

// 获取港股K线
async function getHKLine(symbol: string): Promise<boolean> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.${symbol}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${start.toISOString().slice(0,10).replace(/-/g,'')}&end=${end.toISOString().slice(0,10).replace(/-/g,'')}`;
    
    const res = await axios.get(url, { timeout: 10000 });
    const klines = res.data?.data?.klines || [];
    
    if (klines.length === 0) {
      console.log(`❌ ${symbol}: 无数据`);
      return false;
    }
    
    const data = klines.map((k: string) => {
      const p = k.split(',');
      return { date: p[0], open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: +p[5] };
    });
    
    fs.writeFileSync(path.join(DATA_DIR, `hk_${symbol}.json`), JSON.stringify(data, null, 2));
    console.log(`✅ hk_${symbol}: ${data.length}条`);
    return true;
  } catch (e: any) {
    console.log(`❌ ${symbol}: ${e.message}`);
    return false;
  }
}

// 获取美股K线
async function getUSKline(symbol: string): Promise<boolean> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    
    const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&d1=${start.toISOString().slice(0,10).replace(/-/g,'')}&d2=${end.toISOString().slice(0,10).replace(/-/g,'')}`;
    
    const res = await axios.get(url, { responseType: 'text', timeout: 10000 });
    const lines = res.data.split('\n').slice(1);
    const data = lines.filter((l: string) => l).map((l: string) => {
      const p = l.split(',');
      return { date: p[0], open: +p[1], high: +p[3], low: +p[4], close: +p[6], volume: +p[5] };
    });
    
    if (data.length === 0) {
      console.log(`❌ ${symbol}: 无数据`);
      return false;
    }
    
    fs.writeFileSync(path.join(DATA_DIR, `us_${symbol}.json`), JSON.stringify(data, null, 2));
    console.log(`✅ us_${symbol}: ${data.length}条`);
    return true;
  } catch (e: any) {
    console.log(`❌ ${symbol}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== 扩充股票数据 ===\n');
  
  console.log('📈 获取港股数据...');
  let hkCount = 0;
  for (const symbol of HK_STOCKS) {
    if (await getHKLine(symbol)) hkCount++;
    await new Promise(r => setTimeout(r, 500)); // 防止请求过快
  }
  
  console.log(`\n📈 获取美股数据...`);
  let usCount = 0;
  for (const symbol of US_STOCKS) {
    if (await getUSKline(symbol)) usCount++;
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`港股: ${hkCount}/${HK_STOCKS.length}`);
  console.log(`美股: ${usCount}/${US_STOCKS.length}`);
}

main();
