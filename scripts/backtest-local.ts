/**
 * 模拟盘回测 - 使用本地K线数据
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

// RSI策略
function rsiStrategy(klines: KLine[], period: number = 14): { buy: number[], sell: number[]} {
  const buys: number[] = [];
  const sells: number[] = [];
  
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
    
    // RSI < 30 买入, RSI > 70 卖出
    if (rsi < 30) buys.push(i);
    else if (rsi > 70) sells.push(i);
  }
  
  return { buy: buys, sell: sells };
}

// 简单回测
function backtest(klines: KLine[], initialCash: number = 1000000) {
  let cash = initialCash;
  let shares = 0;
  let trades = 0;
  let wins = 0;
  
  const { buy, sell } = rsiStrategy(klines);
  const buySet = new Set(buy);
  const sellSet = new Set(sell);
  
  for (let i = 0; i < klines.length; i++) {
    const price = klines[i].close;
    
    // 买入
    if (buySet.has(i) && shares === 0 && cash > price * 100) {
      shares = 100;
      cash -= price * 100;
      trades++;
    }
    
    // 卖出
    if (sellSet.has(i) && shares > 0) {
      const profit = (price * 100) - (klines[i - 100]?.close || price) * 100;
      if (profit > 0) wins++;
      cash += price * 100;
      shares = 0;
      trades++;
    }
  }
  
  // 最后平仓
  if (shares > 0) {
    cash += klines[klines.length - 1].close * 100;
  }
  
  const totalReturn = ((cash - initialCash) / initialCash) * 100;
  const winRate = trades > 0 ? (wins / (trades / 2)) * 100 : 0;
  
  return { totalReturn, trades, winRate, finalValue: cash };
}

// 加载数据
function loadKlines(symbol: string, market: 'us' | 'hk' | 'a'): KLine[] | null {
  const file = path.join(DATA_DIR, `${market}_${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return data as KLine[];
}

async function main() {
  console.log('=== 模拟盘回测 (本地数据) ===\n');
  
  // 全部美股
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
  ];
  
  let totalProfit = 0;
  
  for (const stock of stocks) {
    const klines = loadKlines(stock.symbol, stock.market);
    if (!klines || klines.length < 100) {
      console.log(`❌ ${stock.symbol}: 数据不足`);
      continue;
    }
    
    const result = backtest(klines);
    totalProfit += result.totalReturn;
    
    console.log(`📈 ${stock.symbol}: ${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(1)}% | ${result.trades}笔 | 胜率${result.winRate.toFixed(0)}%`);
  }
  
  console.log(`\n=== 组合收益: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(1)}% ===`);
  
  // 保存结果
  const result = {
    date: new Date().toISOString(),
    stocks: stocks.length,
    totalProfit,
    summary: 'RSI策略回测'
  };
  
  fs.writeFileSync('/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/backtest-result.json', JSON.stringify(result, null, 2));
  console.log('\n✅ 结果已保存');
}

main();
