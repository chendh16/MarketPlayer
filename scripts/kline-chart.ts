/**
 * 生成K线图 + 买卖点标注
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
function drawKlineChart(klines: KLine[], signals: { date: string; price: number; type: 'buy' | 'sell'; index: number }[], symbol: string, days: number = 60) {
  const recent = klines.slice(-days);
  const minPrice = Math.min(...recent.map(k => k.low));
  const maxPrice = Math.max(...recent.map(k => k.high));
  const priceRange = maxPrice - minPrice;
  
  const height = 20;
  const width = 80;
  
  let chart = '';
  
  // 标题
  chart += `\n📈 ${symbol} K线图 (近${days}天)\n`;
  chart += '═'.repeat(width) + '\n';
  
  // 价格标注
  const priceStep = priceRange / height;
  
  for (let row = 0; row < height; row++) {
    const highPrice = maxPrice - (row * priceStep);
    const lowPrice = highPrice - priceStep;
    let line = '';
    
    for (let col = 0; col < recent.length; col++) {
      const k = recent[col];
      const inRange = k.low <= highPrice && k.high >= lowPrice;
      const isOpen = k.open >= lowPrice && k.open < highPrice;
      const isClose = k.close >= lowPrice && k.close < highPrice;
      
      // 检查买卖点
      const signalIdx = klines.indexOf(k);
      const signal = signals.find(s => s.index === signalIdx);
      
      if (signal) {
        line += signal.type === 'buy' ? '▲' : '▼';
      } else if (inRange && (isOpen || isClose)) {
        line += '█';
      } else if (inRange) {
        line += '│';
      } else {
        line += ' ';
      }
    }
    
    chart += `${highPrice.toFixed(1).padStart(8)} ${line}\n`;
  }
  
  // 买卖点汇总
  const buySignals = signals.filter(s => s.type === 'buy');
  const sellSignals = signals.filter(s => s.type === 'sell');
  
  if (buySignals.length > 0) {
    chart += `\n🟢 买入信号 (${buySignals.length}个):\n`;
    buySignals.slice(-5).forEach(s => {
      chart += `   ${s.date} @ $${s.price.toFixed(2)}\n`;
    });
  }
  
  if (sellSignals.length > 0) {
    chart += `\n🔴 卖出信号 (${sellSignals.length}个):\n`;
    sellSignals.slice(-5).forEach(s => {
      chart += `   ${s.date} @ $${s.price.toFixed(2)}\n`;
    });
  }
  
  // 计算模拟收益
  if (buySignals.length > 0 && sellSignals.length > 0) {
    let profit = 0;
    let shares = 0;
    let cost = 0;
    
    for (const sig of signals) {
      if (sig.type === 'buy' && shares === 0) {
        shares = 100;
        cost = sig.price * 100;
      } else if (sig.type === 'sell' && shares > 0) {
        const revenue = sig.price * 100;
        profit += revenue - cost;
        shares = 0;
      }
    }
    
    if (profit > 0) {
      chart += `\n💰 模拟收益: +$${profit.toFixed(2)}\n`;
    }
  }
  
  return chart;
}

// 加载数据
function loadKlines(symbol: string): KLine[] | null {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function main() {
  const stocks = ['META', 'TSLA', 'NVDA', 'AAPL', 'MU', 'MSTR'];
  
  console.log('═'.repeat(60));
  console.log('📊 布林带策略信号 + K线图');
  console.log('═'.repeat(60));
  
  for (const symbol of stocks) {
    const klines = loadKlines(symbol);
    if (!klines) {
      console.log(`❌ ${symbol}: 无数据`);
      continue;
    }
    
    const signals = bollingerSignals(klines);
    const chart = drawKlineChart(klines, signals, symbol, 60);
    console.log(chart);
    console.log('─'.repeat(60));
  }
}

main();
