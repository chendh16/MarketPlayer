/**
 * 补充获取港股数据
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

const HK_STOCKS = [
  '00700', '09988', '03690', '01810', '02318', '02628', '00939', '01093', 
  '00175', '02269', '00883', '00981', '03888', '06618', '09618', '09888', 
  '09999', '02018', '01313', '03333'
];

async function getHKLine(symbol: string): Promise<boolean> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.${symbol}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${start.toISOString().slice(0,10).replace(/-/g,'')}&end=${end.toISOString().slice(0,10).replace(/-/g,'')}`;
    
    const res = await axios.get(url, { timeout: 15000 });
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

async function main() {
  console.log('📈 获取港股数据 (重试)...\n');
  
  let hkCount = 0;
  for (const symbol of HK_STOCKS) {
    if (await getHKLine(symbol)) hkCount++;
    await new Promise(r => setTimeout(r, 2000)); // 2秒延时
  }
  
  console.log(`\n港股: ${hkCount}/${HK_STOCKS.length}`);
}

main();
