/**
 * 量化策略引擎
 * 
 * 支持多种策略：趋势/均值回归/突破/动量
 */

import { logger } from '../utils/logger';
import { getHistoryKLine, KLine } from '../services/market/quote-service';

/**
 * 策略信号
 */
export interface StrategySignal {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  signal: 'buy' | 'sell' | 'hold';
  strength: number;      // 0-100
  price: number;
  reason: string;
  timestamp: number;
  strategy: string;
}

/**
 * 策略参数
 */
export interface StrategyParams {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  period?: number;      // 周期
  threshold?: number;  // 阈值
}

// ==================== 策略实现 ====================

/**
 * 移动平均策略
 */
export async function maStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market, period = 20 } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
  
  if (klines.length < period) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'MA' };
  }
  
  // 计算MA
  const closes = klines.map((k: any) => k.close);
  const ma = closes.slice(-period).reduce((a: number, b: number) => a + b, 0) / period;
  const ma5 = closes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
  const currentPrice = closes[closes.length - 1];
  
  // 金叉/死叉
  if (ma5 > ma * 1.02) {
    return { symbol, market, signal: 'buy', strength: 70, price: currentPrice, reason: `MA5>MA${period} (金叉)`, timestamp: Date.now(), strategy: 'MA' };
  } else if (ma5 < ma * 0.98) {
    return { symbol, market, signal: 'sell', strength: 70, price: currentPrice, reason: `MA5<MA${period} (死叉)`, timestamp: Date.now(), strategy: 'MA' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: '均线纠缠', timestamp: Date.now(), strategy: 'MA' };
}

/**
 * RSI策略
 */
export async function rsiStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market, period = 14 } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
  
  if (klines.length < period + 1) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'RSI' };
  }
  
  const closes = klines.map((k: any) => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // 计算RSI
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const rs = gains / (losses || 1);
  const rsi = 100 - (100 / (1 + rs));
  
  if (rsi < 30) {
    return { symbol, market, signal: 'buy', strength: 80, price: currentPrice, reason: `RSI超卖(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
  } else if (rsi > 70) {
    return { symbol, market, signal: 'sell', strength: 80, price: currentPrice, reason: `RSI超买(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: `RSI中性(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
}

/**
 * 突破策略
 */
export async function breakoutStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market, threshold = 0.02 } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '1mo');
  
  if (klines.length < 20) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'Breakout' };
  }
  
  const closes = klines.map((k: any) => k.close);
  const highs = klines.map((k: any) => k.high);
  const currentPrice = closes[closes.length - 1];
  
  // 20日高点
  const high20 = Math.max(...highs.slice(-20, -1));
  
  if (currentPrice > high20 * (1 + threshold)) {
    return { symbol, market, signal: 'buy', strength: 75, price: currentPrice, reason: `突破20日高点`, timestamp: Date.now(), strategy: 'Breakout' };
  }
  
  // 20日低点
  const low20 = Math.min(...highs.slice(-20, -1));
  
  if (currentPrice < low20 * (1 - threshold)) {
    return { symbol, market, signal: 'sell', strength: 75, price: currentPrice, reason: `跌破20日低点`, timestamp: Date.now(), strategy: 'Breakout' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: '区间震荡', timestamp: Date.now(), strategy: 'Breakout' };
}

/**
 * 动量策略
 */
export async function momentumStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market, period = 10 } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
  
  if (klines.length < period + 1) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'Momentum' };
  }
  
  const closes = klines.map((k: any) => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // 动量 = 当前价 / N日前价 - 1
  const momentum = (currentPrice - closes[closes.length - period - 1]) / closes[closes.length - period - 1];
  
  if (momentum > 0.1) {
    return { symbol, market, signal: 'buy', strength: Math.min(90, Math.abs(momentum) * 100), price: currentPrice, reason: `动量向上${(momentum*100).toFixed(1)}%`, timestamp: Date.now(), strategy: 'Momentum' };
  } else if (momentum < -0.1) {
    return { symbol, market, signal: 'sell', strength: Math.min(90, Math.abs(momentum) * 100), price: currentPrice, reason: `动量向下${(momentum*100).toFixed(1)}%`, timestamp: Date.now(), strategy: 'Momentum' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: '动量中性', timestamp: Date.now(), strategy: 'Momentum' };
}

/**
 * 综合策略
 */
export async function combinedStrategy(params: StrategyParams): Promise<StrategySignal> {
  const signals = await Promise.all([
    maStrategy(params),
    rsiStrategy(params),
    breakoutStrategy(params),
    momentumStrategy(params),
  ]);
  
  // 统计投票
  let buyCount = 0, sellCount = 0, holdCount = 0;
  let totalStrength = 0;
  
  for (const s of signals) {
    if (s.signal === 'buy') { buyCount++; totalStrength += s.strength; }
    else if (s.signal === 'sell') { sellCount++; totalStrength += s.strength; }
    else holdCount++;
  }
  
  const currentPrice = signals[0].price;
  
  if (buyCount > sellCount && buyCount >= 2) {
    return { symbol: params.symbol, market: params.market, signal: 'buy', strength: totalStrength/4, price: currentPrice, reason: `${buyCount}个策略看多`, timestamp: Date.now(), strategy: 'Combined' };
  }
  
  if (sellCount > buyCount && sellCount >= 2) {
    return { symbol: params.symbol, market: params.market, signal: 'sell', strength: totalStrength/4, price: currentPrice, reason: `${sellCount}个策略看空`, timestamp: Date.now(), strategy: 'Combined' };
  }
  
  return { symbol: params.symbol, market: params.market, signal: 'hold', strength: 30, price: currentPrice, reason: '策略分歧', timestamp: Date.now(), strategy: 'Combined' };
}

/**
 * 批量扫描
 */
export async function scanSymbols(symbols: string[], market: 'a' | 'hk' | 'us'): Promise<StrategySignal[]> {
  const results: StrategySignal[] = [];
  
  for (const symbol of symbols) {
    try {
      const signal = await combinedStrategy({ symbol, market });
      if (signal.signal !== 'hold') {
        results.push(signal);
      }
    } catch (e) {
      logger.error(`[Strategy] 扫描${symbol}失败:`, e);
    }
  }
  
  // 按强度排序
  return results.sort((a, b) => b.strength - a.strength);
}
