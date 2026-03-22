/**
 * 技术指标库
 * 包含: ADX, OBV, ATR, KDJ, CCI等
 */

import { KLine } from '../../services/market/quote-service';

/**
 * 计算ATR (Average True Range) - 真实波动幅度均值
 * 用于动态止损
 */
export function calculateATR(klines: KLine[], period: number = 14): number {
  if (klines.length < period + 1) return 0;
  
  let trSum = 0;
  
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    
    // True Range = max(H-L, |H-PCP|, |L-PCP|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trSum += tr;
  }
  
  return trSum / period;
}

/**
 * 计算ADX (Average Directional Index) - 趋势强度指标
 * 
 * ADX解读:
 * - ADX > 25: 趋势强劲
 * - ADX < 20: 趋势疲软
 * - +DI > -DI: 上升趋势
 * - -DI > +DI: 下降趋势
 */
export function calculateADX(klines: KLine[], period: number = 14): {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'up' | 'down' | 'sideways';
} {
  if (klines.length < period * 2) {
    return { adx: 0, plusDI: 0, minusDI: 0, trend: 'sideways' };
  }
  
  // 计算 +DM 和 -DM
  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;
  
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevHigh = klines[i - 1].high;
    const prevLow = klines[i - 1].low;
    const prevClose = klines[i - 1].close;
    
    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trSum += tr;
    
    // Directional Movement
    const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
    
    plusDMSum += plusDM;
    minusDMSum += minusDM;
  }
  
  const atr = trSum / period;
  const plusDI = atr > 0 ? (plusDMSum / period / atr) * 100 : 0;
  const minusDI = atr > 0 ? (minusDMSum / period / atr) * 100 : 0;
  
  // ADX = |+DI - -DI| / (+DI + -DI) * 100
  const diSum = plusDI + minusDI;
  const adx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
  
  let trend: 'up' | 'down' | 'sideways' = 'sideways';
  if (adx > 25) {
    trend = plusDI > minusDI ? 'up' : 'down';
  }
  
  return { adx, plusDI, minusDI, trend };
}

/**
 * 计算OBV (On-Balance Volume) - 能量潮
 * 
 * OBV解读:
 * - OBV创新高: 买方力量强劲
 * - OBV创新低: 卖方力量强劲
 * - OBV与价格背离: 可能反转
 */
export function calculateOBV(klines: KLine[]): {
  obv: number;
  obvMA: number;
  trend: 'up' | 'down' | 'sideways';
} {
  if (klines.length < 2) return { obv: 0, obvMA: 0, trend: 'sideways' };
  
  let obv = 0;
  const volumes: number[] = [];
  
  for (let i = 1; i < klines.length; i++) {
    const currentClose = klines[i].close;
    const prevClose = klines[i - 1].close;
    const volume = klines[i].volume;
    
    if (currentClose > prevClose) {
      obv += volume;
    } else if (currentClose < prevClose) {
      obv -= volume;
    }
    // 平盘不改变
    
    volumes.push(obv);
  }
  
  // OBV的MA
  const obvMA = volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length);
  
  let trend: 'up' | 'down' | 'sideways' = 'sideways';
  if (obv > obvMA * 1.02) trend = 'up';
  else if (obv < obvMA * 0.98) trend = 'down';
  
  return { obv, obvMA, trend };
}

/**
 * 计算KDJ随机指标
 * 
 * KDJ解读:
 * - K,D < 20: 超卖 (可能买入)
 * - K,D > 80: 超买 (可能卖出)
 * - K上穿D: 金叉买入
 * - K下穿D: 死叉卖出
 */
export function calculateKDJ(klines: KLine[], period: number = 9): {
  k: number;
  d: number;
  j: number;
  signal: 'buy' | 'sell' | 'hold';
} {
  if (klines.length < period) {
    return { k: 50, d: 50, j: 50, signal: 'hold' };
  }
  
  const recent = klines.slice(-period);
  const highs = recent.map(k => k.high);
  const lows = recent.map(k => k.low);
  const close = klines[klines.length - 1].close;
  
  const highest = Math.max(...highs);
  const lowest = Math.min(...lows);
  
  const rsv = highest === lowest ? 50 : ((close - lowest) / (highest - lowest)) * 100;
  
  // 简化的K, D计算 (实际需要递归)
  const k = rsv;
  const d = 50; // 简化
  const j = 3 * k - 2 * d;
  
  let signal: 'buy' | 'sell' | 'hold' = 'hold';
  if (k < 20 && d < 20) signal = 'buy';
  else if (k > 80 && d > 80) signal = 'sell';
  
  return { k, d, j, signal };
}

/**
 * 计算CCI (Commodity Channel Index) - 商品通道指数
 * 
 * CCI解读:
 * - CCI > 100: 超买
 * - CCI < -100: 超卖
 */
export function calculateCCI(klines: KLine[], period: number = 20): number {
  if (klines.length < period) return 0;
  
  const tp = klines.map(k => (k.high + k.low + k.close) / 3);
  const sma = tp.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  const mad = tp.slice(-period).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
  
  const cci = mad > 0 ? (tp[tp.length - 1] - sma) / (0.015 * mad) : 0;
  
  return cci;
}

/**
 * 计算MFI (Money Flow Index) - 资金流量指数
 * 类似RSI但考虑成交量
 */
export function calculateMFI(klines: KLine[], period: number = 14): number {
  if (klines.length < period + 1) return 50;
  
  let positiveFlow = 0;
  let negativeFlow = 0;
  
  for (let i = 1; i < klines.length; i++) {
    const tp = (klines[i].high + klines[i].low + klines[i].close) / 3;
    const prevTp = (klines[i - 1].high + klines[i - 1].low + klines[i - 1].close) / 3;
    const volume = klines[i].volume;
    
    if (tp > prevTp) {
      positiveFlow += tp * volume;
    } else {
      negativeFlow += tp * volume;
    }
  }
  
  if (negativeFlow === 0) return 100;
  
  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - (100 / (1 + moneyRatio));
}

export default {
  calculateATR,
  calculateADX,
  calculateOBV,
  calculateKDJ,
  calculateCCI,
  calculateMFI,
};
