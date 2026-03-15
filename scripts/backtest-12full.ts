/**
 * 12个短线策略完整回测
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

// 策略函数
const strategies: { name: string; fn: (k: KLine[]) => number[] }[] = [
  {
    name: '布林带', fn: (klines) => {
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
    name: 'MACD', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      const ema = (arr: number[], p: number) => {
        const k = 2 / (p + 1);
        let r = [arr[0]];
        for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i - 1] * (1 - k));
        return r;
      };
      for (let i = 35; i < klines.length; i++) {
        const closes = klines.slice(0, i + 1).map(k => k.close);
        const fast = ema(closes, 12);
        const slow = ema(closes, 26);
        const prevFast = ema(closes.slice(0, i), 12);
        const prevSlow = ema(closes.slice(0, i), 26);
        if ((prevFast[prevFast.length-1] - prevSlow[prevSlow.length-1]) < 0 && (fast[fast.length-1] - slow[slow.length-1]) > 0) s[i] = 1;
        if ((prevFast[prevFast.length-1] - prevSlow[prevSlow.length-1]) > 0 && (fast[fast.length-1] - slow[slow.length-1]) < 0) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '均线交叉', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const ma5 = klines.slice(i - 4, i + 1).reduce((a, b) => a + b.close, 0) / 5;
        const ma20 = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.close, 0) / 20;
        const pma5 = klines.slice(i - 5, i).reduce((a, b) => a + b.close, 0) / 5;
        const pma20 = klines.slice(i - 20, i).reduce((a, b) => a + b.close, 0) / 20;
        if (pma5 <= pma20 && ma5 > ma20) s[i] = 1;
        if (pma5 >= pma20 && ma5 < ma20) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '动量', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const mom = (klines[i].close - klines[i - 20].close) / klines[i - 20].close;
        if (mom > 0.05) s[i] = 1;
        if (mom < -0.05) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: 'RSI', fn: (klines) => {
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
    name: 'SAR', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 2; i < klines.length; i++) {
        if (klines[i].close > klines[i-1].close && klines[i-1].close <= klines[i-2].close) s[i] = 1;
        if (klines[i].close < klines[i-1].close && klines[i-1].close >= klines[i-2].close) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '成交量', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const avgVol = klines.slice(i - 19, i + 1).reduce((a, b) => a + b.volume, 0) / 20;
        if (klines[i].volume > avgVol * 1.5 && klines[i].close > klines[i-1].close * 1.02) s[i] = 1;
        if (klines[i].volume > avgVol * 1.5 && klines[i].close < klines[i-1].close * 0.98) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '威廉%R', fn: (klines) => {
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
    name: 'CCI', fn: (klines) => {
      const s = new Array(klines.length).fill(0);
      for (let i = 20; i < klines.length; i++) {
        const tp = klines.slice(i - 19, i + 1).map(k => (k.high + k.low + k.close) / 3);
        const sma = tp.reduce((a, b) => a + b, 0) / 20;
        const meanDev = tp.reduce((a, b) => a + Math.abs(b - sma), 0) / 20;
        const cci = (tp[tp.length - 1] - sma) / (meanDev * 0.015);
        if (cci < -100) s[i] = 1;
        if (cci > 100) s[i] = -1;
      }
      return s;
    }
  },
  {
    name: '价量', fn: (klines) => {
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
  {
    name: '支撑阻力', fn: (klines) => {
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
    name: 'AO', fn: (klines) => {
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
];

function backtest(klines: KLine[], signals: number[]) {
  let cash = 100000, shares = 0, trades = 0, wins = 0;
  for (let i = 0; i < klines.length; i++) {
    if (signals[i] === 1 && shares === 0 && cash > klines[i].close * 100) {
      shares = 100; cash -= klines[i].close * 100; trades++;
    }
    if ((signals[i] === -1 || i === klines.length - 1) && shares > 0) {
      if (klines[i].close > klines[Math.max(0, i-50)]?.close) wins++;
      cash += klines[i].close * 100; shares = 0; trades++;
    }
  }
  return { return: ((cash - 100000) / 100000) * 100, trades: Math.floor(trades/2), winRate: trades>0 ? wins/(trades/2)*100 : 0 };
}

const stocks = ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','AVGO','ORCL','COST','HD','MRK','LLY','JPM'];

console.log('═══════════════════════════════════════════════');
console.log('    12个短线策略回测 (14只股票)');
console.log('═══════════════════════════════════════════════\n');
console.log('策略\t\t收益\t胜率\t信号数');
console.log('─'.repeat(50));

const results: {name: string, ret: number, win: number, trades: number}[] = [];

for (const strat of strategies) {
  let totalRet = 0, totalTrades = 0, totalWins = 0, totalSignals = 0;
  for (const sym of stocks) {
    const file = path.join(DATA_DIR, `us_${sym}.json`);
    if (!fs.existsSync(file)) continue;
    const klines = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const sigs = strat.fn(klines);
    const r = backtest(klines, sigs);
    totalRet += r.return;
    totalTrades += r.trades;
    totalWins += r.winRate * r.trades / 100;
    totalSignals += sigs.filter(s => s !== 0).length;
  }
  const avgWin = totalTrades > 0 ? totalWins / totalTrades * 100 : 0;
  results.push({ name: strat.name, ret: totalRet, win: avgWin, trades: totalSignals });
}

results.sort((a, b) => b.ret - a.ret);

results.forEach((r, i) => {
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
  console.log(`${medal}${r.name}\t\t+${r.ret.toFixed(1)}%\t${r.win.toFixed(0)}%\t${r.trades}`);
});

console.log('\n═══════════════════════════════════════════════');
