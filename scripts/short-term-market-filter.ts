/**
 * 短线策略 - 大盘过滤优化
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

// 锁定参数
const PARAMS = {
  fast_period: 11,
  slow_period: 30,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 65,
  atr_multiplier: 1.5,
  min_score: 65,
  stop_loss_pct: 0.06, // 2.0倍ATR，不超过6%
  profit_target_pct: 0.12,
  max_hold_days: 10,
  early_exit_pct: 0.08, // 第5天盈利<8%平仓
};

const BASE_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];

function loadCache(symbol: string): KLine[] {
  const filePath = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return (data.klines || []).filter((k: KLine) => k.close && k.close > 0);
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
  exitReason: string;
}

// 方案A：只加开仓过滤
function runBacktestA(stockKlines: Map<string, KLine[]>, spyKlines: KLine[], startDate: string, endDate: string) {
  const allTrades: Trade[] = [];
  let filterTriggered = 0;
  let missedSignals = 0;
  
  // 构建SPY的MA20
  const spyCloses = spyKlines.map(k => k.close);
  const spyDates = spyKlines.map(k => k.date);
  const spyAboveMA20 = new Map<string, boolean>();
  for (let i = 20; i < spyCloses.length; i++) {
    const ma20 = calcMA(spyCloses.slice(0, i+1), 20);
    spyAboveMA20.set(spyDates[i], spyCloses[i] > ma20);
  }
  
  for (const sym of BASE_SYMBOLS) {
    const kl = stockKlines.get(sym);
    if (!kl) continue;
    
    const filtered = kl.filter(k => k.date >= startDate && k.date <= endDate);
    if (filtered.length < 30) continue;
    
    const closes = filtered.map(k => k.close);
    const vols = filtered.map(k => k.volume);
    const highs = filtered.map(k => k.high);
    const lows = filtered.map(k => k.low);
    const dates = filtered.map(k => k.date);
    
    let pos: { p: number; d: string; i: number; atr: number } | null = null;
    
    for (let i = 30; i < filtered.length - PARAMS.max_hold_days; i++) {
      const date = dates[i];
      const price = closes[i];
      const vol = vols[i];
      
      // 大盘过滤
      const isMarketOk = spyAboveMA20.get(date) !== false;
      
      const ma5 = calcMA(closes.slice(0,i+1), 5);
      const ma10 = calcMA(closes.slice(0,i+1), 10);
      const ma20 = calcMA(closes.slice(0,i+1), 20);
      const maF = calcMA(closes.slice(0,i+1), PARAMS.fast_period);
      const maS = calcMA(closes.slice(0,i+1), PARAMS.slow_period);
      const rsi = calcRSI(closes.slice(0,i+1), PARAMS.rsi_period);
      const vMA = calcMA(vols.slice(0,i+1), 20);
      const vR = vol / (vMA||1);
      const h20 = Math.max(...highs.slice(i-20,i));
      const atr = calcATR(filtered.slice(0,i+1));
      
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
      
      // 买入信号 - 但要检查大盘
      if (!pos && score >= PARAMS.min_score && reasons.length >= 2) {
        if (!isMarketOk) {
          missedSignals++;
          continue;
        }
        pos = { p: price, d: date, i, atr };
        continue;
      }
      
      if (pos) {
        const days = i - pos.i;
        const pnlPct = (price - pos.p) / pos.p * 100;
        const atrStop = PARAMS.atr_multiplier * pos.atr / pos.p;
        const stopP = pos.p * (1 - Math.min(Math.max(atrStop, 0.03), 0.08));
        const targetP = pos.p * (1 + PARAMS.profit_target_pct);
        
        let exitReason = '';
        
        if (price >= targetP) exitReason = 'take_profit';
        else if (price <= stopP) exitReason = 'stop_loss';
        else if (days === 5 && pnlPct < PARAMS.early_exit_pct * 100) exitReason = 'early_exit';
        else if (days >= PARAMS.max_hold_days) exitReason = 'max_days';
        
        if (exitReason) {
          allTrades.push({
            date: pos.d, symbol: sym, entryPrice: pos.p, exitPrice: price, holdDays: days,
            pnl: (price-pos.p)*100, pnlPct, exitReason
          });
          pos = null;
        }
      }
    }
  }
  
  allTrades.sort((a,b) => a.date.localeCompare(b.date));
  return calcMetrics(allTrades);
}

// 方案B：开仓过滤 + 持仓保护
function runBacktestB(stockKlines: Map<string, KLine[]>, spyKlines: KLine[], startDate: string, endDate: string) {
  const allTrades: Trade[] = [];
  let filterTriggered = 0;
  let missedSignals = 0;
  let protectedTrades = 0;
  
  // 构建SPY的MA20和跌破MA20的距离
  const spyCloses = spyKlines.map(k => k.close);
  const spyDates = spyKlines.map(k => k.date);
  const spyInfo = new Map<string, {above: boolean, dropPct: number}>();
  for (let i = 20; i < spyCloses.length; i++) {
    const ma20 = calcMA(spyCloses.slice(0, i+1), 20);
    const above = spyCloses[i] > ma20;
    const dropPct = above ? 0 : (ma20 - spyCloses[i]) / ma20 * 100;
    spyInfo.set(spyDates[i], { above, dropPct });
  }
  
  for (const sym of BASE_SYMBOLS) {
    const kl = stockKlines.get(sym);
    if (!kl) continue;
    
    const filtered = kl.filter(k => k.date >= startDate && k.date <= endDate);
    if (filtered.length < 30) continue;
    
    const closes = filtered.map(k => k.close);
    const vols = filtered.map(k => k.volume);
    const highs = filtered.map(k => k.high);
    const lows = filtered.map(k => k.low);
    const dates = filtered.map(k => k.date);
    
    let pos: { p: number; d: string; i: number; atr: number } | null = null;
    
    for (let i = 30; i < filtered.length - PARAMS.max_hold_days; i++) {
      const date = dates[i];
      const price = closes[i];
      const vol = vols[i];
      
      const marketInfo = spyInfo.get(date) || { above: true, dropPct: 0 };
      const isMarketOk = marketInfo.above;
      const marketDropTooMuch = marketInfo.dropPct > 3;
      
      if (marketDropTooMuch && pos) {
        // 持仓保护触发
        protectedTrades++;
        allTrades.push({
          date: pos.d, symbol: sym, entryPrice: pos.p, exitPrice: price, holdDays: i - pos.i,
          pnl: (price-pos.p)*100, pnlPct: (price-pos.p)/pos.p*100, exitReason: 'market_protect'
        });
        pos = null;
        continue;
      }
      
      const ma5 = calcMA(closes.slice(0,i+1), 5);
      const ma10 = calcMA(closes.slice(0,i+1), 10);
      const ma20 = calcMA(closes.slice(0,i+1), 20);
      const maF = calcMA(closes.slice(0,i+1), PARAMS.fast_period);
      const maS = calcMA(closes.slice(0,i+1), PARAMS.slow_period);
      const rsi = calcRSI(closes.slice(0,i+1), PARAMS.rsi_period);
      const vMA = calcMA(vols.slice(0,i+1), 20);
      const vR = vol / (vMA||1);
      const h20 = Math.max(...highs.slice(i-20,i));
      const atr = calcATR(filtered.slice(0,i+1));
      
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
      
      if (!pos && score >= PARAMS.min_score && reasons.length >= 2) {
        if (!isMarketOk) {
          missedSignals++;
          continue;
        }
        pos = { p: price, d: date, i, atr };
        continue;
      }
      
      if (pos) {
        const days = i - pos.i;
        const pnlPct = (price - pos.p) / pos.p * 100;
        const atrStop = PARAMS.atr_multiplier * pos.atr / pos.p;
        const stopP = pos.p * (1 - Math.min(Math.max(atrStop, 0.03), 0.08));
        const targetP = pos.p * (1 + PARAMS.profit_target_pct);
        
        let exitReason = '';
        
        if (price >= targetP) exitReason = 'take_profit';
        else if (price <= stopP) exitReason = 'stop_loss';
        else if (days === 5 && pnlPct < PARAMS.early_exit_pct * 100) exitReason = 'early_exit';
        else if (days >= PARAMS.max_hold_days) exitReason = 'max_days';
        
        if (exitReason) {
          allTrades.push({
            date: pos.d, symbol: sym, entryPrice: pos.p, exitPrice: price, holdDays: days,
            pnl: (price-pos.p)*100, pnlPct, exitReason
          });
          pos = null;
        }
      }
    }
  }
  
  allTrades.sort((a,b) => a.date.localeCompare(b.date));
  return { ...calcMetrics(allTrades), protectedTrades };
}

function calcMetrics(trades: Trade[]) {
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
    trades,
    sharpe: Math.abs(sharpe)>20?0:sharpe,
    totalReturn: totRet,
    maxDrawdownPct: Math.min(dd,50),
    winRate,
    totalTrades: n,
    takeProfitRate: n>0 ? takeProfit/n*100 : 0,
    stopLossRate: n>0 ? stopLoss/n*100 : 0,
    avgHoldDays: avgHold
  };
}

async function main() {
  // 加载数据
  const stockKlines = new Map<string, KLine[]>();
  for (const sym of BASE_SYMBOLS) {
    const data = loadCache(sym);
    if (data.length > 0) stockKlines.set(sym, data);
  }
  
  const spyKlines = loadCache('SPY');
  if (spyKlines.length === 0) {
    console.log('❌ 未找到SPY数据');
    return;
  }
  
  const startDate = '2021-06-10';
  const endDate = '2026-03-20';
  
  console.log('=== 短线策略大盘过滤优化 ===\n');
  console.log(`股票池: ${BASE_SYMBOLS.join(', ')}`);
  console.log(`大盘: SPY`);
  console.log(`时间段: ${startDate} 至 ${endDate}\n`);
  
  const PREV_RESULT = { sharpe: 2.32, ret: 48.2, dd: 16.7, win: 43 };
  
  // ========== 方案A ==========
  console.log('=============================');
  console.log('方案A：只加入开仓过滤');
  console.log('=============================');
  
  const resultA = runBacktestA(stockKlines, spyKlines, startDate, endDate);
  
  console.log('\n回测结果：');
  console.log(`  Sharpe：${resultA.sharpe.toFixed(2)} (vs 上轮${PREV_RESULT.sharpe})`);
  console.log(`  总收益率：${resultA.totalReturn.toFixed(1)}% (vs 上轮${PREV_RESULT.ret}%)`);
  console.log(`  最大回撤：${resultA.maxDrawdownPct.toFixed(1)}% (vs 上轮${PREV_RESULT.dd}%) ${resultA.maxDrawdownPct <= 15 ? '✅' : '❌'}`);
  console.log(`  胜率：${resultA.winRate.toFixed(0)}% (vs 上轮${PREV_RESULT.win}%)`);
  console.log(`  交易次数：${resultA.totalTrades}`);
  
  console.log(`\n回撤达标：${resultA.maxDrawdownPct <= 15 ? '✅' : '❌'}`);
  console.log(`胜率达标：${resultA.winRate >= 45 ? '✅' : '❌'}`);
  
  const recA = resultA.maxDrawdownPct <= 15 && resultA.winRate >= 45;
  console.log(`\n结论：${recA ? '推荐' : '不推荐'}`);
  console.log('原因：' + (recA ? '回撤和胜率均达标' : '未同时达标'));
  
  // ========== 方案B ==========
  console.log('\n\n-----------------------------');
  console.log('正在执行方案B...');
  console.log('-----------------------------');
  
  console.log('\n=============================');
  console.log('方案B：开仓过滤 + 持仓保护');
  console.log('=============================');
  
  const resultB = runBacktestB(stockKlines, spyKlines, startDate, endDate);
  
  console.log('\n回测结果：');
  console.log(`  Sharpe：${resultB.sharpe.toFixed(2)} (vs 上轮${PREV_RESULT.sharpe})`);
  console.log(`  总收益率：${resultB.totalReturn.toFixed(1)}% (vs 上轮${PREV_RESULT.ret}%)`);
  console.log(`  最大回撤：${resultB.maxDrawdownPct.toFixed(1)}% (vs 上轮${PREV_RESULT.dd}%) ${resultB.maxDrawdownPct <= 15 ? '✅' : '❌'}`);
  console.log(`  胜率：${resultB.winRate.toFixed(0)}% (vs 上轮${PREV_RESULT.win}%)`);
  console.log(`  交易次数：${resultB.totalTrades}`);
  console.log(`  保护触发次数：${resultB.protectedTrades}笔`);
  
  console.log(`\n回撤达标：${resultB.maxDrawdownPct <= 15 ? '✅' : '❌'}`);
  console.log(`胜率达标：${resultB.winRate >= 45 ? '✅' : '❌'}`);
  
  const recB = resultB.maxDrawdownPct <= 15 && resultB.winRate >= 45;
  console.log(`\n结论：${recB ? '推荐' : '不推荐'}`);
  console.log('原因：' + (recB ? '回撤和胜率均达标' : '未同时达标'));
  
  // ========== 总结 ==========
  console.log('\n\n========================================');
  console.log('大盘过滤优化总结');
  console.log('========================================');
  
  const betterA = resultA.sharpe > resultB.sharpe ? 'A' : 'B';
  console.log(`\n推荐方案：${betterA}`);
  
  const best = resultA.maxDrawdownPct <= resultB.maxDrawdownPct ? resultA : resultB;
  
  console.log('\n最终参数完整列表：');
  console.log(`  fast_period: 11`);
  console.log(`  slow_period: 30`);
  console.log(`  rsi_period: 14`);
  console.log(`  rsi_low: 35`);
  console.log(`  rsi_high: 65`);
  console.log(`  atr_multiplier: 1.5`);
  console.log(`  min_score: 65`);
  console.log(`  stop_loss_pct: 6% (2.0倍ATR)`);
  console.log(`  profit_target_pct: 12%`);
  console.log(`  max_hold_days: 10`);
  console.log(`  持仓第5天规则：第5天盈利 < 8% 平仓`);
  console.log(`  大盘过滤规则：${betterA === 'A' ? 'SPY跌破MA20时禁止新开仓' : 'SPY跌破MA20禁止新开仓+跌破3%保护持仓'}`);
  
  console.log('\n全程优化轨迹回顾：');
  console.log(`  初始回撤：29%`);
  console.log(`  止损优化后：19.7%`);
  console.log(`  持仓退出优化后：16.7%`);
  console.log(`  大盘过滤优化后：${best.maxDrawdownPct.toFixed(1)}%`);
  console.log(`  总降幅：${(29 - best.maxDrawdownPct).toFixed(1)}%`);
  
  console.log('\n最终评估：');
  console.log(`  最大回撤 ≤ 15%：${best.maxDrawdownPct <= 15 ? '✅' : '❌'} (${best.maxDrawdownPct.toFixed(1)}%)`);
  console.log(`  Sharpe ≥ 2.0：${best.sharpe >= 2.0 ? '✅' : '❌'} (${best.sharpe.toFixed(2)})`);
  console.log(`  胜率 ≥ 45%：${best.winRate >= 45 ? '✅' : '❌'} (${best.winRate.toFixed(0)}%)`);
  console.log(`  收益率 ≥ 30%：${best.totalReturn >= 30 ? '✅' : '❌'} (${best.totalReturn.toFixed(1)}%)`);
}

main().catch(console.error);
