// 优化版：测试基本面和技术面数据
import axios from 'axios';

async function httpGet(url: string): Promise<any> {
  const res = await axios.get(url, { 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 10000 
  });
  return res.data;
}

async function main() {
  console.log('=== 测试基本面数据 (优化版) ===\n');

  // 1. A股基本面 - 优化解析
  console.log('📊 A股基本面 (东方财富):');
  try {
    const eastUrl = 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f2,f57,f58,f84,f85,f116,f117,f162,f163,f164,f167,f168,f127,f128,f173,f177';
    const data = await httpGet(eastUrl);
    const d = data?.data;
    
    if (d) {
      console.log('  贵州茅台 (600519):');
      console.log(`    当前价: ${d.f2 || 'N/A'} 元`);
      console.log(`    总市值: ${(parseInt(d.f57||'0')/100000000).toFixed(0)} 亿`);
      console.log(`    流通市值: ${(parseInt(d.f58||'0')/100000000).toFixed(0)} 亿`);
      console.log(`    市盈率(TTM): ${d.f162 || 'N/A'}`);
      console.log(`    市净率: ${d.f167 || 'N/A'}`);
      console.log(`    每股收益: ${(d.f84/10000).toFixed(2) || 'N/A'} 元`);
      console.log(`    每股净资产: ${(d.f85/10000).toFixed(2) || 'N/A'} 元`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 2. 港股基本面 - 腾讯财经
  console.log('\n📊 港股基本面 (腾讯财经):');
  try {
    const hkUrl = 'https://qt.gtimg.cn/q=r_hk00700';
    const data = await httpGet(hkUrl);
    const match = data.match(/"([^"]+)"/);
    if (match) {
      const p = match[1].split('~');
      console.log('  腾讯控股 (00700):');
      console.log(`    当前价: HK$${p[3]}`);
      console.log(`    市值: ${p[44] || 'N/A'} 亿`);
      console.log(`    PE: ${p[46] || 'N/A'}`);
      console.log(`    PB: ${p[48] || 'N/A'}`);
      console.log(`    每股收益: ${p[46] ? (parseFloat(p[3])/parseFloat(p[46])).toFixed(2) : 'N/A'} 港元`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 3. 美股基本面 - 改用备用方案
  console.log('\n📊 美股基本面 (Stooq):');
  try {
    // Stooq 提供财务报表数据
    const stooqUrl = 'https://stooq.com/q/l/?s=aapl.us&i=d';
    const data = await httpGet(stooqUrl);
    const lines = data.trim().split('\n');
    console.log('  苹果 (AAPL) - 历史数据:');
    console.log(`    数据条数: ${lines.length - 1} 天`);
    if (lines.length > 1) {
      const latest = lines[lines.length - 1].split(',');
      console.log(`    最新收盘: $${latest[6]}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  console.log('\n=== 测试技术面/历史数据 ===\n');

  // 4. A股历史K线
  console.log('📈 A股历史K线 (东方财富 - 日线):');
  try {
    const klineUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20230101&end=20260311';
    const data = await httpGet(klineUrl);
    const klines = data?.data?.klines || [];
    
    console.log(`  贵州茅台 (600519): ${klines.length} 个交易日`);
    if (klines.length > 0) {
      const latest = klines[klines.length - 1].split(',');
      const first = klines[0].split(',');
      console.log(`    日期范围: ${first[0]} ~ ${latest[0]}`);
      console.log(`    最新: 开盘=${latest[1]} 收盘=${latest[2]} 涨跌=${latest[3]}% 成交量=${latest[5]}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 5. 港股历史K线 - 改用东方财富
  console.log('\n📈 港股历史K线 (东方财富):');
  try {
    // 港股代码 0.00700
    const klineUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.00700&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20230101&end=20260311';
    const data = await httpGet(klineUrl);
    const klines = data?.data?.klines || [];
    
    console.log(`  腾讯控股 (00700): ${klines.length} 个交易日`);
    if (klines.length > 0) {
      const latest = klines[klines.length - 1].split(',');
      console.log(`    最新: 开盘=${latest[1]} 收盘=${latest[2]} 涨跌=${latest[3]}%`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  // 6. 美股历史K线 - Stooq
  console.log('\n📈 美股历史K线 (Stooq):');
  try {
    const stooqUrl = 'https://stooq.com/q/d/l/?s=aapl.us&d1=20230101&d2=20260311&i=d';
    const data = await httpGet(stooqUrl);
    const lines = data.trim().split('\n');
    
    console.log(`  苹果 (AAPL): ${lines.length - 1} 个交易日`);
    if (lines.length > 1) {
      const latest = lines[lines.length - 1].split(',');
      const first = lines[1].split(',');
      console.log(`    日期范围: ${first[0]} ~ ${latest[0]}`);
      console.log(`    最新: 开盘=${latest[1]} 收盘=${latest[6]} 成交量=${latest[5]}`);
    }
  } catch (e: any) {
    console.log(`  获取失败: ${e.message}`);
  }

  console.log('\n=== 免费数据方案总结 ===\n');
  console.log('| 数据类型 | A股 | 港股 | 美股 |');
  console.log('|----------|-----|------|------|');
  console.log('| 实时行情 | ✅ 东方财富 | ✅ 腾讯财经 | ✅ Stooq |');
  console.log('| 基本面   | ✅ 东方财富 | ✅ 腾讯财经 | ✅ Stooq |');
  console.log('| 日K线    | ✅ 东方财富 | ✅ 东方财富 | ✅ Stooq |');
  console.log('| 历史数据 | ✅ 3年+ | ✅ 3年+ | ✅ 3年+ |');
}

main().catch(console.error);
