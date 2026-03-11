/**
 * Alpha Vantage 数据源
 * 支持获取美股/港股历史 K 线数据
 * 免费 API: 25 requests/day (demo key)
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
}

export interface FetchOptions {
  symbol: string;
  market: 'hk' | 'us';
  startDate: Date;
  endDate: Date;
  interval?: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' | 'weekly' | 'monthly';
}

/**
 * 转换股票代码为 Alpha Vantage 格式
 */
function toAVSymbol(symbol: string, market: 'hk' | 'us'): string {
  if (market === 'hk') {
    // 港股需要特殊处理，使用 HKEX 格式或直接用代码
    // Alpha Vantage 对港股支持有限，尝试直接用代码
    return symbol;
  }
  // 美股直接使用
  return symbol.toUpperCase();
}

/**
 * 从 Alpha Vantage 获取历史 K 线
 */
export async function fetchHistoricalData(options: FetchOptions): Promise<KLine[]> {
  const { symbol, market, interval = 'daily' } = options;
  
  // 使用免费的 demo key，实际使用需要申请自己的 key
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
  
  const avSymbol = toAVSymbol(symbol, market);
  
  // Alpha Vantage endpoint
  const functionType = interval === 'daily' ? 'TIME_SERIES_DAILY' : 
                       interval === 'weekly' ? 'TIME_SERIES_WEEKLY' :
                       interval === 'monthly' ? 'TIME_SERIES_MONTHLY' : 'TIME_SERIES_INTRADAY';
  
  const params: any = {
    function: functionType,
    symbol: avSymbol,
    apikey: apiKey,
    outputsize: 'full',  // 获取完整数据
  };
  
  if (interval !== 'daily' && interval !== 'weekly' && interval !== 'monthly') {
    params.interval = interval;
  }
  
  // 港股特殊处理：尝试使用 TIME_SERIES_DAILY_ADJUSTED
  if (market === 'hk') {
    params.function = 'TIME_SERIES_DAILY_ADJUSTED';
  }
  
  try {
    logger.info(`Fetching ${avSymbol} data from Alpha Vantage`);
    
    const response = await axios.get('https://www.alphavantage.co/query', { 
      params, 
      timeout: 30000 
    });
    
    const data = response.data;
    
    // 检查错误
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }
    if (data['Note']) {
      throw new Error(`API Rate limit: ${data['Note']}`);
    }
    
    // 获取时间序列数据
    const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
    if (!timeSeriesKey) {
      throw new Error('No time series data returned');
    }
    
    const timeSeries = data[timeSeriesKey] as Record<string, any>;
    const dates = Object.keys(timeSeries).sort(); // 按日期排序
    
    const kLines: KLine[] = dates.map(date => {
      const point = timeSeries[date];
      return {
        date: new Date(date),
        open: parseFloat(point['1. open'] || point['1. open']),
        high: parseFloat(point['2. high'] || point['2. high']),
        low: parseFloat(point['3. low'] || point['3. low']),
        close: parseFloat(point['4. close'] || point['4. close']),
        volume: parseInt(point['5. volume'] || point['5. volume']),
      };
    });
    
    logger.info(`Fetched ${kLines.length} K-lines for ${avSymbol}`);
    return kLines;
    
  } catch (error: any) {
    logger.error(`Failed to fetch data for ${avSymbol}:`, error.message);
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
  
  // Alpha Vantage 免费版只返回最近 100 天，所以这里做个限制
  const actualStartDate = new Date();
  actualStartDate.setDate(actualStartDate.getDate() - 100); // 免费版限制
  
  return fetchHistoricalData({ 
    symbol, 
    market, 
    startDate: actualStartDate, 
    endDate,
    interval: 'daily'
  });
}
