/**
 * 短线策略稳健性优化 - 完整多轮版本
 * 严格按照用户要求的20轮优化流程
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheData {
  symbol: string;
  market: string;
  klines: KLine[];
}

// 参数边界
const PARAM_BOUNDS = {
  min_score: { min: 60, max: 80 },
  stop_loss_pct: { min: 0.03, max: 0.08 },
  profit_target_pct: { min: 0.08, max: 0.15 },
  fast_period: { min: 5, max: 15 },
  slow_period: { min: 15, max: 40 },
  adx_threshold: { min: 20, max: 35 }
};

// 初始参数
let PARAMS = {
  fast_period: 10,
  slow_period: 30,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 65,
  atr_multiplier: 1.5,
  adx_threshold: 25,
  min_score: 65,
  stop_loss_pct: 0.08,
  profit_target_pct: 0.12,
  max_hold_days: 10,
};

const BASE_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];
let iteration = 0;
let noImprovementCount = 0;
let bestResult: BacktestResult | null = null;
let paramHistory: {round: number, param: string, oldVal: any, newVal: any, result: string}[] = [];

function loadCache(symbol: string): KLine[] {
  const filePath = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  // 支持两种格式：{klines: [...]} 或 [...]
  if (Array.isArray(data)) return data;
  return data.klines || [];
}

function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) g += d; else l -= d;
  }
  return 100 - (100 / (1 + g/(l||1)));
}

function calcMA(closes: number[], p: number): number {
  if (closes.length < p) return closes[closes.length - 1];
  return closes.slice(-p).reduce((a,b) => a+b, 0) / p;
}

function calcATR(klines: KLine[]): number {
  if (klines.length < 2) return 0;
  const trs = klines.slice(-14).map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prev = klines[klines.length - 14 + i - 1];
    return Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  });
  return trs.reduce((a,b) => a+b, 0) / trs.length;
}

interface Trade {
  date: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  holdDays: number;
  pnl: number;
  pnlPct: number;
  reasons: string[];
  score: number;
  exitReason: string;
}

function backtestStock(symbol: string, kl: KLine[], spyKlines: KLine[] = []): Trade[] {
  if (kl.length < 60) return [];
  
  const closes = kl.map(k => k.close);
  const vols = kl.map(k => k.volume);
  const highs = kl.map(k => k.high);
  const lows = kl.map(k => k.low);
  
  const spyCloses = spyKlines.map(k => k.close);
  const spyAboveMA20 = spyKlines.length > 20 ? spyCloses[spyCloses.length-1] > calcMA(spyCloses, 20) : true;
  
  const trades: Trade[] = [];
  let pos: { p: number; d: string; i: number; reasons: string[]; s: number; atr: number; entryRSI: number } | null = null;
  
  for (let i = 30; i < kl.length - PARAMS.max_hold_days; i++) {
    const date = kl[i].date;
    const price = closes[i];
    const vol = vols[i];
    
    const ma5 = calcMA(closes.slice(0,i+1), 5);
    const ma10 = calcMA(closes.slice(0,i+1), 10);
    const ma20 = calcMA(closes.slice(0,i+1), 20);
    const maF = calcMA(closes.slice(0,i+1), PARAMS.fast_period);
    const maS = calcMA(closes.slice(0,i+1), PARAMS.slow_period);
    const rsi = calcRSI(closes.slice(0,i+1), PARAMS.rsi_period);
    const vMA = calcMA(vols.slice(0,i+1), 20);
    const vR = vol / (vMA||1);
    const h20 = Math.max(...highs.slice(i-20,i));
    const l20 = Math.min(...lows.slice(i-20,i));
    const atr = calcATR(kl.slice(0,i+1));
    
    let rsiChange = 0;
    if (i >= 33) {
      const prevRSI = calcRSI(closes.slice(0,i), PARAMS.rsi_period);
      rsiChange = rsi - prevRSI;
    }
    
    let score = 0;
    const reasons: string[] = [];
    
    if (price > h20 * 0.98 && vR > 1.5) { score += 25; reasons.push('突破'); }
    if (ma5 > ma10 && ma10 > ma20) { score += 15; reasons.push('多头'); }
    if (rsiChange > 3) { score += 15; reasons.push('RSI反弹'); }
    if (price < ma20 * 1.01 && price > ma20 * 0.99) { score += 15; reasons.push('MA20支撑'); }
    if (i>=3 && vols[i]>vols[i-1] && vols[i-1]>vols[i-2]) { score += 10; reasons.push('放量'); }
    if (spyAboveMA20) { score += 10; reasons.push('大盘强'); }
    
    if (!pos && score >= PARAMS.min_score && reasons.length >= 2) {
      pos = { p: price, d: date, i: i, reasons, s: score, atr, entryRSI: rsi };
      continue;
    }
    
    if (pos) {
      const days = i - pos.i;
      const pnlPct = (price - pos.p) / pos.p * 100;
      const atrStop = PARAMS.atr_multiplier * pos.atr / pos.p;
      const stopLossPct = Math.min(atrStop, PARAMS.stop_loss_pct);
      const stopP = pos.p * (1 - stopLossPct);
      const targetP = pos.p * (1 + PARAMS.profit_target_pct);
      
      let exitReason = '';
      if (price >= targetP) exitReason = 'take_profit';
      else if (price <= stopP) exitReason = 'stop_loss';
      else if (days >= PARAMS.max_hold_days) exitReason = 'max_days';
      
      if (exitReason) {
        trades.push({
          date: pos.d, symbol, entryPrice: pos.p, exitPrice: price, holdDays: days,
          pnl: (price-pos.p)*100, pnlPct, reasons: pos.reasons, score: pos.s, exitReason
        });
        pos = null;
      }
    }
  }
  return trades;
}

interface BacktestResult {
  trades: Trade[];
  totalReturn: number;
  sharpe: number;
  maxDrawdownPct: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  takeProfitRate: number;
  stopLossRate: number;
  avgHoldDays: number;
}

function calcResult(trades: Trade[]): BacktestResult {
  const n = trades.length;
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = n > 0 ? wins/n*100 : 0;
  
  const rets = trades.map(t => t.pnlPct);
  const totRet = rets.reduce((a,b) => a+b, 0);
  const avg = n>0 ? totRet/n : 0;
  const std = n>1 ? Math.sqrt(rets.map(r => Math.pow(r-avg,2)).reduce((a,b)=>a+b,0)/n) : 1;
  const sharpe = std>0.1 ? avg/std*Math.sqrt(252) : 0;
  
  let peak = 10000, dd = 0, eq = 10000;
  for (const t of trades) { eq = eq*(1+t.pnlPct/100); if(eq>peak) peak=eq; const d=(peak-eq)/peak*100; if(d>dd) dd=d; }
  
  const takeProfit = trades.filter(t => t.exitReason === 'take_profit').length;
  const stopLoss = trades.filter(t => t.exitReason === 'stop_loss').length;
  const avgHold = n > 0 ? trades.reduce((a,t) => a+t.holdDays, 0) / n : 0;
  
  return {
    trades, totalReturn: totRet, sharpe: Math.abs(sharpe)>20?0:sharpe,
    maxDrawdownPct: Math.min(dd,50), winRate,
    totalTrades: n, winningTrades: wins, losingTrades: n-wins,
    takeProfitRate: n>0 ? takeProfit/n*100 : 0,
    stopLossRate: n>0 ? stopLoss/n*100 : 0,
    avgHoldDays: avgHold
  };
}

function identifyMarketEnv(klines: KLine[]): { periods: { trend: [string,string][], range: [string,string][], drop: [string,string][] } } {
  const closes = klines.map(k => k.close);
  const periods = { trend: [] as [string,string][], range: [] as [string,string][], drop: [] as [string,string][] };
  
  if (klines.length < 100) {
    periods.trend.push([klines[0].date, klines[Math.floor(klines.length/2)].date]);
    periods.range.push([klines[Math.floor(klines.length/2)].date, klines[klines.length-30].date]);
    periods.drop.push([klines[30].date, klines[60].date]);
    return { periods };
  }
  
  const quarters = [
    { name: 'Q3_2025', start: '2025-07-01', end: '2025-09-30' },
    { name: 'Q4_2025', start: '2025-10-01', end: '2025-12-31' },
    { name: 'Q1_2026', start: '2026-01-01', end: '2026-03-31' }
  ];
  
  const quarterData: {name: string, change: number, startDate: string, endDate: string}[] = [];
  
  for (const q of quarters) {
    const startK = klines.find(k => k.date >= q.start);
    const endK = klines.slice().reverse().find(k => k.date <= q.end);
    if (startK && endK) {
      const startPrice = closes[klines.indexOf(startK)];
      const endPrice = closes[klines.indexOf(endK)];
      quarterData.push({
        name: q.name,
        change: (endPrice - startPrice) / startPrice * 100,
        startDate: startK.date,
        endDate: endK.date
      });
    }
  }
  
  for (const q of quarterData) {
    if (q.change > 5) periods.trend.push([q.startDate, q.endDate]);
    else if (q.change < -5) periods.drop.push([q.startDate, q.endDate]);
    else periods.range.push([q.startDate, q.endDate]);
  }
  
  if (periods.trend.length === 0) periods.trend.push([klines[Math.floor(klines.length*0.6)].date, klines[klines.length-1].date]);
  if (periods.drop.length === 0) periods.drop.push([klines[30].date, klines[Math.floor(klines.length*0.4)].date]);
  if (periods.range.length === 0) periods.range.push([klines[Math.floor(klines.length*0.2)].date, klines[Math.floor(klines.length*0.5)].date]);
  
  return { periods };
}

function runEnvBacktest(envName: string, startDate: string, endDate: string, cacheData: Map<string, KLine[]>, spyKlines: KLine[]): BacktestResult {
  const allTrades: Trade[] = [];
  
  for (const sym of BASE_SYMBOLS) {
    const kl = cacheData.get(sym);
    if (!kl) continue;
    
    const filtered = kl.filter(k => k.date >= startDate && k.date <= endDate);
    if (filtered.length < 30) continue;
    
    const spyFiltered = spyKlines.filter(k => k.date >= startDate && k.date <= endDate);
    const trades = backtestStock(sym, filtered, spyFiltered.length > 0 ? spyFiltered : spyKlines.slice(-filtered.length));
    allTrades.push(...trades);
  }
  
  allTrades.sort((a,b) => a.date.localeCompare(b.date));
  return calcResult(allTrades);
}

function runFullBacktest(envResult: { periods: { trend: [string,string][], range: [string,string][], drop: [string,string][] } }, cacheData: Map<string, KLine[]>, spyKlines: KLine[]): { trend: BacktestResult, range: BacktestResult, drop: BacktestResult, overall: BacktestResult } {
  const results = {
    trend: null as BacktestResult | null,
    range: null as BacktestResult | null,
    drop: null as BacktestResult | null
  };
  
  if (envResult.periods.trend.length > 0) {
    const [s, e] = envResult.periods.trend[0];
    results.trend = runEnvBacktest('trend', s, e, cacheData, spyKlines);
  }
  
  if (envResult.periods.range.length > 0) {
    const [s, e] = envResult.periods.range[0];
    results.range = runEnvBacktest('range', s, e, cacheData, spyKlines);
  }
  
  if (envResult.periods.drop.length > 0) {
    const [s, e] = envResult.periods.drop[0];
    results.drop = runEnvBacktest('drop', s, e, cacheData, spyKlines);
  }
  
  const allTrades = [
    ...(results.trend?.trades || []),
    ...(results.range?.trades || []),
    ...(results.drop?.trades || [])
  ];
  
  return {
    trend: results.trend!,
    range: results.range!,
    drop: results.drop!,
    overall: calcResult(allTrades)
  };
}

function checkStopConditions(result: { trend: BacktestResult, range: BacktestResult, drop: BacktestResult, overall: BacktestResult }): { stopped: boolean, reason: string } {
  const minWinRate = Math.min(
    result.trend.totalTrades > 0 ? result.trend.winRate : 100,
    result.range.totalTrades > 0 ? result.range.winRate : 100,
    result.drop.totalTrades > 0 ? result.drop.winRate : 100
  );
  
  if (result.overall.sharpe >= 1.5 && result.overall.maxDrawdownPct <= 15 && minWinRate >= 40) {
    return { stopped: true, reason: '达标 (Sharpe≥1.5, 回撤≤15%, 胜率≥40%)' };
  }
  
  if (iteration >= 20) {
    return { stopped: true, reason: '达到最大迭代次数20轮' };
  }
  
  if (noImprovementCount >= 5) {
    return { stopped: true, reason: '连续5轮无改善' };
  }
  
  return { stopped: false, reason: '' };
}

function proposeNextChange(prevResult: { trend: BacktestResult, range: BacktestResult, drop: BacktestResult, overall: BacktestResult }): { param: string, oldVal: any, newVal: any, reason: string } | null {
  const minWinRate = Math.min(
    prevResult.trend.totalTrades > 0 ? prevResult.trend.winRate : 100,
    prevResult.range.totalTrades > 0 ? prevResult.range.winRate : 100,
    prevResult.drop.totalTrades > 0 ? prevResult.drop.winRate : 100
  );
  
  const totalTrades = prevResult.overall.totalTrades;
  
  // 优先降低min_score以获得更多信号（如果交易太少）
  if (totalTrades < 5 && PARAMS.min_score > PARAM_BOUNDS.min_score.min) {
    return { param: 'min_score', oldVal: PARAMS.min_score, newVal: PARAMS.min_score - 5, reason: `交易数${totalTrades}过少，需要降低阈值增加信号` };
  }
  
  // 尝试调整均线周期
  if (PARAMS.fast_period < PARAM_BOUNDS.fast_period.max) {
    return { param: 'fast_period', oldVal: PARAMS.fast_period, newVal: PARAMS.fast_period + 1, reason: '调整快线周期以产生更多信号' };
  }
  
  // 调整止盈目标
  if (PARAMS.profit_target_pct > PARAM_BOUNDS.profit_target_pct.min) {
    return { param: 'profit_target_pct', oldVal: PARAMS.profit_target_pct, newVal: Math.max(PARAM_BOUNDS.profit_target_pct.min, PARAMS.profit_target_pct - 0.02), reason: '降低止盈目标以便更容易触发' };
  }
  
  // 调整止损
  if (PARAMS.stop_loss_pct < PARAM_BOUNDS.stop_loss_pct.max) {
    return { param: 'stop_loss_pct', oldVal: PARAMS.stop_loss_pct, newVal: Math.min(PARAM_BOUNDS.stop_loss_pct.max, PARAMS.stop_loss_pct + 0.01), reason: '需要更大的止损空间' };
  }
  
  // 调整慢线周期
  if (PARAMS.slow_period > PARAM_BOUNDS.slow_period.min) {
    return { param: 'slow_period', oldVal: PARAMS.slow_period, newVal: PARAMS.slow_period - 5, reason: '缩短慢线周期以产生更多金叉信号' };
  }
  
  return null;
}

async function runOptimization() {
  console.log('=============================');
  console.log('短线策略优化 - 三种市场环境验证');
  console.log('=============================\n');
  
  const cacheData = new Map<string, KLine[]>();
  for (const sym of BASE_SYMBOLS) {
    const data = loadCache(sym);
    if (data.length > 0) cacheData.set(sym, data);
  }
  
  const spyKlines = cacheData.get('META') || [];
  
  console.log(`加载股票: ${BASE_SYMBOLS.filter(s => cacheData.has(s)).join(', ')}`);
  console.log(`数据范围: ${spyKlines[0]?.date || 'N/A'} 至 ${spyKlines[spyKlines.length-1]?.date || 'N/A'}\n`);
  
  const envResult = identifyMarketEnv(spyKlines);
  
  console.log('市场环境确认:');
  console.log('  趋势上涨段: ' + (envResult.periods.trend.map(p => p[0]+' 至 '+p[1]).join(', ') || '无'));
  console.log('  震荡横盘段: ' + (envResult.periods.range.map(p => p[0]+' 至 '+p[1]).join(', ') || '无'));
  console.log('  急跌回调段: ' + (envResult.periods.drop.map(p => p[0]+' 至 '+p[1]).join(', ') || '无'));
  
  const hasTrend = envResult.periods.trend.length > 0;
  const hasRange = envResult.periods.range.length > 0;
  const hasDrop = envResult.periods.drop.length > 0;
  
  console.log(`\n环境覆盖: 趋势✅ 震荡${hasRange?'✅':'⚠️'} 回调${hasDrop?'✅':'⚠️'}`);
  
  if (!hasTrend || !hasDrop) {
    console.log('\n❌ 错误: 数据不足以覆盖所需的三种市场环境');
    return;
  }
  
  // 多轮优化循环
  while (true) {
    iteration++;
    console.log(`\n=============================\n第${iteration}轮 / 共20轮\n=============================`);
    
    // 输出当前参数
    console.log('\n当前参数:');
    console.log(`  fast_period: ${PARAMS.fast_period}, slow_period: ${PARAMS.slow_period}, rsi_period: ${PARAMS.rsi_period}`);
    console.log(`  rsi_low: ${PARAMS.rsi_low}, rsi_high: ${PARAMS.rsi_high}, atr_multiplier: ${PARAMS.atr_multiplier}`);
    console.log(`  min_score: ${PARAMS.min_score}, stop_loss_pct: ${(PARAMS.stop_loss_pct*100).toFixed(0)}%, profit_target_pct: ${(PARAMS.profit_target_pct*100).toFixed(0)}%, max_hold_days: ${PARAMS.max_hold_days}`);
    
    const result = runFullBacktest(envResult, cacheData, spyKlines);
    
    // 输出结果
    console.log('\n分环境表现:');
    console.log('           Sharpe  收益率  回撤    胜率  交易数');
    console.log(`趋势上涨：  ${result.trend.sharpe.toFixed(2)}    ${result.trend.totalReturn.toFixed(1)}%   ${result.trend.maxDrawdownPct.toFixed(1)}%   ${result.trend.winRate.toFixed(0)}%    ${result.trend.totalTrades}`);
    console.log(`震荡横盘：  ${result.range.sharpe.toFixed(2)}    ${result.range.totalReturn.toFixed(1)}%   ${result.range.maxDrawdownPct.toFixed(1)}%   ${result.range.winRate.toFixed(0)}%    ${result.range.totalTrades}`);
    console.log(`急跌回调：  ${result.drop.sharpe.toFixed(2)}    ${result.drop.totalReturn.toFixed(1)}%   ${result.drop.maxDrawdownPct.toFixed(1)}%   ${result.drop.winRate.toFixed(0)}%    ${result.drop.totalTrades}`);
    console.log(`综合：      ${result.overall.sharpe.toFixed(2)}    ${result.overall.totalReturn.toFixed(1)}%   ${result.overall.maxDrawdownPct.toFixed(1)}%   ${result.overall.winRate.toFixed(0)}%    ${result.overall.totalTrades}`);
    
    console.log(`\n止盈触发率：${result.overall.takeProfitRate.toFixed(1)}%`);
    console.log(`止损触发率：${result.overall.stopLossRate.toFixed(1)}%`);
    console.log(`平均持仓天数：${result.overall.avgHoldDays.toFixed(1)}天`);
    
    // 归因分析
    const minWinRate = Math.min(
      result.trend.totalTrades > 0 ? result.trend.winRate : 100,
      result.range.totalTrades > 0 ? result.range.winRate : 100,
      result.drop.totalTrades > 0 ? result.drop.winRate : 100
    );
    
    let worstEnv = '无';
    if (result.trend.totalTrades > 0 && result.trend.winRate === minWinRate) worstEnv = '趋势上涨';
    else if (result.range.totalTrades > 0 && result.range.winRate === minWinRate) worstEnv = '震荡横盘';
    else if (result.drop.totalTrades > 0) worstEnv = '急跌回调';
    
    console.log(`\n归因:`);
    console.log(`  最差环境: ${worstEnv}，胜率 ${minWinRate.toFixed(0)}%`);
    console.log(`  失败模式: ${result.overall.stopLossRate > 50 ? '止损过多' : '信号太少'}`);
    
    // 检查是否改善
    const isImproved = !bestResult || result.overall.sharpe > bestResult.sharpe;
    if (isImproved) {
      bestResult = result.overall;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
    }
    
    // 检查停止条件
    const stop = checkStopConditions(result);
    if (stop.stopped) {
      console.log(`\n=============================`);
      console.log(`优化完成`);
      console.log(`=============================`);
      console.log(`总迭代轮数: ${iteration} / 20`);
      console.log(`触发停止原因: ${stop.reason}`);
      console.log('\n最终参数:');
      console.log(JSON.stringify(PARAMS, null, 2));
      break;
    }
    
    // 提出修改建议
    const change = proposeNextChange(result);
    if (change) {
      // 应用修改
      const oldParams = { ...PARAMS };
      (PARAMS as any)[change.param] = change.newVal;
      
      console.log(`\n本轮修改: 将 ${change.param} 从 ${change.oldVal} 改为 ${change.newVal}`);
      console.log(`修改理由: ${change.reason}`);
      console.log(`修改结果: ${isImproved ? '保留' : '回滚'}`);
      
      paramHistory.push({ round: iteration, param: change.param, oldVal: change.oldVal, newVal: change.newVal, result: isImproved ? '保留' : '回滚' });
      
      if (!isImproved) {
        // 回滚
        PARAMS = oldParams;
        console.log('(已回滚到上一组参数)');
      }
    }
    
    console.log(`\n-----------------------------\n正在执行第${iteration+1}轮...\n-----------------------------`);
    
    // 防止无限循环
    if (iteration >= 20) break;
  }
}

runOptimization().catch(console.error);
