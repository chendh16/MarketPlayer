/**
 * 批量扫描测试脚本
 */

import { getHistoryKLine } from '../src/services/market/quote-service';
import { calculateBollingerBands } from '../src/utils/technical-analysis';

async function testScanBollingerSqueeze() {
  console.log('🧪 测试 Bollinger 挤压扫描...\n');

  const symbols = [
    { symbol: 'AAPL', market: 'us' as const, name: '苹果' },
    { symbol: 'MSFT', market: 'us' as const, name: '微软' },
    { symbol: 'GOOGL', market: 'us' as const, name: '谷歌' },
    { symbol: 'TSLA', market: 'us' as const, name: '特斯拉' },
    { symbol: 'NVDA', market: 'us' as const, name: '英伟达' },
  ];

  console.log(`📊 扫描 ${symbols.length} 只股票...\n`);

  const results: any[] = [];

  for (const stock of symbols) {
    try {
      const klines = await getHistoryKLine(stock.symbol, stock.market, '1d', '3mo');
      if (klines.length < 20) continue;

      const bb = calculateBollingerBands(klines);
      if (!bb) continue;

      const latest = klines[klines.length - 1];
      const changePct = ((latest.close - klines[klines.length - 2].close) / klines[klines.length - 2].close) * 100;

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        price: latest.close,
        changePct: changePct.toFixed(2),
        bbWidth: (bb.bands.width * 100).toFixed(2) + '%',
        rating: bb.bands.rating,
        squeeze: bb.isSqueeze,
      });
    } catch (e) {
      console.error(`❌ ${stock.symbol} 失败:`, e);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // 按评级排序
  results.sort((a, b) => b.rating - a.rating);

  console.log('=== 扫描结果 ===');
  console.log('代码    | 名称   | 价格    | 涨跌幅  | BB带宽  | 评级 | 挤压');
  console.log('--------|--------|----------|---------|---------|------|------');
  results.forEach(r => {
    console.log(
      `${r.symbol.padEnd(7)}| ${r.name.padEnd(6)}| ${r.price.toFixed(2).padEnd(8)}| ${r.changePct.padEnd(7)}%| ${r.bbWidth.padEnd(7)}| ${r.rating.toString().padEnd(4)}| ${r.squeeze ? '✅' : '❌'}`
    );
  });

  // 找出挤压的股票
  const squeeze = results.filter(r => r.squeeze);
  console.log(`\n📌 挤压股票: ${squeeze.length} 只`);
  squeeze.forEach(s => console.log(`  - ${s.symbol} ${s.name}`));

  console.log('\n✅ 扫描测试完成!');
}

async function testScanMovers() {
  console.log('\n🧪 测试涨跌幅扫描...\n');

  const symbols = [
    { symbol: 'AAPL', market: 'us' as const, name: '苹果' },
    { symbol: 'MSFT', market: 'us' as const, name: '微软' },
    { symbol: 'TSLA', market: 'us' as const, name: '特斯拉' },
  ];

  const stockData: any[] = [];

  for (const stock of symbols) {
    try {
      const klines = await getHistoryKLine(stock.symbol, stock.market, '1d', '1mo');
      if (klines.length < 2) continue;

      const latest = klines[klines.length - 1];
      const prev = klines[klines.length - 2];
      const changePct = ((latest.close - prev.close) / prev.close) * 100;

      stockData.push({
        symbol: stock.symbol,
        name: stock.name,
        changePct,
        volume: latest.volume,
      });
    } catch (e) {
      console.error(`❌ ${stock.symbol} 失败:`, e);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // 按涨跌幅排序
  stockData.sort((a, b) => b.changePct - a.changePct);

  console.log('=== 涨跌幅排名 ===');
  stockData.forEach(s => {
    const sign = s.changePct >= 0 ? '+' : '';
    console.log(`${s.symbol} ${s.name}: ${sign}${s.changePct.toFixed(2)}%`);
  });

  console.log('\n✅ 涨跌幅测试完成!');
}

Promise.all([testScanBollingerSqueeze(), testScanMovers()])
  .then(() => console.log('\n🎉 所有批量测试通过!'))
  .catch(console.error);
