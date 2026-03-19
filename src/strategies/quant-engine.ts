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
 * RSI交叉策略
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
  
  // RSI交叉策略：上穿30买入，下穿70卖出
  const prevRSI = calculatePrevRSI(closes, period, 1);
  
  if (prevRSI !== null) {
    // 金叉：RSI从30以下上穿
    if (prevRSI < 30 && rsi >= 30) {
      return { symbol, market, signal: 'buy', strength: 85, price: currentPrice, reason: `RSI金叉(${prevRSI.toFixed(0)}→${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
    }
    // 死叉：RSI从70以上下穿
    if (prevRSI > 70 && rsi <= 70) {
      return { symbol, market, signal: 'sell', strength: 85, price: currentPrice, reason: `RSI死叉(${prevRSI.toFixed(0)}→${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
    }
  }
  
  if (rsi < 30) {
    return { symbol, market, signal: 'buy', strength: 70, price: currentPrice, reason: `RSI超卖(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
  } else if (rsi > 70) {
    return { symbol, market, signal: 'sell', strength: 70, price: currentPrice, reason: `RSI超买(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: `RSI中性(${rsi.toFixed(0)})`, timestamp: Date.now(), strategy: 'RSI' };
}

function calculatePrevRSI(closes: number[], period: number, offset: number): number | null {
  if (closes.length < period + offset + 1) return null;
  
  let gains = 0, losses = 0;
  const startIdx = closes.length - period - offset;
  for (let i = startIdx; i < startIdx + period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

/**
 * MACD金叉死叉策略
 */
export async function macdStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '6mo');
  
  if (klines.length < 34) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'MACD' };
  }
  
  const closes = klines.map((k: any) => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // 计算MACD
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const ema9 = calculateEMA(closes.slice(-34), 9);
  
  if (!ema12 || !ema26 || !ema9) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'MACD' };
  }
  
  const macdLine = ema12 - ema26;
  const signalLine = ema9;
  const histogram = macdLine - signalLine;
  
  // 计算前一天的MACD
  const prevCloses = closes.slice(0, -1);
  const prevEma12 = calculateEMA(prevCloses, 12);
  const prevEma26 = calculateEMA(prevCloses, 26);
  const prevEma9 = calculateEMA(prevCloses.slice(-34), 9);
  
  if (prevEma12 && prevEma26 && prevEma9) {
    const prevMacdLine = prevEma12 - prevEma26;
    const prevSignalLine = prevEma9;
    const prevHistogram = prevMacdLine - prevSignalLine;
    
    // 金叉：MACD线从下往上穿过信号线
    if (prevHistogram < 0 && histogram >= 0) {
      return { symbol, market, signal: 'buy', strength: 85, price: currentPrice, reason: `MACD金叉(DIF:${macdLine.toFixed(2)}, DEA:${signalLine.toFixed(2)})`, timestamp: Date.now(), strategy: 'MACD' };
    }
    // 死叉：MACD线从上往下穿过信号线
    if (prevHistogram > 0 && histogram <= 0) {
      return { symbol, market, signal: 'sell', strength: 85, price: currentPrice, reason: `MACD死叉(DIF:${macdLine.toFixed(2)}, DEA:${signalLine.toFixed(2)})`, timestamp: Date.now(), strategy: 'MACD' };
    }
  }
  
  // 零轴附近动量
  if (histogram > 0.5) {
    return { symbol, market, signal: 'buy', strength: 50, price: currentPrice, reason: `MACD多头(DIF:${macdLine.toFixed(2)})`, timestamp: Date.now(), strategy: 'MACD' };
  } else if (histogram < -0.5) {
    return { symbol, market, signal: 'sell', strength: 50, price: currentPrice, reason: `MACD空头(DIF:${macdLine.toFixed(2)})`, timestamp: Date.now(), strategy: 'MACD' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: `MACD震荡(DIF:${macdLine.toFixed(2)}, DEA:${signalLine.toFixed(2)})`, timestamp: Date.now(), strategy: 'MACD' };
}

/**
 * 布林带突破策略
 */
export async function bollingerStrategy(params: StrategyParams): Promise<StrategySignal> {
  const { symbol, market, threshold = 0.02 } = params;
  
  const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
  
  if (klines.length < 20) {
    return { symbol, market, signal: 'hold', strength: 0, price: 0, reason: '数据不足', timestamp: Date.now(), strategy: 'BOLL' };
  }
  
  const closes = klines.map((k: any) => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // 计算布林带
  const period = 20;
  const slice = closes.slice(-period);
  const ma = slice.reduce((a, b) => a + b, 0) / period;
  
  const squaredDiffs = slice.map(p => Math.pow(p - ma, 2));
  const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period);
  
  const upper = ma + 2 * stdDev;
  const lower = ma - 2 * stdDev;
  const middle = ma;
  
  // 突破上轨买入
  if (currentPrice > upper * (1 + threshold)) {
    return { symbol, market, signal: 'buy', strength: 80, price: currentPrice, reason: `突破布林上轨(现价:${currentPrice.toFixed(2)}, 上轨:${upper.toFixed(2)})`, timestamp: Date.now(), strategy: 'BOLL' };
  }
  
  // 突破下轨卖出
  if (currentPrice < lower * (1 - threshold)) {
    return { symbol, market, signal: 'sell', strength: 80, price: currentPrice, reason: `跌破布林下轨(现价:${currentPrice.toFixed(2)}, 下轨:${lower.toFixed(2)})`, timestamp: Date.now(), strategy: 'BOLL' };
  }
  
  // 触及下轨反弹机会
  if (currentPrice < lower * 1.02) {
    return { symbol, market, signal: 'buy', strength: 60, price: currentPrice, reason: `触及布林下轨(超卖)`, timestamp: Date.now(), strategy: 'BOLL' };
  }
  
  // 触及上轨压力
  if (currentPrice > upper * 0.98) {
    return { symbol, market, signal: 'sell', strength: 60, price: currentPrice, reason: `触及布林上轨(超买)`, timestamp: Date.now(), strategy: 'BOLL' };
  }
  
  return { symbol, market, signal: 'hold', strength: 30, price: currentPrice, reason: `布林带区间震荡(中轨:${middle.toFixed(2)})`, timestamp: Date.now(), strategy: 'BOLL' };
}

function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
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
 * 综合策略 - 6大策略投票
 */
export async function combinedStrategy(params: StrategyParams): Promise<StrategySignal> {
  const signals = await Promise.all([
    maStrategy(params),
    rsiStrategy(params),
    macdStrategy(params),
    bollingerStrategy(params),
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
  const strategyCount = signals.length;
  
  if (buyCount > sellCount && buyCount >= 3) {
    return { symbol: params.symbol, market: params.market, signal: 'buy', strength: totalStrength/strategyCount, price: currentPrice, reason: `${buyCount}/${strategyCount}个策略看多`, timestamp: Date.now(), strategy: 'Combined' };
  }
  
  if (sellCount > buyCount && sellCount >= 3) {
    return { symbol: params.symbol, market: params.market, signal: 'sell', strength: totalStrength/strategyCount, price: currentPrice, reason: `${sellCount}/${strategyCount}个策略看空`, timestamp: Date.now(), strategy: 'Combined' };
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
