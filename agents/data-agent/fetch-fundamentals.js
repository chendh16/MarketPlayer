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
const DELAY_MS = 1000;

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

// 辅助函数：去重获取数据（按end日期合并，取最新filed）
function getLatestDataByEnd(items) {
  if (!items) return [];
  const byEnd = {};
  items.forEach(q => {
    const end = q.end;
    if (!byEnd[end] || (q.filed && byEnd[end].filed && q.filed > byEnd[end].filed)) {
      byEnd[end] = q;
    }
  });
  return Object.values(byEnd).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
}

// 解析财务数据
function parseFinancials(symbol, secData, price) {
  const facts = secData.facts?.['us-gaap'] || {};
  
  if (verbose) console.log(`\n=== ${symbol} 原始数据调试 ===`);
  
  // 获取净利润数据（年报）
  const niItems = facts['NetIncomeLoss']?.units?.USD || [];
  const niData = getLatestDataByEnd(niItems);
  
  // 筛选年报 (10-K)
  const niAnnual = niData.filter(q => q.form === '10-K');
  
  if (verbose) {
    console.log(`净利润(年报)数量: ${niAnnual.length}`);
    niAnnual.slice(0, 5).forEach(q => {
      console.log(`  ${q.end?.substring(0, 10)}: $${(q.val / 1e9).toFixed(2)}B (${q.form})`);
    });
  }
  
  // 取最近两年年报计算增速
  let netIncomeGrowth = null;
  if (niAnnual.length >= 2) {
    const fy1 = niAnnual[0]?.val || 0;  // 最近年份
    const fy2 = niAnnual[1]?.val || 0;  // 前一年
    if (fy2 > 0) {
      netIncomeGrowth = (fy1 - fy2) / fy2;
      if (verbose) console.log(`净利润增速: (${fy1/1e9}B - ${fy2/1e9}B) / ${fy2/1e9}B = ${(netIncomeGrowth*100).toFixed(1)}%`);
    }
  } else if (verbose) {
    console.log(`警告: 不足2年净利润数据`);
  }
  
  // 股东权益
  const seItems = facts['StockholdersEquity']?.units?.USD || [];
  const seData = getLatestDataByEnd(seItems);
  const equity = seData[0]?.val || null;
  
  if (verbose) {
    console.log(`股东权益: $${equity ? (equity/1e9).toFixed(2) + 'B' : 'N/A'}`);
  }
  
  // 总资产
  const assetsItems = facts['Assets']?.units?.USD || [];
  const assetsData = getLatestDataByEnd(assetsItems);
  const assets = assetsData[0]?.val || null;
  
  // 经营现金流
  const cfoItems = facts['NetCashProvidedByUsedInOperatingActivities']?.units?.USD || [];
  const cfoData = getLatestDataByEnd(cfoItems);
  // 最近4个季度
  const cfoAnnual = cfoData.slice(0, 4).reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 资本支出
  const capexItems = facts['PaymentsToAcquirePropertyPlantAndEquipment']?.units?.USD || [];
  const capexData = getLatestDataByEnd(capexItems);
  const capexAnnual = capexData.slice(0, 4).reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 年度净利润（取最近4个季度之和）
  const niQuarterly = niData.filter(q => q.form === '10-Q').slice(0, 4);
  const netIncomeAnnual = niQuarterly.reduce((sum, q) => sum + (q?.val || 0), 0);
  
  // 计算派生指标
  const roe = equity && equity > 0 && netIncomeAnnual > 0 ? netIncomeAnnual / equity : null;
  const debtRatio = assets && equity ? (assets - equity) / assets : null;
  const fcf = cfoAnnual && capexAnnual ? cfoAnnual - capexAnnual : null;
  
  if (verbose) {
    console.log(`最近4季度净利润: $${(netIncomeAnnual/1e9).toFixed(2)}B`);
    console.log(`ROE = ${netIncomeAnnual/1e9}B / ${equity/1e9}B = ${roe ? (roe*100).toFixed(1) + '%' : 'N/A'}`);
  }
  
  // PE 计算
  const shares = {
    'AAPL': 15.5e9, 'MSFT': 7.4e9, 'GOOGL': 5.5e9,
    'AMZN': 10.3e9, 'META': 2.6e9, 'TSLA': 3.2e9, 'NVDA': 2.5e9
  }[symbol] || 10e9;
  
  const eps = shares > 0 && netIncomeAnnual > 0 ? netIncomeAnnual / shares : null;
  const pe = price && eps ? price / eps : null;
  const peg = pe && netIncomeGrowth ? pe / netIncomeGrowth : null;
  
  if (verbose) {
    console.log(`EPS = ${netIncomeAnnual/1e9}B / ${shares/1e9}B = ${eps?.toFixed(2)}`);
    console.log(`PE = ${price} / ${eps?.toFixed(2)} = ${pe?.toFixed(1)}`);
  }
  
  return {
    symbol,
    name: symbol,
    pe: pe ? parseFloat(pe.toFixed(1)) : null,
    peg: peg ? parseFloat(peg.toFixed(2)) : null,
    roe: roe ? parseFloat(roe.toFixed(4)) : null,
    net_income_growth: netIncomeGrowth ? parseFloat(netIncomeGrowth.toFixed(4)) : null,
    free_cash_flow: fcf ? parseInt(fcf) : null,
    debt_ratio: debtRatio ? parseFloat(debtRatio.toFixed(4)) : null,
    dividend_yield: null,
    price_used: price,
    ni_used: netIncomeAnnual,
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
    console.log(`${d.symbol}: PE=${d.pe || 'N/A'}, ROE=${d.roe ? (d.roe*100).toFixed(1)+'%' : 'N/A'}, 增速=${d.net_income_growth ? (d.net_income_growth*100).toFixed(1)+'%' : 'N/A'}`);
  }
}

main().catch(console.error);