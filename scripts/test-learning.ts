/**
 * 金融团队自学习模块测试
 */

import axios from 'axios';
import { gridSearch, parallelGridSearch, ParamSpaceTemplates } from './optimizer';
import { rankStrategies, generateScoreReport, StrategyPool, StrategyPerformance } from './strategy-scorer';
import { optimizePortfolio, calculatePortfolioMetrics, riskParityAllocation } from './portfolio-optimizer';
import { MarketRegimeDetector, TradeDiffRecorder, StrategyEffectivenessEvaluator } from './learning';

// ============ 数据获取 ============

async function getKlines(symbol: string, days: number = 500): Promise<any[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const url = 'https://stooq.com/q/d/l/?s=' + symbol.toUpperCase() + '.US&d1=' + start.toISOString().slice(0,10).replace(/-/g,'') + '&d2=' + end.toISOString().slice(0,10).replace(/-/g,'') + '&i=d';
  try {
    const res = await axios.get(url, { timeout: 20000 });
    return res.data.trim().split('\n').slice(1).filter(l => l.trim()).map(l => { const p = l.split(','); return { date: p[0], close: parseFloat(p[4]) }; }).filter(k => k.date && !isNaN(k.close));
  } catch(e) { return []; }
}

// ============ 策略函数 ============

function rsiStrategy(params: any) {
  const { period, oversold, overbought } = params;
  return async (klines: any[]) => {
    const trades: any[] = [];
    let hasPos = false;
    for (let i = period + 1; i < klines.length; i++) {
      let g = 0, l = 0;
      for (let j = 1; j <= period; j++) {
        const c = klines[i-j].close - klines[i-j-1].close;
        if (c > 0) g += c; else l -= c;
      }
      const rsi = l === 0 ? 100 : 100 - (100 / (1 + g / l));
      if (!hasPos && rsi < oversold) { trades.push({ type: 'buy', price: klines[i].close }); hasPos = true; }
      else if (hasPos && rsi > overbought) { trades.push({ type: 'sell', price: klines[i].close }); hasPos = false; }
    }
    if (hasPos) trades.push({ type: 'sell', price: klines[klines.length-1].close });
    return trades;
  };
}

// 计算回测结果
function calcBacktest(klines: any[], trades: any[]) {
  if (trades.length < 2) return { totalReturn: -100, winRate: 0, sharpeRatio: 0, maxDrawdown: 100 };
  
  let cash = 100000;
  for (const t of trades) {
    if (t.type === 'buy') cash -= t.price * 100;
    else cash += t.price * 100;
  }
  const final = cash;
  const totalReturn = (final - 100000) / 1000;
  
  let wins = 0, total = 0;
  for (let i = 1; i < trades.length; i++) {
    if (trades[i].type === 'sell') {
      total++;
      if (trades[i].price > trades[i-1].price) wins++;
    }
  }
  const winRate = total > 0 ? wins / total : 0;
  
  return { totalReturn, winRate, sharpeRatio: totalReturn / 10, maxDrawdown: Math.abs(totalReturn) / 2 };
}

// ============ 测试 ============

async function testOptimizer() {
  console.log('\n========== 测试1: 参数优化引擎 ==========\n');
  
  const klines = await getKlines('AAPL', 300);
  if (klines.length < 100) {
    console.log('⚠️ 数据不足，跳过优化测试');
    return;
  }
  
  // 简单网格搜索
  const paramSpace = {
    period: [7, 10, 14],
    oversold: [25, 30, 35],
    overbought: [65, 70, 75],
  };
  
  // 模拟回测函数
  const backtestFn = async (params: any) => {
    const trades: any[] = [];
    let hasPos = false;
    const { period, oversold, overbought } = params;
    for (let i = period + 1; i < klines.length; i++) {
      let g = 0, l = 0;
      for (let j = 1; j <= period; j++) {
        const c = klines[i-j].close - klines[i-j-1].close;
        if (c > 0) g += c; else l -= c;
      }
      const rsi = l === 0 ? 100 : 100 - (100 / (1 + g / l));
      if (!hasPos && rsi < oversold) { trades.push({ type: 'buy', price: klines[i].close }); hasPos = true; }
      else if (hasPos && rsi > overbought) { trades.push({ type: 'sell', price: klines[i].close }); hasPos = false; }
    }
    if (hasPos) trades.push({ type: 'sell', price: klines[klines.length-1].close });
    return calcBacktest(klines, trades);
  };
  
  // 串行搜索
  console.log('运行网格搜索 (参数空间: 3x3x3=27组合)...');
  const results = await gridSearch(backtestFn, paramSpace);
  
  console.log('\nTop 5 参数组合:');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i+1}. 参数: period=${r.params.period}, oversold=${r.params.oversold}, overbought=${r.params.overbought}`);
    console.log(`     得分: ${r.score.toFixed(2)}, 收益: ${r.metrics.totalReturn.toFixed(1)}%, 胜率: ${(r.metrics.winRate*100).toFixed(0)}%`);
  });
  
  console.log('\n✅ 参数优化测试完成');
}

async function testScorer() {
  console.log('\n========== 测试2: 策略评分系统 ==========\n');
  
  // 模拟策略表现数据
  const performances: StrategyPerformance[] = [
    { strategyId: 'RSI_7_30_70', strategyName: 'RSI短线', symbol: 'AAPL', period: 250, totalReturn: 15.2, annualReturn: 18.5, maxDrawdown: 12.3, winRate: 0.72, sharpeRatio: 1.8, totalTrades: 45, lastUpdated: new Date() },
    { strategyId: 'MA_5_20', strategyName: 'MA交叉', symbol: 'AAPL', period: 250, totalReturn: 8.5, annualReturn: 10.2, maxDrawdown: 18.7, winRate: 0.55, sharpeRatio: 0.9, totalTrades: 28, lastUpdated: new Date() },
    { strategyId: 'BB_20', strategyName: '布林带', symbol: 'AAPL', period: 250, totalReturn: -3.2, annualReturn: -4.1, maxDrawdown: 25.5, winRate: 0.42, sharpeRatio: -0.3, totalTrades: 35, lastUpdated: new Date() },
    { strategyId: 'MOM_10', strategyName: '动量', symbol: 'AAPL', period: 250, totalReturn: 22.8, annualReturn: 27.3, maxDrawdown: 15.6, winRate: 0.68, sharpeRatio: 2.1, totalTrades: 52, lastUpdated: new Date() },
    { strategyId: 'MACD_12_26', strategyName: 'MACD', symbol: 'AAPL', period: 250, totalReturn: 5.3, annualReturn: 6.5, maxDrawdown: 22.1, winRate: 0.48, sharpeRatio: 0.5, totalTrades: 18, lastUpdated: new Date() },
  ];
  
  const scores = rankStrategies(performances);
  
  console.log('策略排名:');
  scores.forEach(s => {
    console.log(`  ${s.rank}. ${s.strategyId} - 得分: ${s.score} (建议: ${s.recommendation})`);
    console.log(`     收益分: ${s.breakdown.returnScore} | 胜率分: ${s.breakdown.winScore} | 夏普分: ${s.breakdown.sharpeScore} | 回撤分: ${s.breakdown.drawdownScore}`);
  });
  
  // 策略池
  const pool = new StrategyPool();
  performances.forEach(p => pool.addStrategy(p));
  
  console.log('\nTop 3 策略:', pool.getTopStrategies(3).map(s => s.strategyId).join(', '));
  console.log('淘汰低分策略后:', pool.prunePoorPerformers(40).join(', ') || '无');
  
  console.log('\n✅ 策略评分测试完成');
}

function testPortfolio() {
  console.log('\n========== 测试3: 组合优化 ==========\n');
  
  // 模拟收益数据
  const returns1 = [0.01, -0.02, 0.015, 0.008, -0.01, 0.02, 0.005, -0.008, 0.012, 0.018];
  const returns2 = [0.008, -0.015, 0.012, 0.005, -0.008, 0.015, 0.003, -0.005, 0.01, 0.014];
  const returns3 = [-0.005, 0.01, -0.008, 0.018, -0.012, -0.01, 0.022, -0.006, 0.008, -0.004];
  
  const strategyReturns = new Map([
    ['RSI', returns1],
    ['MA', returns2],
    ['BB', returns3],
  ]);
  
  // 风险平价配置
  const allocations = riskParityAllocation(strategyReturns);
  
  console.log('风险平价配置:');
  allocations.forEach(a => {
    console.log(`  ${a.strategyId}: ${(a.weight * 100).toFixed(1)}%`);
  });
  
  // 计算组合指标
  const metrics = calculatePortfolioMetrics(strategyReturns, allocations);
  
  console.log('\n组合指标:');
  console.log(`  预期收益: ${metrics.expectedReturn.toFixed(1)}%`);
  console.log(`  波动率: ${metrics.volatility.toFixed(1)}%`);
  console.log(`  夏普比率: ${metrics.sharpeRatio.toFixed(2)}`);
  console.log(`  最大回撤: ${metrics.maxDrawdown.toFixed(1)}%`);
  console.log(`  多样化得分: ${metrics.diversificationScore}`);
  
  console.log('\n✅ 组合优化测试完成');
}

function testLearning() {
  console.log('\n========== 测试4: 实盘学习系统 ==========\n');
  
  // 测试市场环境识别
  const detector = new MarketRegimeDetector();
  
  // 模拟上涨数据
  const bullData = Array.from({ length: 30 }, (_, i) => ({ close: 100 + i * 1.5 }));
  // 模拟下跌数据
  const bearData = Array.from({ length: 30 }, (_, i) => ({ close: 150 - i * 2 }));
  // 模拟震荡数据
  const volatileData = Array.from({ length: 30 }, (_, i) => ({ close: 100 + Math.sin(i * 0.5) * 5 }));
  
  console.log('市场环境识别:');
  console.log(`  上涨数据: ${detector.getDescription(detector.detect(bullData as any))}`);
  console.log(`  下跌数据: ${detector.getDescription(detector.detect(bearData as any))}`);
  console.log(`  震荡数据: ${detector.getDescription(detector.detect(volatileData as any))}`);
  
  // 测试交易差异记录
  const recorder = new TradeDiffRecorder();
  recorder.recordSignal('sig001', 'AAPL', 'RSI', 150);
  // 模拟延迟执行
  setTimeout(() => {
    recorder.recordExecution('sig001', 151.5, 'buy');
    recorder.recordResult('sig001', 2, 1.8);
  }, 10);
  
  setTimeout(() => {
    const stats = recorder.getStats('RSI');
    console.log('\n交易差异统计:');
    console.log(`  平均价差: ${stats.avgPriceDiff.toFixed(2)}%`);
    console.log(`  平均延迟: ${stats.avgTimeDiff.toFixed(1)}分钟`);
    console.log(`  准确率: ${(stats.accuracy * 100).toFixed(0)}%`);
    
    // 测试策略有效性评估
    const evaluator = new StrategyEffectivenessEvaluator();
    const eff = evaluator.evaluate('RSI', 'AAPL', bullData as any);
    console.log('\n策略有效性:');
    console.log(`  准确率: ${(eff.accuracy * 100).toFixed(1)}%`);
    console.log(`  平均收益: ${eff.avgReturn.toFixed(2)}%`);
    
    console.log('\n✅ 实盘学习测试完成');
  }, 100);
}

// ============ 主程序 ============

async function main() {
  console.log('========================================');
  console.log('   金融团队自学习模块测试');
  console.log('========================================');
  
  await testOptimizer();
  await testScorer();
  testPortfolio();
  testLearning();
  
  setTimeout(() => {
    console.log('\n========================================');
    console.log('   所有测试完成!');
    console.log('========================================\n');
  }, 200);
}

main().catch(console.error);
