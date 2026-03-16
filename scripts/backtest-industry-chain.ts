/**
 * 产业链因子回测
 * 验证产业链因子在历史数据上的预测能力
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAllStockCodes } from '../src/services/news/analysis/industry-data';
import { identifyIndustry, processIndustryChain } from '../src/services/news/analysis/industry-chain';

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestResult {
  symbol: string;
  industry: string;
  holdingDays: number;
  returnPct: number;
  signal: 'buy' | 'sell' | 'hold';
  reason: string;
}

/**
 * 加载K线数据
 */
function loadKLines(symbol: string, market: 'a' | 'hk'): KLine[] {
  const filePath = path.join(
    __dirname, 
    `../../data/cache/klines/${market}_${symbol}.json`
  );
  
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data.slice(-60); // 取最近60天
  } catch {
    return [];
  }
}

/**
 * 计算收益率
 */
function calculateReturn(klines: KLine[], buyDay: number, holdingDays: number): number {
  if (buyDay + holdingDays >= klines.length) return 0;
  
  const buyPrice = klines[buyDay].close;
  const sellPrice = klines[buyDay + holdingDays].close;
  
  return (sellPrice - buyPrice) / buyPrice * 100;
}

/**
 * 模拟产业链因子信号
 * 基于行业新闻生成买入信号
 */
function generateChainSignal(
  symbol: string,
  industryName: string,
  sentiment: number
): { signal: 'buy' | 'sell' | 'hold'; reason: string } {
  const threshold = 0.3;
  
  if (sentiment > threshold) {
    return {
      signal: 'buy',
      reason: `${industryName}产业链利好, 情感得分:${sentiment.toFixed(2)}`,
    };
  } else if (sentiment < -threshold) {
    return {
      signal: 'sell',
      reason: `${industryName}产业链利空, 情感得分:${sentiment.toFixed(2)}`,
    };
  }
  
  return {
    signal: 'hold',
    reason: '信号不足',
  };
}

/**
 * 运行回测
 */
async function runBacktest() {
  console.log('='.repeat(60));
  console.log('     🧪 产业链因子回测');
  console.log('='.repeat(60));
  
  // 测试的行业和股票
  const testCases = [
    { symbol: '300750', market: 'a' as const, industry: '新能源汽车' },
    { symbol: '002594', market: 'a' as const, industry: '新能源汽车' },
    { symbol: '002460', market: 'a' as const, industry: '新能源汽车' },
    { symbol: '600519', market: 'a' as const, industry: '食品饮料' },
    { symbol: '600276', market: 'a' as const, industry: '医药生物' },
    { symbol: '000002', market: 'a' as const, industry: '房地产' },
    // 港股
    { symbol: '00700', market: 'hk' as const, industry: '科技互联网' },
    { symbol: '09988', market: 'hk' as const, industry: '科技互联网' },
  ];
  
  const results: BacktestResult[] = [];
  
  for (const test of testCases) {
    console.log(`\n📌 测试: ${test.symbol} (${test.industry})`);
    
    // 加载K线
    const klines = loadKLines(test.symbol, test.market);
    
    if (klines.length < 30) {
      console.log(`   ⚠️ 数据不足，仅${klines.length}天`);
      continue;
    }
    
    console.log(`   📊 K线数据: ${klines.length}天`);
    
    // 模拟不同的情感得分场景
    const scenarios = [
      { sentiment: 0.5, label: '利好' },
      { sentiment: 0.3, label: '轻微利好' },
      { sentiment: 0, label: '中性' },
    ];
    
    for (const scenario of scenarios) {
      const { signal, reason } = generateChainSignal(
        test.symbol, 
        test.industry, 
        scenario.sentiment
      );
      
      if (signal === 'hold') continue;
      
      // 模拟买入持有
      const returns: number[] = [];
      for (const holding of [5, 10, 20]) {
        const ret = calculateReturn(klines, klines.length - 30, holding);
        returns.push(ret);
      }
      
      const result: BacktestResult = {
        symbol: test.symbol,
        industry: test.industry,
        holdingDays: 10,
        returnPct: returns[1],
        signal,
        reason: `${reason} | 持有10天收益:${returns[1].toFixed(2)}%`,
      };
      
      results.push(result);
      
      const emoji = signal === 'buy' ? '🟢' : '🔴';
      console.log(`   ${emoji} ${scenario.label}信号 | 10天收益: ${returns[1].toFixed(2)}%`);
    }
  }
  
  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('     📈 回测汇总');
  console.log('='.repeat(60));
  
  const buyResults = results.filter(r => r.signal === 'buy');
  const sellResults = results.filter(r => r.signal === 'sell');
  
  if (buyResults.length > 0) {
    const avgReturn = buyResults.reduce((sum, r) => sum + r.returnPct, 0) / buyResults.length;
    console.log(`\n🟢 买入信号: ${buyResults.length}次`);
    console.log(`   平均收益: ${avgReturn.toFixed(2)}%`);
    console.log(`   正收益次数: ${buyResults.filter(r => r.returnPct > 0).length}`);
  }
  
  if (sellResults.length > 0) {
    const avgReturn = sellResults.reduce((sum, r) => sum + r.returnPct, 0) / sellResults.length;
    console.log(`\n🔴 卖出信号: ${sellResults.length}次`);
    console.log(`   平均收益: ${avgReturn.toFixed(2)}%`);
  }
  
  console.log('\n⚠️ 注意: 此为简化回测，需更完整数据验证');
}

// 运行
runBacktest().catch(console.error);
