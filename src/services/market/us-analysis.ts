/**
 * 美股分析服务
 * 
 * 提供美股数据分析、信号生成功能
 * 使用缓存减少 API 调用
 */

import { logger } from '../../utils/logger';
import { getUSStockQuoteWithCache, getUSStockKlineWithCache, getBatchUSQuotesWithCache, USStockQuote, USStockKline } from '../market/us-cache';

export interface USStockAnalysis {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
  confidence: number;  // 0-100
  reasons: string[];
  timestamp: number;
}

/**
 * 快速获取美股报价
 */
export async function getUSQuote(symbol: string) {
  return await getUSStockQuoteWithCache(symbol);
}

/**
 * 获取美股K线
 */
export async function getUSKline(symbol: string, period: string = 'daily', limit: number = 30) {
  return await getUSStockKlineWithCache(symbol, period, limit);
}

/**
 * 批量获取美股报价
 */
export async function getUSQuotes(symbols: string[]) {
  return await getBatchUSQuotesWithCache(symbols);
}

/**
 * 简单技术分析
 */
function simpleTechnicalAnalysis(klineData: any[]): { signal: string; reasons: string[] } {
  const reasons: string[] = [];
  
  if (klineData.length < 5) {
    return { signal: 'NEUTRAL', reasons: ['数据不足'] };
  }
  
  const recent = klineData.slice(-5);
  const prices = recent.map(k => k.close);
  const volumes = recent.map(k => k.volume);
  
  // 计算简单指标
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const currentPrice = prices[prices.length - 1];
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];
  
  // 均线判断
  if (currentPrice > avgPrice * 1.02) {
    reasons.push('价格高于均线，技术面偏多');
  } else if (currentPrice < avgPrice * 0.98) {
    reasons.push('价格低于均线，技术面偏空');
  }
  
  // 成交量判断
  if (currentVolume > avgVolume * 1.5) {
    reasons.push('成交量放大');
  }
  
  // 趋势判断
  const startPrice = prices[0];
  const priceChange = (currentPrice - startPrice) / startPrice * 100;
  
  if (priceChange > 5) {
    reasons.push(`近期上涨 ${priceChange.toFixed(1)}%`);
  } else if (priceChange < -5) {
    reasons.push(`近期下跌 ${priceChange.toFixed(1)}%`);
  }
  
  // 生成信号
  let signal = 'NEUTRAL';
  let score = 0;
  
  if (currentPrice > avgPrice * 1.02) score += 1;
  if (currentPrice < avgPrice * 0.98) score -= 1;
  if (currentVolume > avgVolume * 1.5) score += 0.5;
  if (priceChange > 5) score += 1;
  if (priceChange < -5) score -= 1;
  
  if (score >= 1.5) signal = 'BUY';
  else if (score <= -1.5) signal = 'SELL';
  else if (score >= 0.5) signal = 'HOLD';
  else if (score <= -0.5) signal = 'HOLD';
  
  return { signal, reasons };
}

/**
 * 综合分析单只美股
 */
export async function analyzeUSStock(symbol: string, name?: string): Promise<USStockAnalysis> {
  logger.info(`[USAnalysis] 分析: ${symbol}`);
  
  const reasons: string[] = [];
  let signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 50;
  
  try {
    // 1. 获取报价（带缓存）
    const quote = await getUSStockQuoteWithCache(symbol);
    if (!quote) {
      return {
        symbol,
        name: name || symbol,
        price: 0,
        changePercent: 0,
        volume: 0,
        signal: 'NEUTRAL',
        confidence: 0,
        reasons: ['无法获取数据'],
        timestamp: Date.now(),
      };
    }
    
    // 2. 基本面分析
    if (quote.changePercent > 3) {
      reasons.push(`今日涨幅 ${quote.changePercent.toFixed(1)}%`);
    } else if (quote.changePercent < -3) {
      reasons.push(`今日跌幅 ${quote.changePercent.toFixed(1)}%`);
    }
    
    if (quote.pe > 0 && quote.pe < 25) {
      reasons.push(`市盈率适中 (${quote.pe.toFixed(1)})`);
    } else if (quote.pe > 50) {
      reasons.push(`市盈率较高 (${quote.pe.toFixed(1)})`);
    }
    
    // 3. 获取K线进行技术分析
    const kline = await getUSStockKlineWithCache(symbol, 'daily', 30);
    if (kline && kline.data.length > 0) {
      const techResult = simpleTechnicalAnalysis(kline.data);
      reasons.push(...techResult.reasons);
      
      if (techResult.signal === 'BUY') signal = 'BUY';
      else if (techResult.signal === 'SELL') signal = 'SELL';
      else if (techResult.signal === 'HOLD') signal = 'HOLD';
    }
    
    // 4. 计算置信度
    confidence = 50;
    if (quote.changePercent > 5 || quote.changePercent < -5) confidence += 10;
    if (quote.volume > 50000000) confidence += 10;
    if (signal === 'BUY' || signal === 'SELL') confidence += 20;
    confidence = Math.min(confidence, 95);
    
    return {
      symbol,
      name: name || symbol,
      price: quote.price,
      changePercent: quote.changePercent,
      volume: quote.volume,
      signal,
      confidence,
      reasons,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`[USAnalysis] 分析失败: ${symbol}`, error);
    return {
      symbol,
      name: name || symbol,
      price: 0,
      changePercent: 0,
      volume: 0,
      signal: 'NEUTRAL',
      confidence: 0,
      reasons: ['分析失败'],
      timestamp: Date.now(),
    };
  }
}

/**
 * 批量分析美股
 */
export async function analyzeUSStocks(stocks: Array<{ symbol: string; name?: string }>): Promise<USStockAnalysis[]> {
  const results: USStockAnalysis[] = [];
  
  for (const stock of stocks) {
    const analysis = await analyzeUSStock(stock.symbol, stock.name);
    results.push(analysis);
  }
  
  // 按置信度排序
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

/**
 * 获取美股推荐
 */
export async function getUSStockRecommendations(): Promise<USStockAnalysis[]> {
  // 热门美股列表
  const hotStocks = [
    { symbol: 'AAPL', name: '苹果' },
    { symbol: 'MSFT', name: '微软' },
    { symbol: 'GOOGL', name: '谷歌' },
    { symbol: 'AMZN', name: '亚马逊' },
    { symbol: 'NVDA', name: '英伟达' },
    { symbol: 'TSLA', name: '特斯拉' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'NFLX', name: 'Netflix' },
  ];
  
  return await analyzeUSStocks(hotStocks);
}
