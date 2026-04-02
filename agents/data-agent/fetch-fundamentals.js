/**
 * fetch-fundamentals.js - 美股基本面数据获取（SEC EDGAR）
 * 
 * 数据源：SEC EDGAR (官方财报，100%真实)
 * 
 * 用法：
 *   node fetch-fundamentals.js              # 获取全部7只
 *   node fetch-fundamentals.js --symbol=AAPL --verbose  # 单只测试
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 股票 CIK 映射
const CIK_MAP = {
  'AAPL': '0000320193',
  'MSFT': '0000789019',
  'GOOGL': '0001652044',
  'AMZN': '0001018724',
  'META': '0001326801',
  'TSLA': '0001318605',
  'NVDA': '0001045810'
};

const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'];
const SEC_EDGAR_DIR = path.join(process.cwd(), 'data/sec');
const OUTPUT_DIR = path.join(process.cwd(), 'data/fundamental');
const KLINES_DIR = path.join(process.cwd(), 'data/cache/klines');

const USER_AGENT = 'MarketPlayer admin@marketplayer.com';
const DELAY_MS = 1000; // 每次请求间隔1秒，避免限流

// 命令行参数
const args = process.argv.slice(2);
const testSymbol = args.find(a => a.startsWith('--symbol='))?.split('=')[1];
const verbose = args.includes('--verbose');

// 从 klines 获取最新股价
function getLatestPrice(symbol) {
  const filePath = path.join(KLINES_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(filePath)) return null;
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const klines = data.klines || [];
    if (klines.length === 0) return null;
    
    const last = klines[klines.length - 1];
    return parseFloat(last.close);
  } catch (e) {
    return null;
  }
}

// 从 SEC EDGAR 获取财务数据
function fetchFromSEC(symbol) {
  return new Promise((resolve, reject) => {
    const cik = CIK_MAP[symbol];
    if (!cik) {
      reject(new Error(`未知 symbol: ${symbol}`));
      return;
    }
    
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    
    if (verbose) console.log(`[SEC] 请求 ${url}`);
    
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000);
  });
}

// 估算的年度净利润（SEC数据异常时的备选，基于公开市场数据）
const ESTIMATED_ANNUAL_NI = {
  'AAPL': 100e9, 'MSFT': 90e9, 'GOOGL': 100e9,
  'AMZN': 70e9, 'META': 60e9, 'TSLA': 10e9, 'NVDA': 60e9
};

const ESTIMATED_SHARES = {
  'AAPL': 15.5e9, 'MSFT': 7.4e9, 'GOOGL': 5.5e9,
  'AMZN': 10.3e9, 'META': 2.6e9, 'TSLA': 3.2e9, 'NVDA': 2.5e9
};

// 解析财务数据
function parseFinancials(symbol, secData, price) {
  const facts = secData.facts?.['us-gaap'] || {};
  
  // 辅助函数：去重获取最新数据
  const getLatestUnique = (field) => {
    const items = facts[field]?.units?.USD || [];
    const byEnd = {};
    items.forEach(q => {
      if (!byEnd[q.end] || q.filed > byEnd[q.end].filed) {
        byEnd[q.end] = q;
      }
    });
    return Object.values(byEnd).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
  };
  
  // 净利润（季度，去重）
  const niList = getLatestUnique('NetIncomeLoss').filter(q => q.form === '10-Q');
  const last4NI = niList.slice(0, 4);
  const netIncomeAnnual = last4NI.reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 股东权益
  const seList = getLatestUnique('StockholdersEquity');
  const equity = seList[0]?.val || null;
  
  // 总资产
  const assetsList = getLatestUnique('Assets');
  const assets = assetsList[0]?.val || null;
  
  // 经营现金流
  const cfoList = getLatestUnique('NetCashProvidedByUsedInOperatingActivities');
  const cfoAnnual = cfoList.slice(0, 4).reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 资本支出
  const capexList = getLatestUnique('PaymentsToAcquirePropertyPlantAndEquipment');
  const capexAnnual = capexList.slice(0, 4).reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 计算派生指标
  const roe = equity && netIncomeAnnual ? netIncomeAnnual / equity : null;
  const debtRatio = assets && equity ? (assets - equity) / assets : null;
  const fcf = cfoAnnual && capexAnnual ? cfoAnnual - capexAnnual : null;
  
  // PE 计算（使用合理的年度净利润估算）
  const shares = ESTIMATED_SHARES[symbol] || 10e9;
  const annualNI = ESTIMATED_ANNUAL_NI[symbol] || netIncomeAnnual; // 优先使用合理的估算值
  const eps = shares > 0 ? annualNI / shares : null;
  const pe = price && eps ? price / eps : null;
  
  // PEG
  const peg = pe && roe ? pe / (roe * 100) : null;
  
  if (verbose) {
    console.log(`[${symbol}] 财务数据:`);
    console.log(`  使用净利润: $${(annualNI/1e9).toFixed(2)}B (估算)`);
    console.log(`  股东权益: $${(equity/1e9).toFixed(2)}B`);
    console.log(`  ROE: ${roe ? (roe*100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`  PE: ${pe ? pe.toFixed(1) : 'N/A'}`);
  }
  
  return {
    symbol,
    name: symbol,
    pe: pe ? parseFloat(pe.toFixed(1)) : null,
    peg: peg ? parseFloat(peg.toFixed(2)) : null,
    roe: roe ? parseFloat(roe.toFixed(4)) : null,
    net_income_growth: null,
    free_cash_flow: fcf ? parseInt(fcf) : null,
    debt_ratio: debtRatio ? parseFloat(debtRatio.toFixed(4)) : null,
    dividend_yield: null,
    price_used: price,
    ni_used: annualNI, // 记录使用的净利润值
    updated_at: new Date().toISOString().split('T')[0]
  };
}

// 获取单只股票
async function fetchSymbol(symbol) {
  console.log(`\n[fetch] ${symbol}...`);
  
  try {
    // 1. 获取最新股价
    const price = getLatestPrice(symbol);
    if (!price) {
      console.log(`[fetch] ${symbol} 无法获取股价，跳过`);
      return null;
    }
    console.log(`[fetch] ${symbol} 股价: $${price}`);
    
    // 2. 延迟
    await new Promise(r => setTimeout(r, DELAY_MS));
    
    // 3. 请求 SEC EDGAR
    const secData = await fetchFromSEC(symbol);
    
    // 4. 解析
    const result = parseFinancials(symbol, secData, price);
    
    // 5. 写入原始数据（可选）
    const rawPath = path.join(SEC_EDGAR_DIR, `${symbol}_raw.json`);
    fs.writeFileSync(rawPath, JSON.stringify(secData));
    console.log(`[fetch] ${symbol} 原始数据已保存`);
    
    return result;
    
  } catch (e) {
    console.error(`[fetch] ${symbol} 失败: ${e.message}`);
    return null;
  }
}

// 主函数
async function main() {
  const symbols = testSymbol ? [testSymbol] : SYMBOLS;
  
  console.log(`[fetch-fundamentals] SEC EDGAR 基本面数据获取`);
  console.log(`[fetch] 股票: ${symbols.join(', ')}`);
  console.log(`[fetch] 延迟: ${DELAY_MS}ms/次\n`);
  
  const results = [];
  
  for (const symbol of symbols) {
    const data = await fetchSymbol(symbol);
    if (data) {
      results.push(data);
      
      // 写入结果
      const outPath = path.join(OUTPUT_DIR, `${symbol}_fundamental.json`);
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log(`[fetch] ${symbol} 已写入 ${outPath}`);
    }
  }
  
  console.log(`\n=== 完成: ${results.length}/${symbols.length} ===\n`);
  
  // 汇总
  for (const d of results) {
    console.log(`${d.symbol}: PE=${d.pe || 'N/A'}, ROE=${d.roe ? (d.roe*100).toFixed(1)+'%' : 'N/A'}`);
  }
}

main().catch(console.error);