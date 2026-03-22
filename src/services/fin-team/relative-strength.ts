/**
 * 相对强度系统
 * 
 * 功能: 计算股票相对大盘的强度
 * 支持: A股、港股、美股
 */

import { getHistoryKLine } from '../../services/market/quote-service';

/**
 * 市场配置
 */
export interface MarketConfig {
  code: 'a' | 'hk' | 'us';
  name: string;
  indexCode: string;
  indexName: string;
}

/**
 * 市场配置列表 (可扩展)
 */
export const MARKET_CONFIGS: MarketConfig[] = [
  { code: 'us', name: '美股', indexCode: 'SPY', indexName: '标普500' },
  { code: 'hk', name: '港股', indexCode: 'HSI', indexName: '恒生指数' },
  { code: 'a', name: 'A股', indexCode: '000300', indexName: '沪深300' },
];

/**
 * 相对强度结果
 */
export interface RelativeStrength {
  stockCode: string;
  stockName?: string;
  market: string;
  
  // 涨幅数据
  stockReturn: number;    // 股票20日涨幅
  indexReturn: number;   // 大盘20日涨幅
  relativeStrength: number; // 相对强度 = 股票 - 大盘
  
  // 过滤结果
  passes: boolean;
  strengthLevel: 'strong' | 'neutral' | 'weak';
  
  // 附加信息
  trend: 'up' | 'down' | 'sideways';
}

/**
 * 获取市场配置
 */
export function getMarketConfig(code: 'a' | 'hk' | 'us'): MarketConfig {
  return MARKET_CONFIGS.find(m => m.code === code) || MARKET_CONFIGS[0];
}

/**
 * 计算相对强度
 */
export async function calculateRelativeStrength(
  stockCode: string,
  market: 'a' | 'hk' | 'us',
  period: number = 20
): Promise<RelativeStrength | null> {
  try {
    const config = getMarketConfig(market);
    
    // 获取股票数据
    const stockKlines = await getHistoryKLine(stockCode, market, '1d', '3mo');
    if (stockKlines.length < period) {
      return null;
    }
    
    // 获取大盘数据
    const indexKlines = await getHistoryKLine(config.indexCode, market, '1d', '3mo');
    if (indexKlines.length < period) {
      return null;
    }
    
    // 计算股票涨幅
    const stockCurrent = stockKlines[stockKlines.length - 1].close;
    const stockPast = stockKlines[stockKlines.length - period].close;
    const stockReturn = ((stockCurrent - stockPast) / stockPast) * 100;
    
    // 计算大盘涨幅
    const indexCurrent = indexKlines[indexKlines.length - 1].close;
    const indexPast = indexKlines[indexKlines.length - period].close;
    const indexReturn = ((indexCurrent - indexPast) / indexPast) * 100;
    
    // 相对强度
    const relativeStrength = stockReturn - indexReturn;
    
    // 判断强度等级
    let strengthLevel: RelativeStrength['strengthLevel'] = 'neutral';
    if (relativeStrength > 5) strengthLevel = 'strong';
    else if (relativeStrength < -3) strengthLevel = 'weak';
    
    // 判断趋势
    let trend: RelativeStrength['trend'] = 'sideways';
    const ma5 = stockKlines.slice(-5).reduce((sum, k) => sum + k.close, 0) / 5;
    const ma20 = stockKlines.slice(-20).reduce((sum, k) => sum + k.close, 0) / 20;
    if (ma5 > ma20 * 1.02) trend = 'up';
    else if (ma5 < ma20 * 0.98) trend = 'down';
    
    return {
      stockCode,
      market: config.name,
      stockReturn,
      indexReturn,
      relativeStrength,
      passes: relativeStrength > 0,
      strengthLevel,
      trend,
    };
    
  } catch (error) {
    console.error(`[RelativeStrength] 计算失败: ${stockCode}`, error);
    return null;
  }
}

/**
 * 批量计算相对强度
 */
export async function batchCalculateRelativeStrength(
  stocks: string[],
  market: 'a' | 'hk' | 'us',
  period: number = 20
): Promise<RelativeStrength[]> {
  const results: RelativeStrength[] = [];
  
  for (const stock of stocks) {
    const result = await calculateRelativeStrength(stock, market, period);
    if (result) {
      results.push(result);
    }
  }
  
  return results.sort((a, b) => b.relativeStrength - a.relativeStrength);
}

/**
 * 过滤强势股
 */
export function filterStrongStocks(
  results: RelativeStrength[],
  minRelativeStrength: number = 0
): RelativeStrength[] {
  return results
    .filter(r => r.relativeStrength > minRelativeStrength)
    .sort((a, b) => b.relativeStrength - a.relativeStrength);
}

export default {
  MARKET_CONFIGS,
  getMarketConfig,
  calculateRelativeStrength,
  batchCalculateRelativeStrength,
  filterStrongStocks,
};
