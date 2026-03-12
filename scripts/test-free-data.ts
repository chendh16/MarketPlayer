// 测试脚本：获取当前免费数据
import { getDefaultQuotes, getStockPrice, DEFAULT_STOCKS } from '../src/services/market/quote-service';

async function main() {
  console.log('=== 测试免费行情数据 ===\n');
  
  // 1. 获取默认股票报价
  console.log('📊 默认股票报价:');
  const quotes = await getDefaultQuotes();
  for (const q of quotes) {
    console.log(`  ${q.market.toUpperCase()} ${q.code} ${q.name}: ¥${q.price.toFixed(2)} (${q.change >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%)`);
  }
  
  console.log('\n--- 测试获取单个股票 ---');
  
  // 2. 测试获取单个A股
  console.log('\n📈 A股测试 (贵州茅台 600519):');
  const aStock = await getStockPrice('a', '600519');
  if (aStock) {
    console.log(`  价格: ${aStock.price}, 涨跌: ${aStock.changePercent.toFixed(2)}%`);
  } else {
    console.log('  获取失败');
  }
  
  // 3. 测试获取单个港股
  console.log('\n📈 港股测试 (腾讯控股 00700):');
  const hkStock = await getStockPrice('hk', '00700');
  if (hkStock) {
    console.log(`  价格: ${hkStock.price}, 涨跌: ${hkStock.changePercent.toFixed(2)}%`);
  } else {
    console.log('  获取失败');
  }
  
  // 4. 测试获取单个美股
  console.log('\n📈 美股测试 (苹果 AAPL):');
  const usStock = await getStockPrice('us', 'AAPL');
  if (usStock) {
    console.log(`  价格: $${usStock.price}, 涨跌: ${usStock.changePercent.toFixed(2)}%`);
  } else {
    console.log('  获取失败');
  }
  
  console.log('\n=== 当前支持的市场和数据 ===');
  console.log('A股: 东方财富免费API (push2.eastmoney.com)');
  console.log('港股: 腾讯财经免费API (qt.gtimg.cn)');
  console.log('美股: Stooq免费API (stooq.com)');
  console.log('\n默认股票列表:');
  console.log('  A股:', DEFAULT_STOCKS.a.map(s => s.code + s.name).join(', '));
  console.log('  港股:', DEFAULT_STOCKS.hk.map(s => s.code + s.name).join(', '));
  console.log('  美股:', DEFAULT_STOCKS.us.map(s => s.code + s.name).join(', '));
}

main().catch(console.error);
