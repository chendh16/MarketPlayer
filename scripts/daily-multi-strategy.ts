/**
 * 每日多策略信号推送
 * 包含: 布林带、MACD、均线交叉、动量、多指标综合
 */

import * as fs from 'fs';
import * as path from 'path';
import { sendMessageToUser } from '../src/services/feishu/bot';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==================== 策略1: 布林带 ====================
function bollingerSignals(klines: KLine[]) {
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

// ==================== 策略2: MACD ====================
function macdSignals(klines: KLine[]) {
  const signals: number[] = new Array(klines.length).fill(0);
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    let r = [arr[0]];
    for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i - 1] * (1 - k));
    return r;
  };
  const closes = klines.map(k => k.close);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  for (let i = 35; i < klines.length; i++) {
    const prev = (fast[i - 1] - slow[i - 1]) - ema(closes.slice(0, i), 9)[i - 1];
    const curr = (fast[i] - slow[i]) - ema(closes.slice(0, i + 1), 9)[i];
    if (prev < 0 && curr > 0) signals[i] = 1;
    if (prev > 0 && curr < 0) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略3: 均线交叉 ====================
function maCrossSignals(klines: KLine[]) {
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

// ==================== 策略4: 动量 ====================
function momentumSignals(klines: KLine[]) {
  const signals: number[] = new Array(klines.length).fill(0);
  for (let i = 20; i < klines.length; i++) {
    const mom = (klines[i].close - klines[i - 20].close) / klines[i - 20].close;
    if (mom > 0.05) signals[i] = 1;
    if (mom < -0.05) signals[i] = -1;
  }
  return signals;
}

// ==================== 策略5: RSI ====================
function rsiSignals(klines: KLine[]) {
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

// ==================== 计算策略得分 ====================
function calcStrategyScore(symbol: string, klines: KLine[]): any {
  const strategies = [
    { name: '布林带', fn: bollingerSignals },
    { name: 'MACD', fn: macdSignals },
    { name: '均线交叉', fn: maCrossSignals },
    { name: '动量', fn: momentumSignals },
    { name: 'RSI', fn: rsiSignals },
  ];
  
  let result: any = { symbol, signals: {} };
  let totalBuy = 0, totalSell = 0;
  
  for (const strat of strategies) {
    const signals = strat.fn(klines);
    const lastIdx = klines.length - 1;
    const lastSignal = signals[lastIdx];
    
    result.signals[strat.name] = lastSignal;
    if (lastSignal === 1) totalBuy++;
    if (lastSignal === -1) totalSell++;
  }
  
  result.totalBuy = totalBuy;
  result.totalSell = totalSell;
  result.action = totalBuy > totalSell ? '买入' : totalSell > totalBuy ? '卖出' : '观望';
  
  return result;
}

function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function sendMultiStrategySignals() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'MSTR', 'AVGO', 'COST', 'GOOGL', 'AMZN', 'LLY', 'JPM'];
  
  let msg = `📊 多策略综合信号 (${new Date().toLocaleDateString('zh-CN')})\n\n`;
  
  let buyCount = 0, sellCount = 0;
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) continue;
    
    const score = calcStrategyScore(symbol, klines);
    
    // 股票代码 + 动作
    let line = `${symbol}: `;
    if (score.action === '买入') {
      line += '🟢买入';
      buyCount++;
    } else if (score.action === '卖出') {
      line += '🔴卖出';
      sellCount++;
    } else {
      line += '⚪观望';
    }
    
    // 各策略信号
    const signalStrs: string[] = [];
    for (const [name, sig] of Object.entries(score.signals)) {
      if (sig === 1) signalStrs.push(`${name}▲`);
      else if (sig === -1) signalStrs.push(`${name}▼`);
    }
    if (signalStrs.length > 0) {
      line += ` (${signalStrs.join(' ')})`;
    }
    
    msg += line + '\n';
  }
  
  msg += `\n📈 总结: ${buyCount}个买入 ${sellCount}个卖出`;
  
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
  console.log('✅ 多策略信号已推送');
}

sendMultiStrategySignals();
