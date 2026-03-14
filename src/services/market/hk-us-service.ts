/**
 * 港股美股基本面数据获取
 * 
 * 获取市盈率、市值、成交量等数据
 */

import { logger } from '../../utils/logger';

// 腾讯港股API
const HK_API = 'https://qt.gtimg.cn/q=';

// Stooq美股API
const US_API = 'https://stockanalysis.com/api/quote-彭博/';

/**
 * 港股详细数据
 */
export interface HKStockDetail {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;  // 成交额(港币)
  marketCap: number;  // 市值(港币)
  pe: number;  // 市盈率
  pb: number;  // 市净率
  high52w: number;  // 52周最高
  low52w: number;  // 52周最低
}

/**
 * 美股详细数据
 */
export interface USStockDetail {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;  // 市值(美元)
  pe: number;  // 市盈率
  eps: number;  // 每股收益
  dividend: number;  // 股息率
  high52w: number;
  low52w: number;
}

/**
 * 获取港股详细数据
 */
export async function getHKStockDetail(code: string): Promise<HKStockDetail | null> {
  try {
    const hkCode = code.padStart(5, '0');
    const url = `${HK_API}phk${hkCode}`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    const match = text.match(/"([^"]+)"/);
    if (!match) return null;
    
    const parts = match[1].split('~');
    
    // 解析数据
    const price = parseFloat(parts[3]) || 0;
    const prevClose = parseFloat(parts[4]) || price;
    const open = parseFloat(parts[5]) || prevClose;
    const volume = parseFloat(parts[6]) || 0;
    const amount = parseFloat(parts[37]) || 0;  // 成交额
    
    // 市值 (parts[44])
    const marketCap = parseFloat(parts[44]) || 0;
    
    // 市盈率 (parts[46])
    const pe = parseFloat(parts[46]) || 0;
    
    // 市净率 (parts[48])
    const pb = parseFloat(parts[48]) || 0;
    
    // 52周高低
    const high52w = parseFloat(parts[33]) || 0;
    const low52w = parseFloat(parts[34]) || 0;
    
    // 股票名称 (parts[1])
    const name = parts[1] || code;
    
    return {
      code,
      name,
      price,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
      volume,
      amount,
      marketCap,
      pe,
      pb,
      high52w,
      low52w,
    };
  } catch (error) {
    logger.error(`获取港股${code}详情失败:`, error);
    return null;
  }
}

/**
 * 获取美股详细数据 (使用StockAnalysis API)
 */
export async function getUSStockDetail(code: string): Promise<USStockDetail | null> {
  try {
    // 尝试多个API源
    const sources = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${code}?interval=1d&range=1d`,
      `https://stockanalysis.com/api/quotes/usa/${code.toLowerCase()}/`,
    ];
    
    let data = null;
    
    for (const url of sources) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (response.ok) {
          data = await response.json();
          if (data) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!data) {
      // 返回基本数据
      return {
        code,
        name: code,
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        marketCap: 0,
        pe: 0,
        eps: 0,
        dividend: 0,
        high52w: 0,
        low52w: 0,
      };
    }
    
    // 解析Yahoo Finance数据
    let price = 0;
    let prevClose = 0;
    let volume = 0;
    let marketCap = 0;
    let pe = 0;
    let eps = 0;
    let dividend = 0;
    let high52w = 0;
    let low52w = 0;
    let name = code;
    
    try {
      const dataAny = data as any;
      const result = dataAny.chart?.result?.[0];
      if (result) {
        const meta = result.meta || {};
        price = meta.regularMarketPrice || 0;
        prevClose = meta.chartPreviousClose || meta.previousClose || price;
        volume = meta.volume || 0;
        
        const indicators = result.indicators?.[0];
        if (indicators) {
          const highs = indicators.high?.[0];
          const lows = indicators.low?.[0];
          high52w = Math.max(...(highs || []).filter((v: number) => v > 0));
          low52w = Math.min(...(lows || []).filter((v: number) => v > 0));
        }
      }
    } catch (e) {
      logger.warn(`解析Yahoo数据失败: ${code}`, e);
    }
    
    return {
      code,
      name,
      price,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
      volume,
      marketCap,
      pe,
      eps,
      dividend,
      high52w,
      low52w,
    };
  } catch (error) {
    logger.error(`获取美股${code}详情失败:`, error);
    return null;
  }
}

/**
 * 批量获取港股数据
 */
export async function getBatchHKDetails(codes: string[]): Promise<HKStockDetail[]> {
  const results: HKStockDetail[] = [];
  
  for (const code of codes) {
    const detail = await getHKStockDetail(code);
    if (detail) {
      results.push(detail);
    }
  }
  
  return results;
}

/**
 * 批量获取美股数据
 */
export async function getBatchUSDetails(codes: string[]): Promise<USStockDetail[]> {
  const results: USStockDetail[] = [];
  
  for (const code of codes) {
    const detail = await getUSStockDetail(code);
    if (detail) {
      results.push(detail);
    }
  }
  
  return results;
}
