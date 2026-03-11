/**
 * 模拟数据源 - 用于测试和演示
 * 生成符合真实市场特征的模拟 K 线数据
 */

import { KLine } from './types';

interface MockOptions {
  symbol: string;
  market: 'hk' | 'us';
  startDate: Date;
  endDate: Date;
  basePrice?: number;
  volatility?: number;
  trend?: number;  // 趋势：-0.001 ~ 0.001 每天
}

/**
 * 生成模拟 K 线数据
 */
export function generateMockData(options: MockOptions): KLine[] {
  const { 
    symbol, 
    startDate, 
    endDate, 
    basePrice = 100,
    volatility = 0.02,  // 2% 日波动
    trend = 0.0005     // 轻微上涨趋势
  } = options;
  
  const kLines: KLine[] = [];
  let currentPrice = basePrice;
  
  // 遍历每一天
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    // 跳过周末
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // 生成 OHLC
      const change = (Math.random() - 0.5) * 2 * volatility + trend;
      const open = currentPrice;
      const close = open * (1 + change);
      
      // 高低价基于波动
      const highExtra = Math.random() * volatility * 0.5;
      const lowExtra = Math.random() * volatility * 0.5;
      
      const high = Math.max(open, close) * (1 + highExtra);
      const low = Math.min(open, close) * (1 - lowExtra);
      
      // 成交量随机
      const volume = Math.floor(1000000 + Math.random() * 5000000);
      
      kLines.push({
        date: new Date(currentDate),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });
      
      currentPrice = close;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return kLines;
}

/**
 * 获取模拟历史数据
 */
export async function fetchRecentYears(
  symbol: string,
  market: 'hk' | 'us',
  years: number = 3
): Promise<KLine[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  
  // 根据市场设置不同的基准价和波动率
  const marketConfig: Record<string, { basePrice: number; volatility: number; trend: number }> = {
    'us': { basePrice: 150, volatility: 0.025, trend: 0.0003 },
    'hk': { basePrice: 350, volatility: 0.03, trend: 0.0001 },
  };
  
  const config = marketConfig[market] || marketConfig['us'];
  
  return generateMockData({
    symbol,
    market,
    startDate,
    endDate,
    ...config,
  });
}
