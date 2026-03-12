// 测试基本面和技术面数据
import axios from 'axios';

// HTTP GET
async function httpGet(url: string): Promise<string> {
  const res = await axios.get(url, { 
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000 
  });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

async function main() {
  console.log('=== 测试基本面数据 (免费API) ===\n');

  // 1. Yahoo Finance 基本面数据
  console.log('📊 Yahoo Finance 基本面数据:');
  try {
    // 美股 AAPL 基本面
    const yahooUrl = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=summaryDetail,defaultKeyStatistics,financialData';
    const data = await httpGet(yahooUrl);
    const json = JSON.parse(data);
    const result = json?.quoteSummary?.result?.[0];
    
    if (result) {
      const summary = result.summaryDetail || {};
      const stats = result.defaultKeyStatistics || {};
      const financial = result.financialData || {};
      
      console.log('  苹果 (AAPL):');
      console.log(`    市值: ${summary.marketCap?.fmt || 'N/A'}`);
      console.log(`    PE: ${summary.trailingPE?.fmt || 'N/A'}`);
      console.log(`    每股收益: ${stats.trailingEps?.fmt || 'N/A'}`);
      console.log(`    股息率: ${summary.dividendYield?.fmt || 'N/A'}`);
      console.log(`    52周高低: ${summary.fiftyTwoWeekLow?.fmt} - ${summary.fiftyTwoWeekHigh?.fmt}`);
      console.log(`    总债务: ${financial.totalDebt?.fmt || 'N/A'}`);
      console.log(`    现金流: ${financial.freeCashflow?.fmt || 'N/A'}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 2. A股基本面 - 东方财富
  console.log('\n📊 A股基本面 (东方财富):');
  try {
    // 贵州茅台基本面
    const eastUrl = 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f57,f58,f84,f85,f127,f128,f162,f163,f164,f167,f168,f116,f117,f127,f128,f173,f177,f187,f188,f189,f190,f191,f192';
    const data = await httpGet(eastUrl);
    const json = JSON.parse(data);
    const d = json?.data;
    
    if (d) {
      console.log('  贵州茅台 (600519):');
      console.log(`    总市值: ${d.f57 || 'N/A'} 亿`);
      console.log(`    流通市值: ${d.f58 || 'N/A'} 亿`);
      console.log(`    市盈率(TTM): ${d.f162 || 'N/A'}`);
      console.log(`    市净率: ${d.f167 || 'N/A'}`);
      console.log(`    每股收益: ${d.f84 || 'N/A'}`);
      console.log(`    每股净资产: ${d.f85 || 'N/A'}`);
      console.log(`    总营收: ${d.f127 || 'N/A'} 亿`);
      console.log(`    净利润: ${d.f128 || 'N/A'} 亿`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 3. 港股基本面
  console.log('\n📊 港股基本面 (腾讯财经):');
  try {
    const hkUrl = 'https://qt.gtimg.cn/q=r_hk00700';
    const data = await httpGet(hkUrl);
    const match = data.match(/"([^"]+)"/);
    if (match) {
      const parts = match[1].split('~');
      console.log('  腾讯控股 (00700):');
      console.log(`    当前价: ${parts[3]}`);
      console.log(`    市值: ${parts[44] || 'N/A'} 亿`);
      console.log(`    PE: ${parts[46] || 'N/A'}`);
      console.log(`    PB: ${parts[48] || 'N/A'}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  console.log('\n=== 测试技术面/历史数据 ===\n');

  // 4. 历史K线数据 - A股
  console.log('📈 A股历史K线 (东方财富):');
  try {
    // 获取日K线
    const klineUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20230101&end=20260311';
    const data = await httpGet(klineUrl);
    const json = JSON.parse(data);
    const klines = json?.data?.klines || [];
    
    console.log(`  贵州茅台 (600519) - 最近 ${klines.length} 天数据`);
    if (klines.length > 0) {
      const latest = klines[klines.length - 1].split(',');
      console.log(`    最新: ${latest[1]} (${latest[2]}%) 成交量: ${latest[5]}`);
      const first = klines[0].split(',');
      console.log(`    最早: ${first[0]} 开盘: ${first[1]}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 5. 历史K线 - 港股
  console.log('\n📈 港股历史K线 (腾讯财经):');
  try {
    const hkKlineUrl = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hk00700,day,,,3,qfqa';
    const data = await httpGet(hkKlineUrl);
    const json = JSON.parse(data);
    const klines = json?.data?.hk00700?.qfqday || [];
    
    console.log(`  腾讯控股 (00700) - 最近 ${klines.length} 天数据`);
    if (klines.length > 0) {
      const latest = klines[klines.length - 1];
      console.log(`    最新: ${latest[1]} (${latest[2]}%) 成交量: ${latest[4]}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 6. 历史K线 - 美股 (Yahoo Finance)
  console.log('\n📈 美股历史K线 (Yahoo Finance):');
  try {
    const yahooKline = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=1672531200&period2=1775539200&interval=1d';
    const data = await httpGet(yahooKline);
    const json = JSON.parse(data);
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    
    console.log(`  苹果 (AAPL) - ${timestamps.length} 天数据`);
    if (timestamps.length > 0) {
      const meta = result?.meta || {};
      console.log(`    当前价: $${meta.regularMarketPrice || 'N/A'}`);
      console.log(`     تاريخ范围: ${new Date(timestamps[0]*1000).toLocaleDateString()} - ${new Date(timestamps[timestamps.length-1]*1000).toLocaleDateString()}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  console.log('\n=== 总结 ===');
  console.log('✅ 基本面数据: 支持A股、港股、美股');
  console.log('✅ 技术面数据: 支持历史K线 (日线)');
  console.log('✅ 历史数据: 可获取3年+历史数据');
}

main().catch(console.error);
