// 简单的回测测试 - 使用免费数据运行
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
  
  let url = '';
  let parser: (data: any) => KLine[];
  
  if (market === 'a') {
    const secid = code.startsWith('6') ? '1.' : '0.';
    url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${beg}&end=${endStr}`;
    
    const res = await axios.get(url);
    const klines = res.data?.data?.klines || [];
    parser = () => klines.map((k: string) => {
      const p = k.split(',');
      return { date: p[0], open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: +p[5] };
    });
  } else if (market === 'us') {
    // 使用Stooq获取美股数据
    url = `https://stooq.com/q/d/l/?s=${code.toLowerCase()}.us&d1=${beg}&d2=${endStr}&i=d`;
    const res = await axios.get(url);
    const lines = res.data.trim().split('\n').slice(1);
    parser = () => lines.map((l: string) => {
      const p = l.split(',');
      return { date: p[0], open: +p[1], high: +p[3], low: +p[4], close: +p[6], volume: +p[5] };
    });
  } else {
    return [];
  }
  
  return parser(null);
}

// 简单均线策略
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
    
    // 金叉买入
    if (prevShort <= prevLong && short > long && position === 0) {
      trades.push({ date: klines[i].date, type: 'buy', price: klines[i].close, shares: 100, reason: 'MA金叉' });
      position = 100;
    }
    // 死叉卖出
    else if (prevShort >= prevLong && short < long && position > 0) {
      trades.push({ date: klines[i].date, type: 'sell', price: klines[i].close, shares: 100, reason: 'MA死叉' });
      position = 0;
    }
  }
  
  // 最后持有则卖出
  if (position > 0) {
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
  
  if (position > 0) {
    trades.push({ date: klines[klines.length - 1].date, type: 'sell', price: klines[klines.length - 1].close, shares: 100, reason: '回测结束' });
  }
  
  return trades;
}

// 计算回测结果
function calcResult(klines: KLine[], trades: Trade[], initialCapital: number = 100000) {
  let capital = initialCapital;
  let shares = 0;
  const equity: number[] = [];
  
  for (const trade of trades) {
    if (trade.type === 'buy') {
      capital -= trade.price * trade.shares;
      shares += trade.shares;
    } else {
      capital += trade.price * trade.shares;
      shares = 0;
    }
  }
  
  const finalCapital = capital + (shares > 0 ? shares * klines[klines.length - 1].close : 0);
  const totalReturn = (finalCapital - initialCapital) / initialCapital * 100;
  
  // 计算年化收益率
  const startDate = new Date(klines[0].date);
  const endDate = new Date(klines[klines.length - 1].date);
  const years = (endDate.getTime() - startDate.getTime()) / (365 * 24 * 3600 * 1000);
  const annualReturn = (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100;
  
  // 最大回撤
  let maxCapital = initialCapital;
  let maxDrawdown = 0;
  capital = initialCapital;
  shares = 0;
  let tradeIdx = 0;
  for (const k of klines) {
    while (tradeIdx < trades.length && trades[tradeIdx].date <= k.date) {
      if (trades[tradeIdx].type === 'buy') {
        capital -= trades[tradeIdx].price * trades[tradeIdx].shares;
        shares += trades[tradeIdx].shares;
      } else {
        capital += trades[tradeIdx].price * trades[tradeIdx].shares;
        shares = 0;
      }
      tradeIdx++;
    }
    const currentValue = capital + shares * k.close;
    if (currentValue > maxCapital) maxCapital = currentValue;
    const drawdown = (maxCapital - currentValue) / maxCapital * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return {
    totalReturn: totalReturn.toFixed(2) + '%',
    annualReturn: annualReturn.toFixed(2) + '%',
    maxDrawdown: maxDrawdown.toFixed(2) + '%',
    totalTrades: trades.length,
    winTrades: trades.filter((t, i) => t.type === 'sell' && i > 0 && t.price > trades[i-1].price).length,
  };
}

// 主测试
async function main() {
  console.log('=== 金融团队回测测试 ===\n');
  
  // 测试标的
  const tests = [
    { market: 'a', code: '600519', name: '贵州茅台' },
    { market: 'us', code: 'AAPL', name: '苹果' },
  ];
  
  for (const t of tests) {
    console.log(`\n📊 ${t.name} (${t.market.toUpperCase()})`);
    console.log('─'.repeat(40));
    
    const klines = await getKLines(t.market, t.code, 500);
    console.log(`获取到 ${klines.length} 天数据 (${klines[0]?.date} ~ ${klines[klines.length - 1]?.date})`);
    
    if (klines.length < 50) {
      console.log('数据不足，跳过');
      continue;
    }
    
    // 均线策略回测
    console.log('\n📈 策略1: MA均线交叉 (5/20)');
    const maTrades = maCrossStrategy(klines, 5, 20);
    const maResult = calcResult(klines, maTrades);
    console.log(`  收益率: ${maResult.totalReturn}, 年化: ${maResult.annualReturn}, 回撤: ${maResult.maxDrawdown}`);
    console.log(`  交易次数: ${maResult.totalTrades}`);
    if (maTrades.length > 0) {
      console.log(`  首笔: ${maTrades[0].date} ${maTrades[0].type} @ ${maTrades[0].price}`);
    }
    
    // RSI策略回测
    console.log('\n📈 策略2: RSI (14, 30/70)');
    const rsiTrades = rsiStrategy(klines);
    const rsiResult = calcResult(klines, rsiTrades);
    console.log(`  收益率: ${rsiResult.totalReturn}, 年化: ${rsiResult.annualReturn}, 回撤: ${rsiResult.maxDrawdown}`);
    console.log(`  交易次数: ${rsiResult.totalTrades}`);
  }
  
  console.log('\n=== 回测完成 ===');
}

main().catch(console.error);
