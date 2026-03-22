/**
 * 分批获取全部股票历史数据并保存
 * 用法: npx ts-node src/scripts/fetch-all-history.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getHistoryKLine } from '../services/market/quote-service';

// 股票池
const A_STOCKS = [
  '600519','601318','600036','601398','601939','601988','601328','600030','600016','600000',
  '000001','600887','601288','601166','600585','601012','601857','601088','600900','600276',
  '601668','600690','600309','000333','002594','600028','600031','601818','600050','600104',
  '601766','000651','601888','600019','601601','601336','601628','600048','600537','601390',
  '601186','600100','600570','603259','002475'
];

const HK_STOCKS = [
  '00700','09988','00981','03690','01810','00001','02628','00939','01398','02318',
  '01171','00522','06690','09999','09618','01024','01833','01797','03888','02269',
  '02196','02607','01548','01801','02219','00006','00388','03883','01169','00267',
  '02333','00175','00291','01093','01928','00203','00687','01773','02552','06186',
  '06098','06968','06618','02180','03908','06808','00242','01755','00593'
];

const US_STOCKS = [
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','BRK.B','UNH',
  'JNJ','V','XOM','JPM','WMT','MA','PG','HD','CVX','MRK','ABBV','LLY','PEP','KO',
  'COST','AVGO','TMO','MCD','CSCO','ACN','ABT','DHR','CRM','ADBE','NFLX','AMD','INTC',
  'QCOM','TXN','NKE','ORCL','IBM','NOW','INTU','AMAT','AMGN','ISRG','BKNG','GILD','ADP','MDLZ'
];

const DATA_DIR = path.join(__dirname, '../../data/stock-history');

// 等待函数（避免API限制）
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 分析K线数据
function analyzeKLine(data: any[], code: string, market: string) {
  if (!data || data.length === 0) {
    return null;
  }
  
  const first = data[0];
  const last = data[data.length - 1];
  const high = Math.max(...data.map(d => d.high));
  const low = Math.min(...data.map(d => d.low));
  
  // 计算收益率
  const totalReturn = ((last.close - first.open) / first.open) * 100;
  const annualizedReturn = totalReturn / (data.length / 365);
  
  // 计算波动率
  const returns = data.slice(1).map((d, i) => (d.close - data[i].close) / data[i].close);
  const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252) * 100;
  
  return {
    code,
    market,
    dataPoints: data.length,
    latestPrice: last.close,
    openPrice: first.open,
    high,
    low,
    totalReturn: totalReturn.toFixed(2) + '%',
    annualizedReturn: annualizedReturn.toFixed(2) + '%',
    volatility: volatility.toFixed(2) + '%',
    startDate: new Date(first.timestamp).toISOString().split('T')[0],
    endDate: new Date(last.timestamp).toISOString().split('T')[0],
  };
}

async function fetchWithRetry(symbol: string, market: 'a' | 'hk' | 'us', retries = 3): Promise<any[]> {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await getHistoryKLine(symbol, market, '1d', '1y');
      if (data.length > 0) return data;
    } catch (e) {
      console.log(`  [${symbol}] 重试 ${i+1}/${retries}`);
      await wait(2000);
    }
  }
  return [];
}

async function main() {
  console.log('='.repeat(50));
  console.log('开始分批获取149只股票历史数据...');
  console.log('='.repeat(50));
  
  // 确保目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const results = {
    a: [] as any[],
    hk: [] as any[],
    us: [] as any[],
    summary: {
      total: 0,
      success: 0,
      failed: 0,
      timestamp: new Date().toISOString()
    }
  };
  
  // 获取美股数据 (每批5个，等待避免限流)
  console.log('\n📈 获取美股数据...');
  for (let i = 0; i < US_STOCKS.length; i++) {
    const code = US_STOCKS[i];
    process.stdout.write(`  [${i+1}/${US_STOCKS.length}] ${code}... `);
    
    const data = await fetchWithRetry(code, 'us');
    const analysis = analyzeKLine(data, code, 'us');
    
    if (analysis) {
      results.us.push(analysis);
      results.summary.success++;
      console.log(`✓ ${analysis.latestPrice} (${analysis.totalReturn})`);
    } else {
      results.summary.failed++;
      console.log('✗ 失败');
    }
    
    // 每5个等待一下
    if ((i + 1) % 5 === 0) {
      console.log('  --- 等待10秒避免限流 ---');
      await wait(10000);
    }
  }
  
  // 获取港股数据
  console.log('\n📈 获取港股数据...');
  for (let i = 0; i < HK_STOCKS.length; i++) {
    const code = HK_STOCKS[i];
    process.stdout.write(`  [${i+1}/${HK_STOCKS.length}] ${code}... `);
    
    const data = await fetchWithRetry(code, 'hk');
    const analysis = analyzeKLine(data, code, 'hk');
    
    if (analysis) {
      results.hk.push(analysis);
      results.summary.success++;
      console.log(`✓ ${analysis.latestPrice} HKD (${analysis.totalReturn})`);
    } else {
      results.summary.failed++;
      console.log('✗ 失败');
    }
    
    if ((i + 1) % 10 === 0) {
      await wait(2000);
    }
  }
  
  // 获取A股数据
  console.log('\n📈 获取A股数据...');
  for (let i = 0; i < A_STOCKS.length; i++) {
    const code = A_STOCKS[i];
    process.stdout.write(`  [${i+1}/${A_STOCKS.length}] ${code}... `);
    
    const data = await fetchWithRetry(code, 'a');
    const analysis = analyzeKLine(data, code, 'a');
    
    if (analysis) {
      results.a.push(analysis);
      results.summary.success++;
      console.log(`✓ ${analysis.latestPrice} CNY (${analysis.totalReturn})`);
    } else {
      results.summary.failed++;
      console.log('✗ 失败');
    }
    
    if ((i + 1) % 10 === 0) {
      await wait(2000);
    }
  }
  
  results.summary.total = US_STOCKS.length + HK_STOCKS.length + A_STOCKS.length;
  
  // 保存到文件
  const outputPath = path.join(DATA_DIR, `stock-analysis-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ 数据已保存到: ${outputPath}`);
  
  // 打印汇总
  console.log('\n' + '='.repeat(50));
  console.log('📊 汇总报告');
  console.log('='.repeat(50));
  console.log(`总计: ${results.summary.total} 只`);
  console.log(`成功: ${results.summary.success} 只`);
  console.log(`失败: ${results.summary.failed} 只`);
  
  // Top 10 涨幅
  const allStocks = [...results.us, ...results.hk, ...results.a];
  const sorted = allStocks
    .filter(s => s.totalReturn)
    .sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn));
  
  console.log('\n📈 近1年涨幅 Top 10:');
  sorted.slice(0, 10).forEach((s, i) => {
    console.log(`  ${i+1}. ${s.code} (${s.market}): ${s.totalReturn}`);
  });
  
  console.log('\n📉 近1年跌幅 Top 10:');
  sorted.slice(-10).reverse().forEach((s, i) => {
    console.log(`  ${i+1}. ${s.code} (${s.market}): ${s.totalReturn}`);
  });
}

main().catch(console.error);
