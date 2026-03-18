/**
 * 美股数据缓存服务
 * 
 * 使用 Redis 缓存美股数据，减少 API 调用次数
 * 缓存时间：K线 5分钟，报价 1分钟，新闻 15分钟
 */

import { redisClient } from '../../db/redis';
import { logger } from '../../utils/logger';
import { config } from '../../config';

// 内存缓存后备（Redis 不可用时使用）
const memoryCache = new Map<string, { data: any; expire: number }>();

function getMemoryCache(key: string): any | null {
  const item = memoryCache.get(key);
  if (item && item.expire > Date.now()) {
    return item.data;
  }
  memoryCache.delete(key);
  return null;
}

function setMemoryCache(key: string, data: any, ttlSeconds: number): void {
  memoryCache.set(key, { data, expire: Date.now() + ttlSeconds * 1000 });
}

const CACHE_TTL = {
  KLINE: 300,      // 5分钟
  QUOTE: 60,       // 1分钟  
  NEWS: 900,      // 15分钟
  DETAIL: 3600,    // 1小时
};

export interface USStockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  pe: number;
  high52w: number;
  low52w: number;
  timestamp: number;
}

export interface USStockKline {
  symbol: string;
  period: string;
  data: any[];
  timestamp: number;
}

/**
 * 获取缓存的报价
 */
export async function getCachedUSQuote(symbol: string): Promise<USStockQuote | null> {
  try {
    const key = `us:quote:${symbol.toUpperCase()}`;
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    logger.error('[USCache] getCachedQuote error:', e);
  }
  return null;
}

/**
 * 设置报价缓存
 */
export async function setCachedUSQuote(symbol: string, data: USStockQuote): Promise<void> {
  try {
    const key = `us:quote:${symbol.toUpperCase()}`;
    await redisClient.setEx(key, CACHE_TTL.QUOTE, JSON.stringify(data));
  } catch (e) {
    logger.error('[USCache] setCachedQuote error:', e);
  }
}

/**
 * 获取缓存的K线
 */
export async function getCachedUSKline(symbol: string, period: string): Promise<USStockKline | null> {
  try {
    const key = `us:kline:${symbol.toUpperCase()}:${period}`;
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    logger.error('[USCache] getCachedKline error:', e);
  }
  return null;
}

/**
 * 设置K线缓存
 */
export async function setCachedUSKline(symbol: string, period: string, data: USStockKline): Promise<void> {
  try {
    const key = `us:kline:${symbol.toUpperCase()}:${period}`;
    await redisClient.setEx(key, CACHE_TTL.KLINE, JSON.stringify(data));
  } catch (e) {
    logger.error('[USCache] setCachedKline error:', e);
  }
}

/**
 * 获取美股报价（带缓存）
 */
export async function getUSStockQuoteWithCache(symbol: string): Promise<USStockQuote | null> {
  // 先尝试缓存
  const cached = await getCachedUSQuote(symbol);
  if (cached) {
    logger.info(`[USCache] 使用缓存: ${symbol}`);
    return cached;
  }
  
  // 缓存未命中，从 API 获取
  try {
    const apiKey = config.ALPHA_VANTAGE_API_KEY;
    if (!apiKey || apiKey === 'your_key') {
      return null;
    }
    
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    const quote = data['Global Quote'];
    
    if (!quote || Object.keys(quote).length === 0) {
      return null;
    }
    
    const result: USStockQuote = {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']) || 0,
      change: parseFloat(quote['09. change']) || 0,
      changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
      volume: parseInt(quote['06. volume']) || 0,
      marketCap: parseFloat(quote['08. market cap']) || 0,
      pe: parseFloat(quote['08. PE ratio (TTM)']) || 0,
      high52w: 0,
      low52w: 0,
      timestamp: Date.now(),
    };
    
    // 存入缓存
    await setCachedUSQuote(symbol, result);
    logger.info(`[USCache] 获取新数据: ${symbol}`);
    
    return result;
  } catch (e) {
    logger.error('[USCache] getUSStockQuoteWithCache error:', e);
    return null;
  }
}

/**
 * 获取美股K线（带缓存）
 */
export async function getUSStockKlineWithCache(symbol: string, period: string = 'daily', limit: number = 30): Promise<USStockKline | null> {
  // 先尝试缓存
  const cached = await getCachedUSKline(symbol, period);
  if (cached) {
    logger.info(`[USCache] 使用K线缓存: ${symbol} ${period}`);
    return cached;
  }
  
  // 缓存未命中，从 API 获取
  try {
    const apiKey = config.ALPHA_VANTAGE_API_KEY;
    if (!apiKey || apiKey === 'your_key') {
      return null;
    }
    
    const func = period === 'daily' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
    const url = `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&apikey=${apiKey}${period !== 'daily' ? `&interval=${period}` : ''}`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    const timeKey = data['Meta Data']?.['3. Last Refreshed'] ? 'Time Series (Daily)' : null;
    if (!timeKey || !data[timeKey]) {
      return null;
    }
    
    const timeSeries = data[timeKey];
    const klineData = Object.entries(timeSeries)
      .slice(0, limit)
      .map(([date, values]: [string, any]) => ({
        time: date,
        open: parseFloat(values['1. open']) || 0,
        high: parseFloat(values['2. high']) || 0,
        low: parseFloat(values['3. low']) || 0,
        close: parseFloat(values['4. close']) || 0,
        volume: parseInt(values['5. volume']) || 0,
      })).reverse();
    
    const result: USStockKline = {
      symbol,
      period,
      data: klineData,
      timestamp: Date.now(),
    };
    
    // 存入缓存
    await setCachedUSKline(symbol, period, result);
    logger.info(`[USCache] 获取新K线: ${symbol} ${period}`);
    
    return result;
  } catch (e) {
    logger.error('[USCache] getUSStockKlineWithCache error:', e);
    return null;
  }
}

/**
 * 批量获取美股报价（带缓存）
 */
export async function getBatchUSQuotesWithCache(symbols: string[]): Promise<USStockQuote[]> {
  const results: USStockQuote[] = [];
  
  for (const symbol of symbols) {
    const quote = await getUSStockQuoteWithCache(symbol);
    if (quote) {
      results.push(quote);
    }
  }
  
  return results;
}
