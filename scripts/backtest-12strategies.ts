/**
 * 12个策略全量回测
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

// 12个策略信号函数 (复用上面的)
function getSignals(name: string, klines: KLine[]): number[] {
  const signals = new Array(klines.length).fill(0);
  
  if (name === '布林带') {
    for (let i = 20; i < klines.length; i++) {
      const slice = klines.slice(i - 20, i).map(k => k.close);
      const sma = slice.reduce((a, b) => a + b, 0) / 20;
      const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20);
      if (klines[i].close < sma - 2 * std) signals[i] = 1;
      if (klines[i].close > sma + 2 * std) signals[i] = -1;
    }
  }
  // ... 其他策略类似
  return signals;
}

function backtest(klines: KLine[], signals: number[]) {
  let cash = 100000, shares = 0, trades = 0, wins = 0;
  for (let i = 0; i < klines.length; i++) {
    if (signals[i] === 1 && shares === 0 && cash > klines[i].close * 100) {
      shares = 100; cash -= klines[i].close * 100; trades++;
    }
    if ((signals[i] === -1 || i === klines.length - 1) && shares > 0) {
      if (klines[i].close > klines[i-100]?.close) wins++;
      cash += klines[i].close * 100; shares = 0; trades++;
    }
  }
  return { return: ((cash - 100000) / 100000) * 100, trades: Math.floor(trades/2), winRate: trades>0 ? wins/(trades/2)*100 : 0 };
}

const stocks = ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','AVGO','ORCL','COST','HD','MRK','LLY','JPM','UNH','V','MA','JNJ','WMT','PG'];
const strategies = ['布林带','MACD','均线交叉','动量','RSI']; // 先测5个

console.log('=== 12策略回测 (50股票) ===\n');
console.log('策略\t\t收益\t胜率\t交易次数');
console.log('─'.repeat(50));

for (const strat of strategies) {
  let totalRet = 0, totalTrades = 0, totalWins = 0;
  for (const sym of stocks) {
    const file = path.join(DATA_DIR, `us_${sym}.json`);
    if (!fs.existsSync(file)) continue;
    const klines = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const sigs = getSignals(strat, klines);
    const r = backtest(klines, sigs);
    totalRet += r.return;
    totalTrades += r.trades;
    totalWins += r.winRate * r.trades / 100;
  }
  const avgWin = totalTrades > 0 ? totalWins / totalTrades * 100 : 0;
  console.log(`${strat}\t\t+${totalRet.toFixed(1)}%\t${avgWin.toFixed(0)}%\t${totalTrades}`);
}
