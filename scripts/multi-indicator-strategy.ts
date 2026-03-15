/**
 * 多指标综合评分策略回测
 * 参考: 75分开单系统
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

// ==================== 计算各指标分数 ====================

function calcMAScore(klines: KLine[], idx: number): number {
  if (idx < 10) return 0;
  const price = klines[idx].close;
  const ma5 = klines.slice(idx - 4, idx + 1).reduce((a, b) => a + b.close, 0) / 5;
  const ma10 = klines.slice(idx - 9, idx + 1).reduce((a, b) => a + b.close, 0) / 10;
  
  if (price > ma5 && ma5 > ma10) return 30;  // 多头排列
  if (price < ma5 && ma5 < ma10) return -30; // 空头排列
  return 0;
}

function calcRSIScore(klines: KLine[], idx: number, period: number = 14): number {
  if (idx < period) return 0;
  const prices = klines.slice(idx - period, idx + 1).map(k => k.close);
  let gains = 0, losses = 0;
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = gains / (losses || 1);
  const rsi = 100 - (100 / (1 + rs));
  
  if (rsi < 30) return 25;  // 超卖买入
  if (rsi > 70) return -25; // 超买卖出
  return 0;
}

function calcMACDScore(klines: KLine[], idx: number): number {
  if (idx < 26) return 0;
  
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    let result = [arr[0]];
    for (let i = 1; i < arr.length; i++) result.push(arr[i] * k + result[i - 1] * (1 - k));
    return result;
  };
  
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = fast[fast.length - 1] - slow[slow.length - 1];
  
  if (macd > 0) return 10;
  if (macd < 0) return -10;
  return 0;
}

function calcKDJScore(klines: KLine[], idx: number): number {
  if (idx < 9) return 0;
  const period = 9;
  const highs = klines.slice(idx - period + 1, idx + 1).map(k => k.high);
  const lows = klines.slice(idx - period + 1, idx + 1).map(k => k.low);
  const close = klines[idx].close;
  
  const highest = Math.max(...highs);
  const lowest = Math.min(...lows);
  const rsv = (close - lowest) / (highest - lowest || 1) * 100;
  const k = rsv;
  const j = 3 * k - 100; // 简化J线
  
  if (j < 20) return 15;  // 超卖买入
  if (j > 80) return -15; // 超买卖出
  return 0;
}

function calcBollingerScore(klines: KLine[], idx: number, period: number = 20): number {
  if (idx < period) return 0;
  const slice = klines.slice(idx - period, idx).map(k => k.close);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period);
  
  const upper = sma + 2 * std;
  const lower = sma - 2 * std;
  const price = klines[idx].close;
  
  const bbPos = (price - lower) / (upper - lower || 1);
  
  if (bbPos < 0.15) return 20; // 接近下轨，超卖
  if (bbPos > 0.85) return -20; // 接近上轨，超买
  return 0;
}

function calcVolumeScore(klines: KLine[], idx: number): number {
  if (idx < 20) return 0;
  const vol = klines[idx].volume;
  const avgVol = klines.slice(idx - 19, idx + 1).reduce((a, b) => a + b.volume, 0) / 20;
  
  if (vol > avgVol * 1.5) return 10; // 放量
  return 0;
}

// ==================== 综合评分 ====================

function calcScore(klines: KLine[], idx: number): { long: number; short: number } {
  let long = 0;
  let short = 0;
  
  long += calcMAScore(klines, idx);
  short -= calcMAScore(klines, idx);
  
  long += calcRSIScore(klines, idx);
  short -= calcRSIScore(klines, idx);
  
  long += calcMACDScore(klines, idx);
  short -= calcMACDScore(klines, idx);
  
  long += calcKDJScore(klines, idx);
  short -= calcKDJScore(klines, idx);
  
  long += calcBollingerScore(klines, idx);
  short -= calcBollingerScore(klines, idx);
  
  long += calcVolumeScore(klines, idx);
  short += calcVolumeScore(klines, idx);
  
  return { long, short };
}

// 生成信号
function multiIndicatorSignals(klines: KLine[], threshold: number = 35) {
  const signals: number[] = new Array(klines.length).fill(0);
  
  for (let i = 30; i < klines.length; i++) {
    const { long, short } = calcScore(klines, i);
    
    if (long >= threshold) signals[i] = 1;  // 买入
    else if (short >= threshold) signals[i] = -1; // 卖出
  }
  
  return signals;
}

// ==================== 回测 ====================

function backtest(klines: KLine[], signals: number[], initialCash: number = 100000) {
  let cash = initialCash;
  let shares = 0;
  let trades = 0;
  let wins = 0;
  let buyPrice = 0;
  
  for (let i = 0; i < klines.length; i++) {
    const price = klines[i].close;
    
    if (signals[i] === 1 && shares === 0 && cash > price * 100) {
      shares = 100;
      cash -= price * 100;
      buyPrice = price;
      trades++;
    }
    
    if ((signals[i] === -1 || i === klines.length - 1) && shares > 0) {
      const profit = (price - buyPrice) * 100;
      if (profit > 0) wins++;
      cash += price * 100;
      shares = 0;
      trades++;
    }
  }
  
  const totalReturn = ((cash - initialCash) / initialCash) * 100;
  const winRate = trades > 0 ? (wins / (trades / 2)) * 100 : 0;
  
  return { totalReturn, trades: Math.floor(trades / 2), winRate, finalValue: cash };
}

function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function main() {
  console.log('=== 多指标综合评分策略 (75分系统) ===\n');
  
  const stocks = [
    'META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'MSTR', 'AVGO', 'COST',
    'GOOGL', 'AMZN', 'MSFT', 'JPM', 'LLY', 'CRM', 'NET', 'PLTR'
  ];
  
  let totalReturn = 0;
  let totalTrades = 0;
  let totalWins = 0;
  
  console.log('📊 综合评分策略:');
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines || klines.length < 100) continue;
    
    const signals = multiIndicatorSignals(klines);
    const result = backtest(klines, signals);
    
    totalReturn += result.totalReturn;
    totalTrades += result.trades;
    totalWins += Math.floor(result.winRate * result.trades / 100);
    
    const emoji = result.totalReturn > 0 ? '🟢' : '🔴';
    console.log(`  ${symbol}: ${emoji}${result.totalReturn.toFixed(1)}% | ${result.trades}笔 | 胜率${result.winRate.toFixed(0)}%`);
  }
  
  const avgWinRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
  
  console.log(`\n📈 平均收益: ${totalReturn.toFixed(1)}%`);
  console.log(`📊 平均胜率: ${avgWinRate.toFixed(0)}%`);
  
  // 保存
  fs.writeFileSync(
    '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/multi-indicator-result.json',
    JSON.stringify({ date: new Date().toISOString(), totalReturn, avgWinRate }, null, 2)
  );
}

main();
