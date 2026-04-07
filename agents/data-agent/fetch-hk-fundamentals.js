/**
 * fetch-hk-fundamentals.js - 港股财务数据获取
 * 
 * 数据源：腾讯财经 (实时行情) + Alpha Vantage (财务数据)
 * 
 * Usage: node fetch-hk-fundamentals.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  SYMBOLS: [
    { code: 'hk00700', name: '腾讯控股', symbol: '00700.HK' },
    { code: 'hk09988', name: '阿里巴巴-W', symbol: '09988.HK' },
    { code: 'hk03690', name: '美团-W', symbol: '03690.HK' },
    { code: 'hk01810', name: '小米集团-W', symbol: '01810.HK' },
    { code: 'hk02015', name: '理想汽车-W', symbol: '02015.HK' },
  ],
  OUTPUT_DIR: '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/fundamental',
};

// HTTP请求封装 (GBK编码)
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        // 腾讯财经返回GBK编码
        const buf = Buffer.concat(chunks);
        const str = Buffer.from(buf, 'binary').toString('utf8');
        resolve(str);
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// 获取港股实时行情
async function getHKQuote(code) {
  const url = `https://qt.gtimg.cn/q=${code}`;
  const text = await httpGet(url);
  
  // 解析: v_hk00700="100~腾讯控股~00700~489.200~496.600~496.000~17030828.0..."
  const match = text.match(/v_hk\d+="([^"]+)"/);
  if (!match) throw new Error('No data');
  
  const fields = match[1].split('~');
  return {
    name: fields[1],
    code: fields[2],
    currentPrice: parseFloat(fields[3]) || null,
    highPrice: parseFloat(fields[4]) || null,
    lowPrice: parseFloat(fields[5]) || null,
    volume: parseFloat(fields[6]) || 0,
    change: parseFloat(fields[31]) || null,
    changePct: parseFloat(fields[32]) || null,
    marketCap: parseFloat(fields[37]) || null,
    pe: parseFloat(fields[39]) || null,
  };
}

// 主函数
async function main() {
  console.log('🧊 HK Fundamentals Fetcher');
  console.log('=============================');
  console.log(`Target: ${CONFIG.SYMBOLS.map(s => s.code).join(', ')}\n`);
  
  const results = [];
  
  for (let i = 0; i < CONFIG.SYMBOLS.length; i++) {
    const stock = CONFIG.SYMBOLS[i];
    console.log(`📡 Fetching ${stock.code}...`);
    
    try {
      const quote = await getHKQuote(stock.code);
      
      const data = {
        code: stock.symbol.replace('.HK', ''),
        name: stock.name,
        market: 'HK',
        last_updated: new Date().toISOString().split('T')[0],
        quote: {
          close: quote.currentPrice,
          change_pct: quote.changePct,
        },
        valuation: {
          pe: quote.pe,
          market_cap: quote.marketCap,
        },
      };
      
      results.push(data);
      console.log(`  ✅ ${stock.name}: ¥${quote.currentPrice} (${quote.changePct}%), PE=${quote.pe}`);
      
    } catch (e) {
      console.log(`  ❌ ${stock.code}: ${e.message}`);
    }
    
    // 避免请求过快
    if (i < CONFIG.SYMBOLS.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // 保存JSON
  const outputPath = `${CONFIG.OUTPUT_DIR}/hk_fundamentals.json`;
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Saved ${results.length} records to ${outputPath}`);
  
  return results;
}

main().catch(console.error);
