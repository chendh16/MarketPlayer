// 简单的回测测试 - 修复版
import axios from 'axios';

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  shares: number;
  reason: string;
}

// 获取K线数据
async function getKLines(market: string, code: string, days: number = 500): Promise<KLine[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  
  const beg = start.toISOString().slice(0, 10).replace(/-/g, '');
  const endStr = end.toISOString().slice(0, 10).replace(/-/g, '');
  
  if (market === 'a') {
    const secid = code.startsWith('6') ? '1.' : '0.';
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${beg}&end=${endStr}`;
    const res = await axios.get(url);
    const klines = res.data?.data?.klines || [];
    return klines.map((k: string) => {
      const p = k.split(',');
      return { date: p[0], open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: +p[5] };
    });
  } else if (market === 'us') {
    // 修复Stooq日期格式
    const url = `https://stooq.com/q/d/l/?s=${code.toLowerCase()}.us&d1=${beg}&d2=${endStr}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const text = res.data as string;
      const lines = text.trim().split('\n');
      if (lines.length <= 1) return [];
      return lines.slice(1).map((l: string) => {
        const p = l.split(',');
        return { 
          date: p[0], 
          open: +p[1], 
          high: +p[3], 
          low: +p[4], 
          close: +p[6], 
          volume: +p[5] 
        };
      }).filter((k: KLine) => !isNaN(k.close));
    } catch (e) {
      console.error('Stooq error:', e);
      return [];
    }
  }
  return [];
}

// 均线交叉策略
function maCrossStrategy(klines: KLine[], shortMA: number = 5, longMA: number = 20): Trade[] {
  const trades: Trade[] = [];
  let position = 0;
  
  for (let i = longMA; i < klines.length; i++) {
    const hist = klines.slice(0, i + 1);
    const short = hist.slice(-shortMA).reduce((s, k) => s + k.close, 0) / shortMA;
    const long = hist.slice(-longMA).reduce((s, k) => s + k.close, 0) / longMA;
    
    const prevHist = klines.slice(0, i);
    const prevShort = prevHist.slice(-shortMA).reduce((s, k) => s + k.close, 0) / shortMA;
    const prevLong = prevHist.slice(-longMA).reduce((s, k) => s + k.close, 0) / longMA;
    
    if (prevShort <= prevLong && short > long && position === 0) {
      trades.push({ date: klines[i].date, type: 'buy', price: klines[i].close, shares: 100, reason: 'MA金叉' });
      position = 100;
    } else if (prevShort >= prevLong && short < long && position > 0) {
      trades.push({ date: klines[i].date, type: 'sell', price: klines[i].close, shares: 100, reason: 'MA死叉' });
      position = 0;
    }
  }
  
  if (position > 0 && trades.length > 0) {
    trades.push({ date: klines[klines.length - 1].date, type: 'sell', price: klines[klines.length - 1].close, shares: 100, reason: '回测结束' });
  }
  
  return trades;
}

// RSI策略
function rsiStrategy(klines: KLine[], period: number = 14, oversold: number = 30, overbought: number = 70): Trade[] {
  const trades: Trade[] = [];
  let position = 0;
  
  for (let i = period + 1; i < klines.length; i++) {
    const prices = klines.slice(i - period, i).map(k => k.close);
    let gains = 0, losses = 0;
    for (let j = 1; j < prices.length; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    
    if (rsi < oversold && position === 0) {
      trades.push({ date: klines[i].date, type: 'buy', price: klines[i].close, shares: 100, reason: `RSI=${rsi.toFixed(1)}超卖` });
      position = 100;
    } else if (rsi > overbought && position > 0) {
      trades.push({ date: klines[i].date, type: 'sell', price: klines[i].close, shares: 100, reason: `RSI=${rsi.toFixed(1)}超买` });
      position = 0;
    }
  }
  
  if (position > 0 && trades.length > 0) {
    trades.push({ date: klines[klines.length - 1].date, type: 'sell', price: klines[klines.length - 1].close, shares: 100, reason: '回测结束' });
  }
  
  return trades;
}

// 计算回测结果
function calcResult(klines: KLine[], trades: Trade[], initialCapital: number = 100000) {
  if (trades.length === 0) {
    return { totalReturn: '0.00%', annualReturn: '0.00%', maxDrawdown: '0.00%', totalTrades: 0, winRate: '0%' };
  }
  
  // 简单计算最终收益
  let totalCost = 0;
  let totalSell = 0;
  let shares = 0;
  
  for (const t of trades) {
    if (t.type === 'buy') {
      totalCost += t.price * t.shares;
      shares += t.shares;
    } else {
      totalSell += t.price * t.shares;
      shares -= t.shares;
    }
  }
  
  // 当前持仓价值
  const lastPrice = klines[klines.length - 1].close;
  const currentValue = shares * lastPrice;
  
  const finalCapital = totalSell + currentValue;
  const totalReturn = (finalCapital - initialCapital) / initialCapital * 100;
  
  const startDate = new Date(klines[0].date);
  const endDate = new Date(klines[klines.length - 1].date);
  const years = Math.max(0.1, (endDate.getTime() - startDate.getTime()) / (365 * 24 * 3600 * 1000));
  const annualReturn = (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100;
  
  // 简单最大回撤计算
  let capital = initialCapital;
  let maxCapital = initialCapital;
  let maxDrawdown = 0;
  
  for (const t of trades) {
    if (t.type === 'buy') {
      capital -= t.price * t.shares;
    } else {
      capital += t.price * t.shares;
    }
    const currentValue = capital + shares * lastPrice;
    if (currentValue > maxCapital) maxCapital = currentValue;
    const drawdown = (maxCapital - currentValue) / maxCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // 胜率
  let wins = 0;
  let losses = 0;
  for (let i = 1; i < trades.length; i++) {
    if (trades[i].type === 'sell') {
      const buyPrice = trades[i - 1].price;
      const sellPrice = trades[i].price;
      if (sellPrice > buyPrice) wins++;
      else losses++;
    }
  }
  const winRate = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(1) + '%' : '0%';
  
  return {
    totalReturn: totalReturn.toFixed(2) + '%',
    annualReturn: annualReturn.toFixed(2) + '%',
    maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
    totalTrades: trades.length,
    winRate,
  };
}

// 主测试
async function main() {
  console.log('=== 金融团队回测测试 v2 ===\n');
  
  const tests = [
    { market: 'a', code: '600519', name: '贵州茅台' },
    { market: 'a', code: '000001', name: '平安银行' },
    { market: 'a', code: '300750', name: '宁德时代' },
    { market: 'us', code: 'AAPL', name: '苹果' },
    { market: 'us', code: 'MSFT', name: '微软' },
  ];
  
  const results: any[] = [];
  
  for (const t of tests) {
    console.log(`\n📊 ${t.name} (${t.market.toUpperCase()})`);
    console.log('─'.repeat(45));
    
    const klines = await getKLines(t.market, t.code, 500);
    console.log(`数据: ${klines.length}天 (${klines[0]?.date || 'N/A'} ~ ${klines[klines.length - 1]?.date || 'N/A'})`);
    
    if (klines.length < 50) {
      console.log('⚠️ 数据不足');
      continue;
    }
    
    // MA策略
    const maTrades = maCrossStrategy(klines, 5, 20);
    const maResult = calcResult(klines, maTrades);
    console.log(`\n📈 MA(5,20): 收益${maResult.totalReturn} | 年化${maResult.annualReturn} | 回撤${maResult.maxDrawdown} | 交易${maResult.totalTrades}次 | 胜率${maResult.winRate}`);
    
    // RSI策略
    const rsiTrades = rsiStrategy(klines);
    const rsiResult = calcResult(klines, rsiTrades);
    console.log(`📈 RSI(14):  收益${rsiResult.totalReturn} | 年化${rsiResult.annualReturn} | 回撤${rsiResult.maxDrawdown} | 交易${rsiResult.totalTrades}次 | 胜率${rsiResult.winRate}`);
    
    results.push({ name: t.name, ma: maResult, rsi: rsiResult });
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('=== 回测汇总 ===');
  console.log('策略    | 标的        | 收益率  | 年化   | 最大回撤');
  console.log('-'.repeat(50));
  for (const r of results) {
    console.log(`MA(5,20)| ${r.name.padEnd(10)} | ${r.ma.totalReturn.padEnd(7)} | ${r.ma.annualReturn.padEnd(6)} | ${r.ma.maxDrawdown}`);
    console.log(`RSI(14) | ${r.name.padEnd(10)} | ${r.rsi.totalReturn.padEnd(7)} | ${r.rsi.annualReturn.padEnd(6)} | ${r.rsi.maxDrawdown}`);
  }
}

main().catch(console.error);
