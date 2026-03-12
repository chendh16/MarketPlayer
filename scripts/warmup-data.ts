#!/usr/bin/env node

/**
 * 数据预热脚本
 * 批量获取并缓存历史K线数据
 */

import { saveKlinesToCache, getCacheStats, listAllCache, cleanExpiredCache } from '../src/services/data/cache';
import axios from 'axios';

const STOCKS = [
  // 美股
  { symbol: 'AAPL', market: 'us' },
  { symbol: 'MSFT', market: 'us' },
  { symbol: 'GOOGL', market: 'us' },
  { symbol: 'AMZN', market: 'us' },
  { symbol: 'META', market: 'us' },
  { symbol: 'NVDA', market: 'us' },
  { symbol: 'TSLA', market: 'us' },
  { symbol: 'AVGO', market: 'us' },
  { symbol: 'COST', market: 'us' },
  { symbol: 'NFLX', market: 'us' },
  // A股
  { symbol: '600519', market: 'a' },
  { symbol: '000001', market: 'a' },
  { symbol: '600036', market: 'a' },
  { symbol: '300750', market: 'a' },
  { symbol: '000858', market: 'a' },
  // 港股
  { symbol: '00700', market: 'hk' },
  { symbol: '09988', market: 'hk' },
  { symbol: '02318', market: 'hk' },
];

async function fetchUSKlines(symbol: string, days: number = 1000): Promise<any[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const url = `https://stooq.com/q/d/l/?s=${symbol.toUpperCase()}.US&d1=${start.toISOString().slice(0,10).replace(/-/g,'')}&d2=${end.toISOString().slice(0,10).replace(/-/g,'')}&i=d`;
  try {
    const res = await axios.get(url, { timeout: 30000 });
    return res.data.trim().split('\n').slice(1)
      .filter(l => l.trim())
      .map(l => { const p = l.split(','); return { date: p[0], open: parseFloat(p[1]), high: parseFloat(p[2]), low: parseFloat(p[3]), close: parseFloat(p[4]), volume: parseInt(p[5]) }; })
      .filter(k => !isNaN(k.close));
  } catch(e) {
    console.error(`获取失败 ${symbol}:`, e.message);
    return [];
  }
}

async function fetchAKlines(symbol: string, days: number = 1000): Promise<any[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const secid = symbol.startsWith('6') ? '1.' : '0.';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}${symbol}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${start.toISOString().slice(0,10).replace(/-/g,'')}&end=${end.toISOString().slice(0,10).replace(/-/g,'')}`;
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const klines = res.data?.data?.klines || [];
    return klines.map((k: string) => {
      const p = k.split(',');
      return { date: p[0], open: parseFloat(p[1]), high: parseFloat(p[2]), low: parseFloat(p[3]), close: parseFloat(p[4]), volume: parseInt(p[5]) };
    });
  } catch(e) {
    console.error(`获取失败 ${symbol}:`, e.message);
    return [];
  }
}

async function fetchQTFWKlines(symbol: string, days: number = 1000): Promise<any[]> {
  // 港股使用腾讯财经API
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  // 港股代码转换
  const hkCode = symbol.padStart(5, '0');
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hk${hkCode},day,,,${days},qfqa`;
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const klines = res.data?.data?.[`hk${symbol}`]?.qfqday || [];
    return klines.map((k: string[]) => ({
      date: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseInt(k[5]) || 0
    }));
  } catch(e) {
    console.error(`获取失败 ${symbol}:`, e.message);
    return [];
  }
}

async function warmup() {
  console.log('========================================');
  console.log('   数据预热 - 批量获取历史K线');
  console.log('========================================\n');
  
  // 显示当前缓存状态
  const stats = getCacheStats();
  console.log('当前缓存状态:');
  console.log(`  文件数: ${stats.totalFiles}`);
  console.log(`  总K线: ${stats.totalKLines}`);
  console.log(`  范围: ${stats.oldest} ~ ${stats.newest}\n`);
  
  // 清理过期缓存 (7天)
  console.log('清理过期缓存...');
  cleanExpiredCache(168);
  
  // 批量获取
  console.log(`\n开始获取 ${STOCKS.length} 个标的...\n`);
  
  let success = 0, failed = 0;
  
  for (const stock of STOCKS) {
    process.stdout.write(`  ${stock.market}/${stock.symbol}... `);
    
    try {
      let klines: any[] = [];
      
      if (stock.market === 'us') {
        klines = await fetchUSKlines(stock.symbol);
      } else if (stock.market === 'a') {
        klines = await fetchAKlines(stock.symbol);
      } else if (stock.market === 'hk') {
        klines = await fetchQTFWKlines(stock.symbol);
      }
      
      if (klines.length > 0) {
        saveKlinesToCache(stock.symbol, stock.market, klines);
        console.log(`✅ ${klines.length}条`);
        success++;
      } else {
        console.log(`⚠️ 无数据`);
        failed++;
      }
      
      // 避免请求过快
      await new Promise(r => setTimeout(r, 500));
      
    } catch(e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }
  }
  
  // 最终统计
  console.log('\n========================================');
  console.log(`完成! 成功: ${success}, 失败: ${failed}`);
  
  const finalStats = getCacheStats();
  console.log('\n最终缓存状态:');
  console.log(`  文件数: ${finalStats.totalFiles}`);
  console.log(`  总K线: ${finalStats.totalKLines}`);
  console.log(`  范围: ${finalStats.oldest} ~ ${finalStats.newest}`);
  console.log('========================================\n');
}

warmup().catch(console.error);
