/**
 * 全量短线策略集
 * 包含: 布林带、MACD、均线、动量、RSI + 新增策略
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

// ==================== 策略1: 布林带突破 ====================
function bollingerSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const slice = klines.slice(i - 20, i).map(k => k.close);
    const sma = slice.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20);
    if (klines[i].close < sma - 2 * std) signals[i] = 1;
    if (klines[i].close > sma + 2 * std) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略2: MACD金叉死叉 ====================
function macdSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    let r = [arr[0]];
    for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i - 1] * (1 - k));
    return r;
  };
  const closes = klines.map(k => k.close);
  for (let i = 35; i < klines.length; i++) {
    const fast = ema(closes.slice(0, i + 1), 12);
    const slow = ema(closes.slice(0, i + 1), 26);
    const prevFast = ema(closes.slice(0, i), 12);
    const prevSlow = ema(closes.slice(0, i), 26);
    const macd = fast[fast.length - 1] - slow[slow.length - 1];
    const prevMacd = prevFast[prevFast.length - 1] - prevSlow[prevSlow.length - 1];
    if (prevMacd < 0 && macd > 0) signals[i] = 1;
    if (prevMacd > 0 && macd < 0) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略3: 均线交叉 ====================
function maCrossSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const ma5 = klines.slice(i - 4, i + 1).reduce((a, b) => a + b.close, 0) / 5;
    const ma20 = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.close, 0) / 20;
    const pma5 = klines.slice(i - 5, i).reduce((a, b) => a + b.close, 0) / 5;
    const pma20 = klines.slice(i - 20, i).reduce((a, b) => a + b.close, 0) / 20;
    if (pma5 <= pma20 && ma5 > ma20) signals[i] = 1;
    if (pma5 >= pma20 && ma5 < ma20) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略4: 动量策略 ====================
function momentumSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const mom = (klines[i].close - klines[i - 20].close) / klines[i - 20].close;
    if (mom > 0.05) signals[i] = 1;
    if (mom < -0.05) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略5: RSI ====================
function rsiSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 14; i < klines.length; i++) {
    const prices = klines.slice(i - 13, i + 1).map(k => k.close);
    let gains = 0, losses = 0;
    for (let j = 1; j < prices.length; j++) {
      const ch = prices[j] - prices[j - 1];
      if (ch > 0) gains += ch;
      else losses -= ch;
    }
    const rsi = 100 - (100 / (1 + gains / (losses || 1)));
    if (rsi < 30) signals[i] = 1;
    if (rsi > 70) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略6: Parabolic SAR ====================
function parabolicSARSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    // 简化版SAR: 连续上涨后转跌卖出，连续下跌后转涨买入
    const trend = klines[i].close > klines[i - 1].close;
    const prevTrend = klines[i - 1].close > klines[i - 2].close;
    if (!prevTrend && trend) signals[i] = 1;  // 转多
    if (prevTrend && !trend) signals[i] = -1; // 转空
  }
  return signals;
}

// ==================== 策略7: Awesome Oscillator ====================
function awesomeOscillatorSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 34; i < klines.length; i++) {
    const median5 = klines.slice(i - 4, i + 1).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 5;
    const median34 = klines.slice(i - 33, i + 1).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 34;
    const prevMedian5 = klines.slice(i - 5, i).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 5;
    const prevMedian34 = klines.slice(i - 34, i).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 34;
    const ao = median34 - median34;
    const prevAo = prevMedian5 - prevMedian34;
    if (prevAo < 0 && ao > 0) signals[i] = 1;
    if (prevAo > 0 && ao < 0) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略8: 成交量突破 ====================
function volumeBreakoutSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const avgVol = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.volume, 0) / 20;
    const vol = klines[i].volume;
    const priceChange = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
    if (vol > avgVol * 1.5 && priceChange > 0.02) signals[i] = 1;
    if (vol > avgVol * 1.5 && priceChange < -0.02) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略9: 威廉指标 ====================
function williamsRSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 14; i < klines.length; i++) {
    const highs = klines.slice(i - 13, i + 1).map(k => k.high);
    const lows = klines.slice(i - 13, i + 1).map(k => k.low);
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const wr = -100 * (highest - klines[i].close) / (highest - lowest || 1);
    if (wr < -80) signals[i] = 1;
    if (wr > -20) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略10: CCI顺势指标 ====================
function cciSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const tp = klines.slice(i - 19, i + 1).map(k => (k.high + k.low + k.close) / 3);
    const sma = tp.reduce((a, b) => a + b, 0) / 20;
    const meanDev = tp.reduce((a, b) => a + Math.abs(b - sma), 0) / 20;
    const cci = (tp[tp.length - 1] - sma) / (meanDev * 0.015);
    if (cci < -100) signals[i] = 1;
    if (cci > 100) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略11: 价量关系 ====================
function priceVolumeSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const priceUp = klines[i].close > klines[i - 1].close;
    const avgVol = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.volume, 0) / 20;
    const volUp = klines[i].volume > avgVol;
    if (priceUp && volUp) signals[i] = 1;
    if (!priceUp && volUp) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略12: 支撑阻力突破 ====================
function supportResistanceSignals(klines: KLine[]): number[] {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 30; i < klines.length; i++) {
    const highs = klines.slice(i - 29, i + 1).map(k => k.high);
    const resistance = Math.max(...highs.slice(0, 20));
    const support = Math.min(...highs.slice(10));
    if (klines[i].close > resistance * 0.99) signals[i] = 1;
    if (klines[i].close < support * 1.01) signals[i] = -1;
  }
  return signals;
}

// ==================== 综合评分 ====================
function calcAllStrategies(symbol: string, klines: KLine[]): any {
  const strategies = [
    { name: '布林带', fn: bollingerSignals },
    { name: 'MACD', fn: macdSignals },
    { name: '均线交叉', fn: maCrossSignals },
    { name: '动量', fn: momentumSignals },
    { name: 'RSI', fn: rsiSignals },
    { name: 'SAR', fn: parabolicSARSignals },
    { name: 'AO', fn: awesomeOscillatorSignals },
    { name: '成交量', fn: volumeBreakoutSignals },
    { name: '威廉%R', fn: williamsRSignals },
    { name: 'CCI', fn: cciSignals },
    { name: '价量', fn: priceVolumeSignals },
    { name: '支撑阻力', fn: supportResistanceSignals },
  ];
  
  let result: any = { symbol, signals: {} };
  let buyCount = 0, sellCount = 0;
  
  const lastIdx = klines.length - 1;
  
  for (const strat of strategies) {
    const signals = strat.fn(klines);
    const sig = signals[lastIdx];
    result.signals[strat.name] = sig;
    if (sig === 1) buyCount++;
    if (sig === -1) sellCount++;
  }
  
  result.totalBuy = buyCount;
  result.totalSell = sellCount;
  result.action = buyCount > sellCount ? '🟢买入' : sellCount > buyCount ? '🔴卖出' : '⚪观望';
  
  return result;
}

function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function testAllStrategies() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'AVGO'];
  
  console.log('=== 12个短线策略测试 ===\n');
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) continue;
    
    const result = calcAllStrategies(symbol, klines);
    
    console.log(`${symbol}: ${result.action} (买${result.totalBuy} 卖${result.totalSell})`);
    
    const buyStrs = Object.entries(result.signals)
      .filter(([_, v]) => v === 1).map(([k]) => k);
    const sellStrs = Object.entries(result.signals)
      .filter(([_, v]) => v === -1).map(([k]) => k);
    
    if (buyStrs.length > 0) console.log(`  买入: ${buyStrs.join(', ')}`);
    if (sellStrs.length > 0) console.log(`  卖出: ${sellStrs.join(', ')}`);
    console.log('');
  }
}

testAllStrategies();
