/**
 * 每日多策略信号推送 - Top 6 策略
 * 区分短线/中线/长线策略
 */

import * as fs from 'fs';
import * as path from 'path';
import { sendMessageToUser } from '../src/services/feishu/bot';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

// Top 6 策略 (标注短线/中线)
const strategies = [
  { name: 'RSI', type: '短线', period: 14, fn: (klines: KLine[]) => {
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
  { name: 'AO', type: '短线', period: 34, fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 34; i < klines.length; i++) {
        const ma5 = klines.slice(i - 4, i + 1).reduce((a: number, b: KLine) => a + (b.high + b.low) / 2, 0) / 5;
        const ma34 = klines.slice(i - 33, i + 1).reduce((a: number, b: KLine) => a + (b.high + b.low) / 2, 0) / 34;
        const pma5 = klines.slice(i - 5, i).reduce((a: number, b: KLine) => a + (b.high + b.low) / 2, 0) / 5;
        const pma34 = klines.slice(i - 34, i).reduce((a: number, b: KLine) => a + (b.high + b.low) / 2, 0) / 34;
        if (pma5 <= pma34 && ma5 > ma34) s[i] = 1;
        if (pma5 >= pma34 && ma5 < ma34) s[i] = -1;
      }
      return s;
    }
  },
  { name: '威廉%R', type: '短线', period: 14, fn: (klines: KLine[]) => {
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
  { name: '布林带', type: '短线', period: 20, fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const slice = klines.slice(i - 20, i).map(k => k.close);
        const sma = slice.reduce((a: number, b: number) => a + b, 0) / 20;
        const std = Math.sqrt(slice.reduce((a: number, b: number) => a + Math.pow(b - sma, 2), 0) / 20);
        if (klines[i].close < sma - 2 * std) s[i] = 1;
        if (klines[i].close > sma + 2 * std) s[i] = -1;
      }
      return s;
    }
  },
  { name: 'MA均线', type: '中线', period: 20, fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const ma5 = klines.slice(i - 4, i + 1).reduce((a: number, b: KLine) => a + b.close, 0) / 5;
        const ma20 = klines.slice(i - 19, i + 1).reduce((a: number, b: KLine) => a + b.close, 0) / 20;
        const pma5 = klines.slice(i - 5, i).reduce((a: number, b: KLine) => a + b.close, 0) / 5;
        const pma20 = klines.slice(i - 20, i).reduce((a: number, b: KLine) => a + b.close, 0) / 20;
        if (pma5 <= pma20 && ma5 > ma20) s[i] = 1;
        if (pma5 >= pma20 && ma5 < ma20) s[i] = -1;
      }
      return s;
    }
  },
  { name: '价量', type: '短线', period: 20, fn: (klines: KLine[]) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const avgVol = klines.slice(i - 19, i + 1).reduce((a: number, b: KLine) => a + b.volume, 0) / 20;
        const priceUp = klines[i].close > klines[i-1].close;
        if (priceUp && klines[i].volume > avgVol) s[i] = 1;
        if (!priceUp && klines[i].volume > avgVol) s[i] = -1;
      }
      return s;
    }
  },
];

function calcSignals(symbol: string, klines: KLine[]): any {
  let result: any = { symbol, signals: {}, shortBuy: 0, shortSell: 0, midBuy: 0, midSell: 0 };
  const lastIdx = klines.length - 1;
  
  for (const strat of strategies) {
    const sigs = strat.fn(klines);
    const sig = sigs[lastIdx];
    result.signals[strat.name] = { sig, type: strat.type };
    
    if (sig === 1) {
      if (strat.type === '短线') result.shortBuy++;
      if (strat.type === '中线') result.midBuy++;
    }
    if (sig === -1) {
      if (strat.type === '短线') result.shortSell++;
      if (strat.type === '中线') result.midSell++;
    }
  }
  
  const totalBuy = result.shortBuy + result.midBuy;
  const totalSell = result.shortSell + result.midSell;
  result.action = totalBuy > totalSell ? '🟢买入' : totalSell > totalBuy ? '🔴卖出' : '⚪观望';
  
  return result;
}

function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export async function sendTop6Signals() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'AVGO', 'GOOGL', 'AMZN', 'MSFT', 'COST', 'LLY', 'JPM'];
  
  let msg = `📊 每日多策略信号 (${new Date().toLocaleDateString('zh-CN')})\n\n`;
  msg += `──────────── 短线策略 (RSI/AO/威廉%/布林/价量) ────────────\n`;
  
  let shortBuyCount = 0, shortSellCount = 0, midBuyCount = 0, midSellCount = 0;
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) continue;
    
    const r = calcSignals(symbol, klines);
    
    if (r.action === '🟢买入') {
      if (r.shortBuy > 0) shortBuyCount++;
      if (r.midBuy > 0) midBuyCount++;
    }
    if (r.action === '🔴卖出') {
      if (r.shortSell > 0) shortSellCount++;
      if (r.midSell > 0) midSellCount++;
    }
    
    // 短线信号
    let shortSig = '';
    if (r.shortBuy >= 2) shortSig += '🟢';
    else if (r.shortSell >= 2) shortSig += '🔴';
    else shortSig += '⚪';
    
    // 中线信号
    let midSig = '';
    if (r.midBuy >= 1) midSig += '🟢';
    else if (r.midSell >= 1) midSig += '🔴';
    else midSig += '⚪';
    
    msg += `${symbol}: ${r.action} [短:${shortSig} 中:${midSig}]\n`;
  }
  
  msg += `\n─────────────── 汇总 ───────────────\n`;
  msg += `短线: 🟢${shortBuyCount}个买入 | 🔴${shortSellCount}个卖出\n`;
  msg += `中线: 🟢${midBuyCount}个买入 | 🔴${midSellCount}个卖出`;
  
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
  console.log('✅ 多策略信号已推送(区分短线/中线)');
}

sendTop6Signals();
