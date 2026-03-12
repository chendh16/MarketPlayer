/**
 * 策略回测测试
 */

import * as fs from 'fs';

// 加载K线数据
function loadKlines(path: string): any {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// 计算MA
function calculateMA(klines: any[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].close;
  const sum = klines.slice(-period).reduce((acc: number, k: any) => acc + k.close, 0);
  return sum / period;
}

// 计算成交量均线
function calculateVolumeMA(klines: any[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].volume;
  const sum = klines.slice(-period).reduce((acc: number, k: any) => acc + k.volume, 0);
  return sum / period;
}

// 短线策略评估
function evaluateShortTerm(klines: any[], symbol: string, name: string) {
  const k = klines[klines.length - 1];
  const prevK = klines[klines.length - 2] || k;
  
  const ma5 = calculateMA(klines, 5);
  const ma20 = calculateMA(klines, 20);
  const volumeMA5 = calculateVolumeMA(klines, 5);
  const volumeRatio = k.volume / volumeMA5;
  const changePct = ((k.close - prevK.close) / prevK.close) * 100;
  
  const reasons: string[] = [];
  let score = 50;
  
  if (volumeRatio > 1.5 && changePct > 2) { score += 20; reasons.push('放量上涨'); }
  if (volumeRatio < 0.5 && changePct < -2) { score += 15; reasons.push('缩量回调'); }
  if (ma5 > ma20) { score += 15; reasons.push('均线多头'); }
  if (ma5 < ma20) { score -= 15; reasons.push('均线空头'); }
  
  const high20 = Math.max(...klines.slice(-20).map((k: any) => k.high));
  if (k.close > high20 * 0.98) { score += 15; reasons.push('突破20日高点'); }
  
  const low20 = Math.min(...klines.slice(-20).map((k: any) => k.low));
  if (k.close < low20 * 1.02 && volumeRatio > 1.5) { score -= 20; reasons.push('放量跌破'); }
  
  const signal = score >= 70 ? 'BUY' : score <= 30 ? 'SELL' : 'HOLD';
  
  return { symbol, name, signal, strength: score, reasons, price: k.close, changePct: changePct.toFixed(2) };
}

// 主测试
console.log('='.repeat(60));
console.log('📈 短线策略 - 量价选股信号');
console.log('='.repeat(60));

const stocks = [
  { file: 'data/cache/klines/a_600519.json', name: '贵州茅台', symbol: '600519' },
  { file: 'data/cache/klines/a_000001.json', name: '平安银行', symbol: '000001' },
  { file: 'data/cache/klines/a_300750.json', name: '宁德时代', symbol: '300750' },
  { file: 'data/cache/klines/us_AAPL.json', name: '苹果', symbol: 'AAPL' },
  { file: 'data/cache/klines/us_NVDA.json', name: '英伟达', symbol: 'NVDA' },
  { file: 'data/cache/klines/hk_00700.json', name: '腾讯控股', symbol: '00700' },
];

for (const stock of stocks) {
  try {
    const data = loadKlines(stock.file);
    const result = evaluateShortTerm(data.klines, stock.symbol, stock.name);
    const emoji = result.signal === 'BUY' ? '🟢' : result.signal === 'SELL' ? '🔴' : '⚪';
    console.log(`\n${emoji} ${stock.name} (${stock.symbol})`);
    console.log(`   信号: ${result.signal} (强度: ${result.strength})`);
    console.log(`   价格: ${result.price}, 涨跌: ${result.changePct}%`);
    console.log(`   原因: ${result.reasons.join(', ') || '无'}`);
  } catch(e: any) {
    console.log(`\n❌ ${stock.name}: ${e.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 长线策略 - 估值择时信号');
console.log('='.repeat(60));

try {
  const pbData = fs.readFileSync('data/fundamental/a_pb_percentile.csv', 'utf8');
  const lines = pbData.trim().split('\n');
  const latest = lines[lines.length - 1].split(',');
  const percentile = parseFloat(latest[4]) * 100;
  
  let score = 50;
  const reasons: string[] = [];
  
  if (percentile < 20) { score += 30; reasons.push('PB分位历史最低20%'); }
  if (percentile >= 20 && percentile < 40) { score += 15; reasons.push('PB分位历史较低'); }
  if (percentile > 80) { score -= 30; reasons.push('PB分位历史最高20%'); }
  if (parseFloat(latest[1]) < 2) { score += 10; reasons.push('PB < 2 历史低位'); }
  
  const signal = score >= 70 ? 'BUY' : score <= 30 ? 'SELL' : 'HOLD';
  const emoji = signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '⚪';
  
  console.log(`\n${emoji} A股市场信号: ${signal} (强度: ${score})`);
  console.log(`   当前PB: ${latest[1]}`);
  console.log(`   PB分位: ${percentile.toFixed(1)}% (近10年)`);
  console.log(`   原因: ${reasons.join(', ')}`);
} catch(e: any) {
  console.log(`\n❌ 长线策略: ${e.message}`);
}
