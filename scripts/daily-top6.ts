/**
 * 每日多策略信号推送 - Top 6 策略
 * RSI, AO, 威廉%R, 布林带, 支撑阻力, 价量
 */

import * as fs from 'fs';
import * as path from 'path';
import { sendMessageToUser } from '../src/services/feishu/bot';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

// Top 6 策略
const strategies = [
  {
    name: 'RSI', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 14; i < klines.length; i++) {
        const prices = klines.slice(i - 13, i + 1).map(k => k.close);
        let gains = 0, losses = 0;
        for (let j = 1; j < prices.length; j++) {
          const ch = prices[j] - prices[j - 1];
          if (ch > 0) gains += ch;
          else losses -= ch;
        }
        const rsi = 100 - (100 / (1 + gains / (losses || 1)));
        if (rsi < 30) s[i] = 1;
        if (rsi > 70) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: 'AO', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 34; i < klines.length; i++) {
        const ma5 = klines.slice(i - 4, i + 1).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 5;
        const ma34 = klines.slice(i - 33, i + 1).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 34;
        const pma5 = klines.slice(i - 5, i).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 5;
        const pma34 = klines.slice(i - 34, i).reduce((a, b) => a + (b.high + b.low) / 2, 0) / 34;
        if (pma5 <= pma34 && ma5 > ma34) s[i] = 1;
        if (pma5 >= pma34 && ma5 < ma34) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '威廉%R', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 14; i < klines.length; i++) {
        const highs = klines.slice(i - 13, i + 1).map(k => k.high);
        const lows = klines.slice(i - 13, i + 1).map(k => k.low);
        const wr = -100 * (Math.max(...highs) - klines[i].close) / (Math.max(...highs) - Math.min(...lows) || 1);
        if (wr < -80) s[i] = 1;
        if (wr > -20) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '布林带', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const slice = klines.slice(i - 20, i).map(k => k.close);
        const sma = slice.reduce((a, b) => a + b, 0) / 20;
        const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20);
        if (klines[i].close < sma - 2 * std) s[i] = 1;
        if (klines[i].close > sma + 2 * std) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '支撑阻力', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 30; i < klines.length; i++) {
        const high30 = Math.max(...klines.slice(i - 29, i).map(k => k.high));
        const low30 = Math.min(...klines.slice(i - 29, i).map(k => k.low));
        if (klines[i].close > high30 * 0.99) s[i] = 1;
        if (klines[i].close < low30 * 1.01) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '价量', fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const avgVol = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.volume, 0) / 20;
        const priceUp = klines[i].close > klines[i-1].close;
        if (priceUp && klines[i].volume > avgVol) s[i] = 1;
        if (!priceUp && klines[i].volume > avgVol) s[i] = -1;
      }
      return s;
    }
  },
];

function calcSignals(symbol: string, klines: KLine[]): any {
  let result: any = { symbol, signals: {} };
  let buy = 0, sell = 0;
  const lastIdx = klines.length - 1;
  
  for (const strat of strategies) {
    const sigs = strat.fn(klines);
    const sig = sigs[lastIdx];
    result.signals[strat.name] = sig;
    if (sig === 1) buy++;
    if (sig === -1) sell++;
  }
  
  result.action = buy > sell ? '🟢买入' : sell > buy ? '🔴卖出' : '⚪观望';
  result.buyCount = buy;
  result.sellCount = sell;
  
  return result;
}

function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export async function sendTop6Signals() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'AVGO', 'GOOGL', 'AMZN', 'MSFT', 'COST', 'LLY', 'JPM'];
  
  let msg = `📊 短线Top6策略信号 (${new Date().toLocaleDateString('zh-CN')})\n\n`;
  msg += `策略: RSI | AO | 威廉%R | 布林带 | 支撑阻力 | 价量\n`;
  msg += `═`.repeat(35) + '\n';
  
  let totalBuy = 0, totalSell = 0;
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) continue;
    
    const r = calcSignals(symbol, klines);
    
    if (r.action === '🟢买入') totalBuy++;
    if (r.action === '🔴卖出') totalSell++;
    
    msg += `${symbol}: ${r.action}`;
    if (r.buyCount > 0) msg += ` (${r.buyCount}买)`;
    if (r.sellCount > 0) msg += ` (${r.sellCount}卖)`;
    msg += '\n';
  }
  
  msg += `═`.repeat(35) + '\n';
  msg += `📈 汇总: ${totalBuy}个买入 | ${totalSell}个卖出`;
  
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
  console.log('✅ Top6策略信号已推送');
}

sendTop6Signals();
