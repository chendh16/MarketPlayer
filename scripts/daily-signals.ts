/**
 * 每日策略信号推送
 * 布林带策略 - K线图 + 买卖点 + 盈利
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

// 布林带策略信号
function bollingerSignals(klines: KLine[], period: number = 20, stdDev: number = 2) {
  const signals: { date: string; price: number; type: 'buy' | 'sell'; index: number }[] = [];
  
  for (let i = period; i < klines.length; i++) {
    const slice = klines.slice(i - period, i).map(k => k.close);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = sma + stdDev * std;
    const lower = sma - stdDev * std;
    const current = klines[i].close;
    
    if (current < lower) {
      signals.push({ date: klines[i].date, price: current, type: 'buy', index: i });
    } else if (current > upper) {
      signals.push({ date: klines[i].date, price: current, type: 'sell', index: i });
    }
  }
  
  return signals;
}

// 生成ASCII K线图
function drawKlineChart(klines: KLine[], signals: { date: string; price: number; type: 'buy' | 'sell'; index: number }[], symbol: string, days: number = 30) {
  const recent = klines.slice(-days);
  const minPrice = Math.min(...recent.map(k => k.low));
  const maxPrice = Math.max(...recent.map(k => k.high));
  const priceRange = maxPrice - minPrice;
  
  const height = 12;
  
  let chart = '';
  
  // 标题
  chart += `\n📈 ${symbol} (近${days}天)\n`;
  
  const priceStep = priceRange / height;
  
  for (let row = 0; row < height; row++) {
    const highPrice = maxPrice - (row * priceStep);
    let line = '';
    
    for (let col = 0; col < Math.min(recent.length, 40); col++) {
      const k = recent[col];
      const inRange = k.low <= highPrice && k.high >= (highPrice - priceStep);
      
      // 检查买卖点
      const signalIdx = klines.indexOf(k);
      const signal = signals.find(s => s.index === signalIdx);
      
      if (signal) {
        line += signal.type === 'buy' ? '▲' : '▼';
      } else if (inRange) {
        line += '█';
      } else {
        line += ' ';
      }
    }
    chart += `${highPrice.toFixed(0).padStart(5)} ${line}\n`;
  }
  
  // 买卖点汇总
  const buySignals = signals.filter(s => s.type === 'buy').slice(-3);
  const sellSignals = signals.filter(s => s.type === 'sell').slice(-3);
  
  if (buySignals.length > 0) {
    chart += `🟢 买入: ${buySignals.map(s => s.date.slice(5)).join(', ')}\n`;
  }
  if (sellSignals.length > 0) {
    chart += `🔴 卖出: ${sellSignals.map(s => s.date.slice(5)).join(', ')}\n`;
  }
  
  return chart;
}

// 计算模拟收益
function calcProfit(klines: KLine[], signals: { date: string; price: number; type: 'buy' | 'sell'; index: number }[]) {
  let profit = 0;
  let shares = 0;
  let cost = 0;
  
  for (const sig of signals) {
    if (sig.type === 'buy' && shares === 0) {
      shares = 100;
      cost = sig.price * 100;
    } else if (sig.type === 'sell' && shares > 0) {
      profit += (sig.price * 100) - cost;
      shares = 0;
    }
  }
  
  return profit;
}

// 加载数据
function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function sendDailySignals() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'MSTR', 'AVGO', 'COST'];
  
  let msg = `📊 布林带策略信号推送 (${new Date().toLocaleDateString('zh-CN')})\n\n`;
  msg += `策略: 突破上轨卖出，下轨买入\n`;
  msg += `─`.repeat(30) + '\n';
  
  let totalProfit = 0;
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) continue;
    
    const signals = bollingerSignals(klines);
    const chart = drawKlineChart(klines, signals, symbol, 30);
    const profit = calcProfit(klines, signals);
    totalProfit += profit;
    
    msg += chart;
    msg += `💰 模拟盈利: ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}\n`;
    msg += `─`.repeat(30) + '\n';
  }
  
  msg += `\n📈 总模拟盈利: $${totalProfit.toFixed(0)}`;
  
  // 发送
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
  console.log('✅ 每日信号已推送');
}

// 立即执行
sendDailySignals();
