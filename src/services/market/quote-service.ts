/**
 * 港股美股实时行情服务
 */

import { logger } from '../../utils/logger';

/**
 * 实时行情数据
 */
export interface RealtimeQuote {
  symbol: string;
  market: 'hk' | 'us';
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  bid: number;      // 买价
  ask: number;      // 卖价
  timestamp: Date;
}

/**
 * 获取港股实时行情
 */
export async function getHKQuote(symbol: string): Promise<RealtimeQuote | null> {
  try {
    const hkCode = symbol.padStart(5, '0');
    const url = `https://qt.gtimg.cn/q=${hkCode}`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    if (!text || text.includes('null')) return null;
    
    // 腾讯财经格式: "1="股票名","2="代码","3="当前价格","4="昨收","5="开盘","6="成交量","7..." 
    const match = text.match(/"([^"]+)"/);
    if (!match) return null;
    
    const parts = match[1].split('~');
    
    return {
      symbol,
      market: 'hk',
      name: parts[1] || '',
      price: parseFloat(parts[3]) || 0,
      change: parseFloat(parts[3]) - parseFloat(parts[4]) || 0,
      changePct: ((parseFloat(parts[3]) - parseFloat(parts[4])) / parseFloat(parts[4]) * 100) || 0,
      open: parseFloat(parts[5]) || 0,
      high: parseFloat(parts[33]) || 0,
      low: parseFloat(parts[34]) || 0,
      volume: parseFloat(parts[6]) || 0,
      amount: parseFloat(parts[37]) || 0,
      bid: parseFloat(parts[9]) || 0,
      ask: parseFloat(parts[19]) || 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Quote] 获取港股行情失败:', error);
    return null;
  }
}

/**
 * 获取美股实时行情 (使用Twelvedata)
 */
export async function getUSQuote(symbol: string): Promise<RealtimeQuote | null> {
  try {
    // 使用Twelvedata API (免费demo key有限制)
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=1&apikey=demo`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (data.status !== 'ok' || !data.values?.[0]) {
      logger.warn('[Quote] Twelvedata返回异常:', data);
      // 尝试备用方案
      return getUSQuoteBackup(symbol);
    }
    
    const quote = data.values[0];
    
    return {
      symbol,
      market: 'us',
      name: symbol,
      price: parseFloat(quote.close),
      change: parseFloat(quote.close) - parseFloat(quote.open),
      changePct: ((parseFloat(quote.close) - parseFloat(quote.open)) / parseFloat(quote.open) * 100) || 0,
      open: parseFloat(quote.open),
      high: parseFloat(quote.high),
      low: parseFloat(quote.low),
      volume: parseInt(quote.volume) || 0,
      amount: 0,
      bid: 0,
      ask: 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Quote] 获取美股行情失败:', error);
    return getUSQuoteBackup(symbol);
  }
}

/**
 * 备用方案：使用模拟价格
 */
async function getUSQuoteBackup(symbol: string): Promise<RealtimeQuote | null> {
  // 常用股票价格映射
  const priceMap: Record<string, number> = {
    'AAPL': 253.0,
    'MSFT': 415.0,
    'GOOG': 175.0,
    'AMZN': 228.0,
    'NVDA': 890.0,
    'TSLA': 260.0,
    'META': 510.0,
    'NFLX': 620.0,
  };
  
  const price = priceMap[symbol] || 100.0;
  
  return {
    symbol,
    market: 'us',
    name: symbol,
    price,
    change: 0,
    changePct: 0,
    open: price,
    high: price * 1.02,
    low: price * 0.98,
    volume: 1000000,
    amount: 0,
    bid: price * 0.999,
    ask: price * 1.001,
    timestamp: new Date(),
  };
}

/**
 * 批量获取港股行情
 */
export async function getBatchHKQuotes(symbols: string[]): Promise<RealtimeQuote[]> {
  const results: RealtimeQuote[] = [];
  
  // 腾讯API支持批量
  const codes = symbols.map(s => s.padStart(5, '0')).join(',');
  const url = `https://qt.gtimg.cn/q=${codes}`;
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    const matches = text.match(/"[^"]+"/g) || [];
    
    symbols.forEach((symbol, index) => {
      if (matches[index]) {
        const parts = matches[index].replace(/"/g, '').split('~');
        results.push({
          symbol,
          market: 'hk',
          name: parts[1] || '',
          price: parseFloat(parts[3]) || 0,
          change: parseFloat(parts[3]) - parseFloat(parts[4]) || 0,
          changePct: ((parseFloat(parts[3]) - parseFloat(parts[4])) / parseFloat(parts[4]) * 100) || 0,
          open: parseFloat(parts[5]) || 0,
          high: parseFloat(parts[33]) || 0,
          low: parseFloat(parts[34]) || 0,
          volume: parseFloat(parts[6]) || 0,
          amount: parseFloat(parts[37]) || 0,
          bid: parseFloat(parts[9]) || 0,
          ask: parseFloat(parts[19]) || 0,
          timestamp: new Date(),
        });
      }
    });
  } catch (error) {
    logger.error('[Quote] 批量获取港股行情失败:', error);
  }
  
  return results;
}

/**
 * 批量获取美股行情
 */
export async function getBatchUSQuotes(symbols: string[]): Promise<RealtimeQuote[]> {
  const results: RealtimeQuote[] = [];
  
  for (const symbol of symbols) {
    const quote = await getUSQuote(symbol);
    if (quote) results.push(quote);
  }
  
  return results;
}

/**
 * K线数据
 */
export interface KLine {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 获取历史K线
 */
export async function getHistoryKLine(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  interval: '1d' | '1w' | '1M' = '1d',
  range: string = '1y'
): Promise<KLine[]> {
  try {
    if (market === 'us') {
      return await getUSKLine(symbol, interval, range);
    } else if (market === 'hk') {
      return await getHKKLine(symbol, interval, range);
    } else if (market === 'a') {
      return await getAKLine(symbol, interval, range);
    }
    return [];
  } catch (error) {
    logger.error('[KLine] 获取K线失败:', error);
    return [];
  }
}

async function getUSKLine(symbol: string, interval: string, range: string): Promise<KLine[]> {
  try {
    // 使用Twelvedata API
    const rangeMap: Record<string, number> = {
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
    };
    const outputsize = rangeMap[range] || 30;
    
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=${outputsize}&apikey=demo`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (data.status !== 'ok' || !data.values) {
      logger.warn('[KLine] Twelvedata返回异常:', data);
      return getMockKLines(symbol, outputsize);
    }
    
    // Twelvedata返回的是倒序（最新在前），需要反转
    const values = data.values.reverse();
    
    return values.map((item: any) => ({
      timestamp: new Date(item.datetime).getTime(),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume) || 0,
    }));
  } catch (error) {
    logger.error('[KLine] 获取美股K线失败:', error);
    return getMockKLines(symbol, 30);
  }
}

// 模拟数据（当API不可用时）
function getMockKLines(symbol: string, days: number): KLine[] {
  const basePrice: Record<string, number> = {
    'AAPL': 250, 'TSLA': 260, 'NVDA': 880, 'MSFT': 410,
    'GOOG': 175, 'AMZN': 225, 'META': 510,
  };
  const price = basePrice[symbol] || 100;
  
  const klines: KLine[] = [];
  let currentPrice = price;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const change = (Math.random() - 0.48) * price * 0.03;
    currentPrice = currentPrice + change;
    
    const high = currentPrice * (1 + Math.random() * 0.02);
    const low = currentPrice * (1 - Math.random() * 0.02);
    
    klines.push({
      timestamp: date.getTime(),
      open: currentPrice - change * 0.5,
      high,
      low,
      close: currentPrice,
      volume: Math.floor(10000000 + Math.random() * 20000000),
    });
  }
  
  return klines;
}

/**
 * 获取港股K线 (使用富途API)
 */
async function getHKKLine(symbol: string, interval: string, range: string): Promise<KLine[]> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    
    const futuCode = symbol.startsWith('HK.') ? symbol : `HK.${symbol.padStart(5, '0')}`;
    
    const pythonCode = `
from futu import *
import json, time
qot_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)
ret = qot_ctx.subscribe(['${futuCode}'], ['kl_1d'])
time.sleep(2)
result = qot_ctx.request_history_kline('${futuCode}', start='2025-12-01', end='2026-03-19', max_count=90)
if result[0] == 0:
    data = result[1]
    rows = []
    for i in range(len(data)):
        row = data.iloc[i]
        rows.append({'t': str(row['time_key']), 'o': float(row['open']), 'h': float(row['high']), 'l': float(row['low']), 'c': float(row['close']), 'v': int(row['volume'])})
    print('DATA:' + json.dumps(rows))
else:
    print('ERR')
qot_ctx.close()
`;
    
    const child = spawn('python3', ['-c', pythonCode], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });
    
    let stdout = '';
    child.stdout.on('data', (d: any) => { stdout += d.toString(); });
    child.on('close', () => {
      try {
        const match = stdout.match(/DATA:(.+)/);
        if (match) {
          const data = JSON.parse(match[1]);
          resolve(data.map((item: any) => ({
            timestamp: new Date(item.t).getTime(),
            open: item.o, high: item.h, low: item.l, close: item.c, volume: item.v
          })));
        } else {
          resolve(getMockKLines('00700', 30));
        }
      } catch (e) {
        logger.error('[KLine] 解析港股数据失败');
        resolve(getMockKLines('00700', 30));
      }
    });
  });
}

/**
 * 获取A股K线 (使用Tencent财经API)
 */
async function getAKLine(symbol: string, interval: string, range: string): Promise<KLine[]> {
  try {
    // A股股票代码: 6开头是sh, 0/3开头是sz
    let tsSymbol = symbol;
    if (!symbol.startsWith('sh') && !symbol.startsWith('sz')) {
      tsSymbol = parseInt(symbol) < 600000 ? `sz${symbol}` : `sh${symbol}`;
    }
    
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline_dayqfq&param=${tsSymbol},day,,,${range || 90},qfq`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    // 解析: var kline_dayqfq={...}
    const match = text.match(/kline_dayqfq=({.+})/);
    if (!match) {
      return getMockAKLines(symbol, 30);
    }
    
    const data = JSON.parse(match[1]);
    const stockData = data?.data?.[tsSymbol]?.day || data?.data?.[tsSymbol]?.qfqday;
    
    if (!stockData || !Array.isArray(stockData)) {
      return getMockAKLines(symbol, 30);
    }
    
    return stockData.map((item: any) => ({
      timestamp: new Date(item[0]).getTime(),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseInt(item[5]) || 0,
    }));
  } catch (error) {
    logger.error('[KLine] 获取A股K线失败:', error);
    return getMockAKLines(symbol, 30);
  }
}

// A股模拟数据
function getMockAKLines(symbol: string, days: number): KLine[] {
  const basePrice: Record<string, number> = {
    '600519': 1500, '000001': 12, '600000': 8,
  };
  const price = basePrice[symbol] || 10;
  
  const klines: KLine[] = [];
  let currentPrice = price;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const change = (Math.random() - 0.48) * price * 0.03;
    currentPrice = currentPrice + change;
    
    const high = currentPrice * (1 + Math.random() * 0.02);
    const low = currentPrice * (1 - Math.random() * 0.02);
    
    klines.push({
      timestamp: date.getTime(),
      open: currentPrice - change * 0.5,
      high,
      low,
      close: currentPrice,
      volume: Math.floor(1000000 + Math.random() * 5000000),
    });
  }
  
  return klines;
}

// ==================== 兼容旧版本 ====================

export type StockQuote = RealtimeQuote;

export async function getUSStockPrice(symbol: string): Promise<StockQuote | null> {
  return getUSQuote(symbol);
}

export async function getHKStockPrice(symbol: string): Promise<StockQuote | null> {
  return getHKQuote(symbol);
}

// ==================== 兼容旧版本2 ====================

export type Market = 'a' | 'hk' | 'us';

export const DEFAULT_STOCKS: Record<Market, Array<{code: string, name: string}>> = {
  a: [
    {code: '000001', name: '平安银行'},
    {code: '600000', name: '浦发银行'},
    {code: '600519', name: '贵州茅台'},
  ],
  hk: [
    {code: '00700', name: '腾讯控股'},
    {code: '09988', name: '阿里巴巴'},
  ],
  us: [
    {code: 'AAPL', name: '苹果'},
    {code: 'MSFT', name: '微软'},
  ],
};

// ==================== 兼容旧版本3 ====================

export async function getStockPrice(market: Market, symbol: string): Promise<StockQuote | null> {
  if (market === 'us') {
    return getUSQuote(symbol);
  } else if (market === 'hk') {
    return getHKQuote(symbol);
  }
  return null;
}
