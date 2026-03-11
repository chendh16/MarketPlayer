/**
 * Yahoo Finance 数据源
 * 支持获取港股、美股历史 K 线数据
 */

import axios from 'axios';
import { logger } from '../../../utils/logger';

export interface KLine {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface FetchOptions {
  symbol: string;
  market: 'hk' | 'us';
  startDate: Date;
  endDate: Date;
  interval?: '1d' | '1wk' | '1mo';
}

/**
 * 转换股票代码为 Yahoo Finance 格式
 */
function toYahooSymbol(symbol: string, market: 'hk' | 'us'): string {
  if (market === 'hk') {
    // 港股: 00700 -> 0700.HK
    const code = symbol.padStart(4, '0');
    return `${code}.HK`;
  }
  // 美股: 直接使用
  return symbol.toUpperCase();
}

/**
 * 从 Yahoo Finance 获取历史 K 线
 */
export async function fetchHistoricalData(options: FetchOptions): Promise<KLine[]> {
  const { symbol, market, startDate, endDate, interval = '1d' } = options;
  
  const yahooSymbol = toYahooSymbol(symbol, market);
  
  // Yahoo Finance API 参数
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
  const params = {
    period1,
    period2,
    interval,
    events: 'history',
  };
  
  try {
    logger.info(`Fetching ${yahooSymbol} data from Yahoo Finance`);
    
    const response = await axios.get(url, { params, timeout: 30000 });
    const data = response.data;
    
    if (data.chart.error) {
      throw new Error(data.chart.error.description || 'Unknown error');
    }
    
    const result = data.chart.result[0];
    if (!result) {
      throw new Error('No data returned');
    }
    
    const timestamps = result.timestamp as number[];
    const quotes = result.indicators.quote[0];
    const adjClose = result.indicators.adjclose?.[0]?.adjclose;
    
    const kLines: KLine[] = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000),
      open: quotes.open[i],
      high: quotes.high[i],
      low: quotes.low[i],
      close: quotes.close[i],
      volume: quotes.volume[i],
      adjustedClose: adjClose ? adjClose[i] : undefined,
    })).filter(k => k.close !== null);
    
    logger.info(`Fetched ${kLines.length} K-lines for ${yahooSymbol}`);
    return kLines;
    
  } catch (error) {
    logger.error(`Failed to fetch data for ${yahooSymbol}:`, error);
    throw error;
  }
}

/**
 * 获取单只股票最近 N 年的数据
 */
export async function fetchRecentYears(
  symbol: string,
  market: 'hk' | 'us',
  years: number = 3
): Promise<KLine[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  
  return fetchHistoricalData({ symbol, market, startDate, endDate });
}
