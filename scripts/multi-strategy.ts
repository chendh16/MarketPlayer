/**
 * 多策略回测 - 使用本地K线数据
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

// ==================== 策略1: RSI均值回归 ====================
function rsiStrategy(klines: KLine[], period: number = 14) {
  const signals: number[] = [];
  
  for (let i = period; i < klines.length; i++) {
    const prices = klines.slice(i - period, i + 1).map(k => k.close);
    let gains = 0, losses = 0;
    
    for (let j = 1; j < prices.length; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const rs = gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));
    
    if (rsi < 30) signals.push(1);  // 买入
    else if (rsi > 70) signals.push(-1);  // 卖出
    else signals.push(0);
  }
  
  return signals;
}

// ==================== 策略2: MACD金叉死叉 ====================
function macdStrategy(klines: KLine[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const signals: number[] = new Array(klines.length).fill(0);
  
  // 计算EMA
  const ema = (arr: number[], period: number) => {
    const k = 2 / (period + 1);
    let result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(arr[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };
  
  const closes = klines.map(k => k.close);
  const fastEMA = ema(closes, fast);
  const slowEMA = ema(closes, slow);
  const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
  const signalLine = ema(macdLine, signal);
  
  for (let i = slow + signal; i < klines.length; i++) {
    const prevMacd = macdLine[i - 1] - signalLine[i - 1];
    const currMacd = macdLine[i] - signalLine[i];
    
    if (prevMacd < 0 && currMacd > 0) signals[i] = 1;  // 金叉买入
    else if (prevMacd > 0 && currMacd < 0) signals[i] = -1;  // 死叉卖出
  }
  
  return signals;
}

// ==================== 策略3: 布林带突破 ====================
function bollingerStrategy(klines: KLine[], period: number = 20, stdDev: number = 2) {
  const signals: number[] = new Array(klines.length).fill(0);
  
  for (let i = period; i < klines.length; i++) {
    const slice = klines.slice(i - period, i).map(k => k.close);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = sma + stdDev * std;
    const lower = sma - stdDev * std;
    const current = klines[i].close;
    
    if (current < lower) signals[i] = 1;  // 突破下轨买入
    else if (current > upper) signals[i] = -1;  // 突破上轨卖出
  }
  
  return signals;
}

// ==================== 策略4: 均线交叉 ====================
function maCrossStrategy(klines: KLine[], short: number = 5, long: number = 20) {
  const signals: number[] = new Array(klines.length).fill(0);
  
  for (let i = long; i < klines.length; i++) {
    const shortMA = klines.slice(i - short, i).reduce((a, b) => a + b.close, 0) / short;
    const longMA = klines.slice(i - long, i).reduce((a, b) => a + b.close, 0) / long;
    const prevShort = klines.slice(i - short - 1, i - 1).reduce((a, b) => a + b.close, 0) / short;
    const prevLong = klines.slice(i - long - 1, i - 1).reduce((a, b) => a + b.close, 0) / long;
    
    if (prevShort <= prevLong && shortMA > longMA) signals[i] = 1;  // 金叉买入
    else if (prevShort >= prevLong && shortMA < longMA) signals[i] = -1;  // 死叉卖出
  }
  
  return signals;
}

// ==================== 策略5: 动量策略 ====================
function momentumStrategy(klines: KLine[], period: number = 20) {
  const signals: number[] = new Array(klines.length).fill(0);
  
  for (let i = period; i < klines.length; i++) {
    const current = klines[i].close;
    const past = klines[i - period].close;
    const momentum = (current - past) / past;
    
    if (momentum > 0.05) signals[i] = 1;  // 动量向上 >5%
    else if (momentum < -0.05) signals[i] = -1;  // 动量向下 <-5%
  }
  
  return signals;
}

// ==================== 回测引擎 ====================
function backtest(klines: KLine[], signals: number[], initialCash: number = 100000) {
  let cash = initialCash;
  let shares = 0;
  let trades = 0;
  let wins = 0;
  let buyPrice = 0;
  
  for (let i = 0; i < klines.length; i++) {
    const price = klines[i].close;
    
    // 买入
    if (signals[i] === 1 && shares === 0 && cash > price * 100) {
      shares = 100;
      cash -= price * 100;
      buyPrice = price;
      trades++;
    }
    
    // 卖出
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

// 加载数据
function loadKlines(symbol: string, market: 'us' | 'hk' | 'a'): KLine[] | null {
  const file = path.join(DATA_DIR, `${market}_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return data as KLine[];
}

async function main() {
  console.log('=== 多策略回测对比 ===\n');
  
  const stocks = [
    { symbol: 'AAPL', market: 'us' as const },
    { symbol: 'MSFT', market: 'us' as const },
    { symbol: 'GOOGL', market: 'us' as const },
    { symbol: 'AMZN', market: 'us' as const },
    { symbol: 'META', market: 'us' as const },
    { symbol: 'NVDA', market: 'us' as const },
    { symbol: 'TSLA', market: 'us' as const },
    { symbol: 'AVGO', market: 'us' as const },
    { symbol: 'ORCL', market: 'us' as const },
    { symbol: 'COST', market: 'us' as const },
    { symbol: 'HD', market: 'us' as const },
    { symbol: 'MRK', market: 'us' as const },
    { symbol: 'LLY', market: 'us' as const },
    { symbol: 'JPM', market: 'us' as const },
    { symbol: 'UNH', market: 'us' as const },
    { symbol: 'V', market: 'us' as const },
    { symbol: 'MA', market: 'us' as const },
    { symbol: 'JNJ', market: 'us' as const },
    { symbol: 'WMT', market: 'us' as const },
    { symbol: 'PG', market: 'us' as const },
    { symbol: 'ABBV', market: 'us' as const },
    { symbol: 'ACN', market: 'us' as const },
    { symbol: 'ADBE', market: 'us' as const },
    { symbol: 'CRM', market: 'us' as const },
    { symbol: 'NFLX', market: 'us' as const },
    { symbol: 'AMD', market: 'us' as const },
    { symbol: 'INTC', market: 'us' as const },
    { symbol: 'QCOM', market: 'us' as const },
    { symbol: 'TXN', market: 'us' as const },
    { symbol: 'AMAT', market: 'us' as const },
    { symbol: 'MU', market: 'us' as const },
    { symbol: 'NOW', market: 'us' as const },
    { symbol: 'SNOW', market: 'us' as const },
    { symbol: 'UBER', market: 'us' as const },
    { symbol: 'ABNB', market: 'us' as const },
    { symbol: 'SHOP', market: 'us' as const },
    { symbol: 'COIN', market: 'us' as const },
    { symbol: 'MSTR', market: 'us' as const },
    { symbol: 'PLTR', market: 'us' as const },
    { symbol: 'NET', market: 'us' as const },
    { symbol: 'DDOG', market: 'us' as const },
    { symbol: 'CRWD', market: 'us' as const },
    { symbol: 'ZS', market: 'us' as const },
    { symbol: 'PANW', market: 'us' as const },
    { symbol: 'FTNT', market: 'us' as const },
    { symbol: 'TEAM', market: 'us' as const },
    { symbol: 'DOCU', market: 'us' as const },
    { symbol: 'ZM', market: 'us' as const },
    { symbol: 'ROKU', market: 'us' as const },
  ];
  
  const strategies = [
    { name: 'RSI均值回归', fn: rsiStrategy },
    { name: 'MACD金叉死叉', fn: macdStrategy },
    { name: '布林带突破', fn: bollingerStrategy },
    { name: '均线交叉(5/20)', fn: maCrossStrategy },
    { name: '动量策略', fn: momentumStrategy },
  ];
  
  // 存储每个策略的结果
  const results: { [key: string]: number } = {};
  
  for (const strat of strategies) {
    let totalReturn = 0;
    let totalTrades = 0;
    let totalWins = 0;
    
    console.log(`📊 ${strat.name}:`);
    
    for (const stock of stocks) {
      const klines = loadKlines(stock.symbol, stock.market);
      if (!klines || klines.length < 100) continue;
      
      const signals = strat.fn(klines);
      const result = backtest(klines, signals);
      
      totalReturn += result.totalReturn;
      totalTrades += result.trades;
      totalWins += Math.floor(result.winRate * result.trades / 100);
      
      const emoji = result.totalReturn > 0 ? '🟢' : '🔴';
      console.log(`  ${stock.symbol}: ${emoji}${result.totalReturn.toFixed(1)}%`);
    }
    
    results[strat.name] = totalReturn;
    const avgWinRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
    console.log(`  平均收益: ${totalReturn.toFixed(1)}% | 平均胜率: ${avgWinRate.toFixed(0)}%\n`);
  }
  
  // 总结
  console.log('=== 策略排名 ===');
  const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([name, ret], i) => {
    console.log(`${i + 1}. ${name}: ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`);
  });
  
  // 保存
  fs.writeFileSync(
    '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/multi-strategy-result.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2)
  );
  console.log('\n✅ 结果已保存');
}

main();
