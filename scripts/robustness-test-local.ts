/**
 * 短线策略稳健性测试 - 本地缓存数据版本
 * 参数: fast_period=10, slow_period=30, rsi_period=14, rsi_low=35, rsi_high=65, atr_multiplier=1.5, min_score=40, stop_loss_pct=5%, profit_target_pct=18%, max_hold_days=10
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

// 优化后的参数
const OPTIMIZED_PARAMS = {
  fast_period: 10,
  slow_period: 30,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 65,
  atr_multiplier: 1.5,
  min_score: 40,
  stop_loss_pct: 0.05,
  profit_target_pct: 0.18,
  max_hold_days: 10,
};

function loadCache(symbol: string): KLine[] {
  const filePath = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data: CacheData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data.klines || [];
}

function filterByDateRange(klines: KLine[], startDate: string, endDate: string): KLine[] {
  return klines.filter(k => k.date >= startDate && k.date <= endDate);
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
}

async function backtestStock(symbol: string, kl: KLine[]): Promise<Trade[]> {
  if (kl.length < 60) return [];
  
  const closes = kl.map(k => k.close);
  const vols = kl.map(k => k.volume);
  const highs = kl.map(k => k.high);
  const lows = kl.map(k => k.low);
  
  const trades: Trade[] = [];
  let pos: { p: number; d: string; i: number; reasons: string[]; s: number; atr: number } | null = null;
  
  for (let i = 30; i < kl.length - OPTIMIZED_PARAMS.max_hold_days; i++) {
    const date = kl[i].date;
    const price = closes[i];
    const vol = vols[i];
    
    const maF = calcMA(closes.slice(0,i+1), OPTIMIZED_PARAMS.fast_period);
    const maS = calcMA(closes.slice(0,i+1), OPTIMIZED_PARAMS.slow_period);
    const rsi = calcRSI(closes.slice(0,i+1), OPTIMIZED_PARAMS.rsi_period);
    const vMA = calcMA(vols.slice(0,i+1), 20);
    const vR = vol / (vMA||1);
    const h20 = Math.max(...highs.slice(i-20,i));
    const l20 = Math.min(...lows.slice(i-20,i));
    const atr = calcATR(kl.slice(0,i+1));
    
    let score = 0;
    const reasons: string[] = [];
    
    // 信号计算
    if (price > h20*0.98 && vR > 1.5) { score += 25; reasons.push('突破'); }
    if (maF > maS) { score += 15; reasons.push('多头'); }
    if (rsi < OPTIMIZED_PARAMS.rsi_low + 10) { score += 15; reasons.push('RSI'+rsi.toFixed(0)); }
    if (price < l20*1.02 && price > l20*0.98) { score += 15; reasons.push('支撑'); }
    if (i>=3 && vols[i]>vols[i-1] && vols[i-1]>vols[i-2]) { score += 10; reasons.push('放量'); }
    
    // 买入信号
    if (!pos && score >= OPTIMIZED_PARAMS.min_score && reasons.length >= 2) {
      pos = { p: price, d: date, i: i, reasons, s: score, atr };
      continue;
    }
    
    // 卖出信号
    if (pos) {
      const days = i - pos.i;
      const pnlPct = (price - pos.p) / pos.p * 100;
      const stopP = Math.max(pos.p*(1-OPTIMIZED_PARAMS.atr_multiplier*pos.atr/pos.p), pos.p*(1-OPTIMIZED_PARAMS.stop_loss_pct));
      const targetP = pos.p * (1 + OPTIMIZED_PARAMS.profit_target_pct);
      
      if (price >= targetP || price <= stopP || days >= OPTIMIZED_PARAMS.max_hold_days) {
        trades.push({
          date: pos.d, symbol, entryPrice: pos.p, exitPrice: price, holdDays: days,
          pnl: (price-pos.p)*100, pnlPct, reasons: pos.reasons, score: pos.s
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
}

function runBacktest(trades: Trade[]): BacktestResult {
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
  
  return {
    trades,
    totalReturn: totRet,
    sharpe: Math.abs(sharpe)>20?0:sharpe,
    maxDrawdownPct: Math.min(dd,50),
    winRate,
    totalTrades: n,
    winningTrades: wins,
    losingTrades: n-wins
  };
}

// 主测试函数
async function runRobustnessTest() {
  console.log('=== 短线策略稳健性测试 (本地缓存) ===\n');
  console.log('优化参数:');
  console.log(OPTIMIZED_PARAMS);
  console.log('\n基准: Sharpe=4.10, 总收益率=8.38%, 最大回撤=3.22%, 胜率=50%, 交易次数=14\n');
  console.log('数据范围: 2025-07 至 2026-03\n');
  
  const baseSymbols = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];
  const expandedSymbols = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'JNJ', 'WMT', 'DIS', 'NFLX', 'AMD', 'QCOM', 'INTC'];
  
  // 加载所有股票数据
  const cacheData = new Map<string, KLine[]>();
  for (const sym of expandedSymbols) {
    const data = loadCache(sym);
    if (data.length > 0) {
      cacheData.set(sym, data);
      console.log(`加载 ${sym}: ${data.length} 条数据`);
    }
  }
  
  // 第1轮: 6个月前 (2025年9月-12月)
  console.log('\n=== 验证第1轮 ===');
  console.log('测试条件: 6个月前的时间段 (2025.9-2025.12)');
  console.log('股票池: ' + baseSymbols.filter(s => cacheData.has(s)).join(', '));
  
  const period1Trades: Trade[] = [];
  for (const sym of baseSymbols) {
    const kl = cacheData.get(sym);
    if (kl) {
      const filtered = filterByDateRange(kl, '2025-09-01', '2025-12-31');
      if (filtered.length > 60) {
        const trades = await backtestStock(sym, filtered);
        period1Trades.push(...trades);
      }
    }
  }
  period1Trades.sort((a,b) => a.date.localeCompare(b.date));
  const result1 = runBacktest(period1Trades);
  
  console.log('\n回测结果:');
  console.log(`  Sharpe: ${result1.sharpe.toFixed(2)} (基准4.10, 差异${result1.totalTrades > 0 ? ((result1.sharpe-4.10)/4.10*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  总收益率: ${result1.totalReturn.toFixed(2)}% (基准8.38%)`);
  console.log(`  最大回撤: ${result1.maxDrawdownPct.toFixed(2)}% (基准3.22%)`);
  console.log(`  胜率: ${result1.winRate.toFixed(1)}% (基准50%)`);
  console.log(`  交易次数: ${result1.totalTrades} (基准14)`);
  console.log('\n买卖明细:');
  if (result1.trades.length === 0) {
    console.log('  (该时间段内无交易信号)');
  } else {
    result1.trades.forEach(t => {
      console.log(`  ${t.date} ${t.symbol}: 买入${t.entryPrice.toFixed(2)} -> 卖出${t.exitPrice.toFixed(2)}, 持仓${t.holdDays}天, ${t.pnlPct>0?'盈利':'亏损'}${Math.abs(t.pnlPct).toFixed(1)}%`);
    });
  }
  
  // 稳健性判断
  const r1 = result1;
  const isStable1 = r1.totalTrades > 0 && r1.sharpe >= 1.5 && r1.maxDrawdownPct <= 15 && r1.winRate >= 40;
  const isWarning1 = r1.totalTrades > 0 && (r1.sharpe >= 1.0 && r1.sharpe < 1.5 || r1.maxDrawdownPct > 15 && r1.maxDrawdownPct <= 25 || r1.winRate >= 35 && r1.winRate < 40);
  const isFail1 = r1.totalTrades === 0 || r1.sharpe < 1.0 || r1.maxDrawdownPct > 25 || r1.winRate < 35 || r1.totalReturn < 0;
  
  console.log(`\n稳健性判断: ${isStable1 ? '稳健' : isWarning1 ? '警告' : '失效'}`);
  console.log(`判断理由: ${isStable1 ? 'Sharpe≥1.5, 回撤≤15%, 胜率≥40%' : isWarning1 ? '介于稳健和失效之间' : '未达到稳健标准'}`);
  
  // 第2轮: 3个月前 (2025年12月-2026年3月) - 用最近数据模拟
  console.log('\n\n=== 验证第2轮 ===');
  console.log('测试条件: 3个月前的时间段 (2025.12-2026.3) - 实际最近数据');
  console.log('股票池: ' + baseSymbols.filter(s => cacheData.has(s)).join(', '));
  
  const period2Trades: Trade[] = [];
  for (const sym of baseSymbols) {
    const kl = cacheData.get(sym);
    if (kl) {
      const filtered = filterByDateRange(kl, '2025-12-01', '2026-03-20');
      if (filtered.length > 60) {
        const trades = await backtestStock(sym, filtered);
        period2Trades.push(...trades);
      }
    }
  }
  period2Trades.sort((a,b) => a.date.localeCompare(b.date));
  const result2 = runBacktest(period2Trades);
  
  console.log('\n回测结果:');
  console.log(`  Sharpe: ${result2.sharpe.toFixed(2)} (基准4.10, 差异${result2.totalTrades > 0 ? ((result2.sharpe-4.10)/4.10*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  总收益率: ${result2.totalReturn.toFixed(2)}% (基准8.38%)`);
  console.log(`  最大回撤: ${result2.maxDrawdownPct.toFixed(2)}% (基准3.22%)`);
  console.log(`  胜率: ${result2.winRate.toFixed(1)}% (基准50%)`);
  console.log(`  交易次数: ${result2.totalTrades} (基准14)`);
  console.log('\n买卖明细:');
  if (result2.trades.length === 0) {
    console.log('  (该时间段内无交易信号)');
  } else {
    result2.trades.forEach(t => {
      console.log(`  ${t.date} ${t.symbol}: 买入${t.entryPrice.toFixed(2)} -> 卖出${t.exitPrice.toFixed(2)}, 持仓${t.holdDays}天, ${t.pnlPct>0?'盈利':'亏损'}${Math.abs(t.pnlPct).toFixed(1)}%`);
    });
  }
  
  const r2 = result2;
  const isStable2 = r2.totalTrades > 0 && r2.sharpe >= 1.5 && r2.maxDrawdownPct <= 15 && r2.winRate >= 40;
  const isWarning2 = r2.totalTrades > 0 && (r2.sharpe >= 1.0 && r2.sharpe < 1.5 || r2.maxDrawdownPct > 15 && r2.maxDrawdownPct <= 25 || r2.winRate >= 35 && r2.winRate < 40);
  const isFail2 = r2.totalTrades === 0 || r2.sharpe < 1.0 || r2.maxDrawdownPct > 25 || r2.winRate < 35 || r2.totalReturn < 0;
  
  console.log(`\n稳健性判断: ${isStable2 ? '稳健' : isWarning2 ? '警告' : '失效'}`);
  console.log(`判断理由: ${isStable2 ? 'Sharpe≥1.5, 回撤≤15%, 胜率≥40%' : isWarning2 ? '介于稳健和失效之间' : '未达到稳健标准'}`);
  
  // 第3轮: 扩大股票池 (2025年12月-2026年3月)
  console.log('\n\n=== 验证第3轮 ===');
  console.log('测试条件: 最近3个月 (2025.12-2026.3)');
  console.log('股票池: ' + expandedSymbols.filter(s => cacheData.has(s)).join(', '));
  
  const period3Trades: Trade[] = [];
  for (const sym of expandedSymbols) {
    const kl = cacheData.get(sym);
    if (kl) {
      const filtered = filterByDateRange(kl, '2025-12-01', '2026-03-20');
      if (filtered.length > 60) {
        const trades = await backtestStock(sym, filtered);
        period3Trades.push(...trades);
      }
    }
  }
  period3Trades.sort((a,b) => a.date.localeCompare(b.date));
  const result3 = runBacktest(period3Trades);
  
  console.log('\n回测结果:');
  console.log(`  Sharpe: ${result3.sharpe.toFixed(2)} (基准4.10, 差异${result3.totalTrades > 0 ? ((result3.sharpe-4.10)/4.10*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  总收益率: ${result3.totalReturn.toFixed(2)}% (基准8.38%)`);
  console.log(`  最大回撤: ${result3.maxDrawdownPct.toFixed(2)}% (基准3.22%)`);
  console.log(`  胜率: ${result3.winRate.toFixed(1)}% (基准50%)`);
  console.log(`  交易次数: ${result3.totalTrades} (基准14)`);
  console.log('\n买卖明细:');
  if (result3.trades.length === 0) {
    console.log('  (该时间段内无交易信号)');
  } else {
    result3.trades.forEach(t => {
      console.log(`  ${t.date} ${t.symbol}: 买入${t.entryPrice.toFixed(2)} -> 卖出${t.exitPrice.toFixed(2)}, 持仓${t.holdDays}天, ${t.pnlPct>0?'盈利':'亏损'}${Math.abs(t.pnlPct).toFixed(1)}%`);
    });
  }
  
  const r3 = result3;
  const isStable3 = r3.totalTrades > 0 && r3.sharpe >= 1.5 && r3.maxDrawdownPct <= 15 && r3.winRate >= 40;
  const isWarning3 = r3.totalTrades > 0 && (r3.sharpe >= 1.0 && r3.sharpe < 1.5 || r3.maxDrawdownPct > 15 && r3.maxDrawdownPct <= 25 || r3.winRate >= 35 && r3.winRate < 40);
  const isFail3 = r3.totalTrades === 0 || r3.sharpe < 1.0 || r3.maxDrawdownPct > 25 || r3.winRate < 35 || r3.totalReturn < 0;
  
  console.log(`\n稳健性判断: ${isStable3 ? '稳健' : isWarning3 ? '警告' : '失效'}`);
  console.log(`判断理由: ${isStable3 ? 'Sharpe≥1.5, 回撤≤15%, 胜率≥40%' : isWarning3 ? '介于稳健和失效之间' : '未达到稳健标准'}`);
  
  // 第4轮: 早期数据 (2025年7月-9月) - 使用更早期数据
  console.log('\n\n=== 验证第4轮 ===');
  console.log('测试条件: 早期时间段 (2025.7-2025.9)');
  console.log('股票池: ' + baseSymbols.filter(s => cacheData.has(s)).join(', '));
  
  const period4Trades: Trade[] = [];
  for (const sym of baseSymbols) {
    const kl = cacheData.get(sym);
    if (kl) {
      const filtered = filterByDateRange(kl, '2025-07-01', '2025-09-30');
      if (filtered.length > 60) {
        const trades = await backtestStock(sym, filtered);
        period4Trades.push(...trades);
      }
    }
  }
  period4Trades.sort((a,b) => a.date.localeCompare(b.date));
  const result4 = runBacktest(period4Trades);
  
  console.log('\n回测结果:');
  console.log(`  Sharpe: ${result4.sharpe.toFixed(2)} (基准4.10)`);
  console.log(`  总收益率: ${result4.totalReturn.toFixed(2)}% (基准8.38%)`);
  console.log(`  最大回撤: ${result4.maxDrawdownPct.toFixed(2)}% (基准3.22%)`);
  console.log(`  胜率: ${result4.winRate.toFixed(1)}% (基准50%)`);
  console.log(`  交易次数: ${result4.totalTrades} (基准14)`);
  console.log('\n买卖明细:');
  if (result4.trades.length === 0) {
    console.log('  (该时间段内无交易信号)');
  } else {
    result4.trades.forEach(t => {
      console.log(`  ${t.date} ${t.symbol}: 买入${t.entryPrice.toFixed(2)} -> 卖出${t.exitPrice.toFixed(2)}, 持仓${t.holdDays}天, ${t.pnlPct>0?'盈利':'亏损'}${Math.abs(t.pnlPct).toFixed(1)}%`);
    });
  }
  
  const r4 = result4;
  const isStable4 = r4.totalTrades > 0 && r4.sharpe >= 1.5 && r4.maxDrawdownPct <= 15 && r4.winRate >= 40;
  const isWarning4 = r4.totalTrades > 0 && (r4.sharpe >= 1.0 && r4.sharpe < 1.5 || r4.maxDrawdownPct > 15 && r4.maxDrawdownPct <= 25 || r4.winRate >= 35 && r4.winRate < 40);
  const isFail4 = r4.totalTrades === 0 || r4.sharpe < 1.0 || r4.maxDrawdownPct > 25 || r4.winRate < 35 || r4.totalReturn < 0;
  
  console.log(`\n稳健性判断: ${isStable4 ? '稳健' : isWarning4 ? '警告' : isFail4 ? '失效' : '无交易'}`);
  console.log(`判断理由: ${isStable4 ? 'Sharpe≥1.5, 回撤≤15%, 胜率≥40%' : isWarning4 ? '介于稳健和失效之间' : '未达到稳健标准'}`);
  
  // 总结报告
  console.log('\n\n========================================');
  console.log('=== 稳健性测试总结 ===');
  console.log('========================================\n');
  
  const result1Status = isStable1 ? '稳健' : isWarning1 ? '警告' : '失效';
  const result2Status = isStable2 ? '稳健' : isWarning2 ? '警告' : '失效';
  const result3Status = isStable3 ? '稳健' : isWarning3 ? '警告' : '失效';
  const result4Status = isStable4 ? '稳健' : isWarning4 ? '警告' : isFail4 ? '失效' : '无交易';
  
  console.log('各轮结果:');
  console.log(`- 第1轮（换时间段6个月前2025.9-12）: ${result1Status}`);
  console.log(`- 第2轮（再换时间段2025.12-2026.3）: ${result2Status}`);
  console.log(`- 第3轮（扩大股票池）: ${result3Status}`);
  console.log(`- 第4轮（早期数据2025.7-9）: ${result4Status}`);
  
  const stableCount = [isStable1, isStable2, isStable3, isStable4].filter(Boolean).length;
  const warningCount = [isWarning1, isWarning2, isWarning3, isWarning4].filter(Boolean).length;
  const failCount = [isFail1, isFail2, isFail3, isFail4].filter(Boolean).length;
  
  console.log('\n综合结论:');
  if (stableCount === 4) {
    console.log('✅ 4轮全部稳健 → 参数可信，建议进入模拟盘测试');
  } else if (stableCount >= 3) {
    console.log('⚠️ 3轮稳健1轮警告 → 参数基本可用，注意警告轮的市场环境');
  } else {
    console.log('❌ 出现失效 → 参数可能过拟合，需要分析具体原因');
  }
  
  console.log('\n过拟合风险评估:');
  const validResults = [result1, result2, result3, result4].filter(r => r.totalTrades > 0);
  if (validResults.length > 0) {
    const worstRound = validResults.indexOf(validResults.reduce((a, b) => a.sharpe < b.sharpe ? a : b)) + 1;
    console.log(`- 表现最差的轮次: 第${worstRound}轮`);
    console.log(`- Sharpe最低: ${Math.min(...validResults.map(r => r.sharpe)).toFixed(2)}`);
    console.log(`- 收益率最低: ${Math.min(...validResults.map(r => r.totalReturn)).toFixed(2)}%`);
  }
  
  console.log('\n实盘建议:');
  if (stableCount >= 3) {
    console.log('✅ 建议交易，但需持续监控策略表现');
  } else {
    console.log('⚠️ 需要进一步分析，可能需要调整参数');
  }
}

runRobustnessTest().catch(console.error);
