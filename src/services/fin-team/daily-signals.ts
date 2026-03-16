/**
 * 每日策略信号推送服务
 * 布林带策略 - K线图 + 买卖点 + 盈利
 */

import * as fs from 'fs';
import * as path from 'path';
import { sendMessageToUser } from '../feishu/bot';

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
    const current = klines[i];
    
    if (current.close < lower) {
      signals.push({ date: current.date, price: current.close, type: 'buy', index: i });
    } else if (current.close > upper) {
      signals.push({ date: current.date, price: current.close, type: 'sell', index: i });
    }
  }
  
  return signals;
}

function calculateProfit(klines: KLine[], buyIndex: number): number {
  for (let i = buyIndex + 1; i < Math.min(buyIndex + 5, klines.length); i++) {
    const profit = (klines[i].close - klines[buyIndex].close) / klines[buyIndex].close * 100;
    if (profit > 5) return profit;
  }
  const lastIdx = klines.length - 1;
  return (klines[lastIdx].close - klines[buyIndex].close) / klines[buyIndex].close * 100;
}

function generateSignalsReport(): string {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  let report = '# 📈 每日策略信号报告\n\n';
  
  for (const file of files) {
    const stock = file.replace('.json', '');
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
    const klines: KLine[] = JSON.parse(content);
    
    if (klines.length < 20) continue;
    
    const signals = bollingerSignals(klines);
    const recentSignals = signals.slice(-3);
    
    if (recentSignals.length > 0) {
      report += `## ${stock}\n`;
      for (const sig of recentSignals) {
        const profit = calculateProfit(klines, sig.index);
        report += `- ${sig.date}: ${sig.type === 'buy' ? '🟢买入' : '🔴卖出'} @ ${sig.price.toFixed(2)} (模拟盈利: ${profit.toFixed(1)}%)\n`;
      }
      report += '\n';
    }
  }
  
  return report;
}

export async function sendDailySignals(): Promise<void> {
  const report = generateSignalsReport();
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: report });
}
