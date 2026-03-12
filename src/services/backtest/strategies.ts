/**
 * 内置策略集合
 * 包含多种常用技术分析策略
 */

import { KLine, Signal } from './data-source/types';

/**
 * RSI 策略
 */
export class RSIStrategy implements Strategy {
  name = 'RSI Strategy';
  private period: number;
  private oversold: number;
  private overbought: number;
  
  constructor(period = 14, oversold = 30, overbought = 70) {
    this.period = period;
    this.oversold = oversold;
    this.overbought = overbought;
  }
  
  generateSignal(kLine: KLine, history: KLine[]): Signal | null {
    if (history.length < this.period) return null;
    
    const rsi = this.calculateRSI(history);
    
    // RSI 超卖买入
    if (rsi < this.oversold) {
      return {
        direction: 'long',
        confidence: 65,
        reason: `RSI=${rsi.toFixed(1)} 超卖(${this.oversold})`,
      };
    }
    
    // RSI 超买卖出
    if (rsi > this.overbought) {
      return {
        direction: 'short',
        confidence: 65,
        reason: `RSI=${rsi.toFixed(1)} 超买(${this.overbought})`,
      };
    }
    
    return null;
  }
  
  private calculateRSI(history: KLine[]): number {
    const prices = history.slice(-this.period).map(k => k.close);
    let gains = 0, losses = 0;
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i-1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / this.period;
    const avgLoss = losses / this.period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

/**
 * 布林带策略
 */
export class BollingerStrategy implements Strategy {
  name = 'Bollinger Strategy';
  private period: number;
  private stdDev: number;
  
  constructor(period = 20, stdDev = 2) {
    this.period = period;
    this.stdDev = stdDev;
  }
  
  generateSignal(kLine: KLine, history: KLine[]): Signal | null {
    if (history.length < this.period) return null;
    
    const { middle, upper, lower } = this.calculateBollinger(history);
    const currentPrice = kLine.close;
    
    // 价格触及下轨买入
    if (currentPrice <= lower) {
      return {
        direction: 'long',
        confidence: 60,
        reason: `价格触及下轨`,
      };
    }
    
    // 价格触及上轨卖出
    if (currentPrice >= upper) {
      return {
        direction: 'short',
        confidence: 60,
        reason: `价格触及上轨`,
      };
    }
    
    return null;
  }
  
  private calculateBollinger(history: KLine[]) {
    const prices = history.slice(-this.period).map(k => k.close);
    const middle = prices.reduce((a, b) => a + b, 0) / this.period;
    
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / this.period;
    const std = Math.sqrt(variance);
    
    return {
      middle,
      upper: middle + this.stdDev * std,
      lower: middle - this.stdDev * std,
    };
  }
}

/**
 * 动量策略
 */
export class MomentumStrategy {
  name = 'Momentum Strategy';
  private period: number;
  private threshold: number;
  
  constructor(period = 10, threshold = 0.02) {
    this.period = period;
    this.threshold = threshold;
  }
  
  generateSignal(kLine: KLine, history: KLine[]): Signal | null {
    if (history.length < this.period + 1) return null;
    
    const currentPrice = kLine.close;
    const pastPrice = history[history.length - this.period].close;
    const momentum = (currentPrice - pastPrice) / pastPrice;
    
    if (momentum > this.threshold) {
      return {
        direction: 'long',
        confidence: 60,
        reason: `动量 +${(momentum * 100).toFixed(1)}%`,
      };
    }
    
    if (momentum < -this.threshold) {
      return {
        direction: 'short',
        confidence: 60,
        reason: `动量 ${(momentum * 100).toFixed(1)}%`,
      };
    }
    
    return null;
  }
}

// 导出所有内置策略
export const BuiltInStrategies = {
  MA_CROSSOVER: 'ma_crossover',
  RSI: 'rsi',
  BOLLINGER: 'bollinger',
  MOMENTUM: 'momentum',
};

export function createStrategy(type: string, params?: any): Strategy {
  switch (type) {
    case BuiltInStrategies.MA_CROSSOVER:
      return new MovingAverageCrossover(params?.shortPeriod || 5, params?.longPeriod || 20);
    case BuiltInStrategies.RSI:
      return new RSIStrategy(params?.period || 14, params?.oversold || 30, params?.overbought || 70);
    case BuiltInStrategies.BOLLINGER:
      return new BollingerStrategy(params?.period || 20, params?.stdDev || 2);
    case BuiltInStrategies.MOMENTUM:
      return new MomentumStrategy(params?.period || 10, params?.threshold || 0.02);
    default:
      return new MovingAverageCrossover();
  }
}

// 需要 import 引擎中的 MovingAverageCrossover
import { MovingAverageCrossover } from './engine';
export { MovingAverageCrossover };
export interface Strategy {
  name: string;
  generateSignal(kLine: KLine, history: KLine[]): Signal | null;
}
