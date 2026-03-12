/**
 * 短线策略 - 量价选股规则
 * 不使用模型，基于规则判断
 */

import { KLine } from '../types';

export interface StockSignal {
  symbol: string;
  name: string;
  market: 'a' | 'us' | 'hk';
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: number; // 1-100
  reasons: string[];
  price: number;
  volume: number;
  changePct: number;
}

/**
 * 计算简单移动平均
 */
function calculateMA(klines: KLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].close;
  const sum = klines.slice(-period).reduce((acc, k) => acc + k.close, 0);
  return sum / period;
}

/**
 * 计算成交量均线
 */
function calculateVolumeMA(klines: KLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].volume;
  const sum = klines.slice(-period).reduce((acc, k) => acc + k.volume, 0);
  return sum / period;
}

/**
 * 短线选股规则
 */
export function evaluateShortTerm(klines: KLine[], symbol: string, name: string, market: 'a' | 'us' | 'hk'): StockSignal {
  const k = klines[klines.length - 1]; // 最新数据
  const prevK = klines[klines.length - 2] || k;
  
  const ma5 = calculateMA(klines, 5);
  const ma20 = calculateMA(klines, 20);
  const volumeMA5 = calculateVolumeMA(klines, 5);
  
  // 计算成交量放大倍数
  const volumeRatio = k.volume / volumeMA5;
  
  // 计算涨跌幅
  const changePct = ((k.close - prevK.close) / prevK.close) * 100;
  
  const reasons: string[] = [];
  let score = 50; // 基础分数
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  
  // 规则1: 放量突破 (成交量放大 + 股价上涨)
  if (volumeRatio > 1.5 && changePct > 2) {
    score += 20;
    reasons.push('放量上涨');
  }
  
  // 规则2: 缩量回调 (成交量萎缩 + 股价下跌) - 可能见底
  if (volumeRatio < 0.5 && changePct < -2) {
    score += 15;
    reasons.push('缩量回调');
  }
  
  // 规则3: 多头排列 (MA5 > MA20)
  if (ma5 > ma20) {
    score += 15;
    reasons.push('均线多头');
  }
  
  // 规则4: 空头排列 (MA5 < MA20)
  if (ma5 < ma20) {
    score -= 15;
    reasons.push('均线空头');
  }
  
  // 规则5: 突破20日高点
  const high20 = Math.max(...klines.slice(-20).map(k => k.high));
  if (k.close > high20 * 0.98) {
    score += 15;
    reasons.push('突破20日高点');
  }
  
  // 规则6: 放量跌破20日低点 (危险信号)
  const low20 = Math.min(...klines.slice(-20).map(k => k.low));
  if (k.close < low20 * 1.02 && volumeRatio > 1.5) {
    score -= 20;
    reasons.push('放量跌破');
  }
  
  // 确定信号
  if (score >= 70) signal = 'BUY';
  else if (score <= 30) signal = 'SELL';
  else signal = 'HOLD';
  
  return {
    symbol,
    name,
    market,
    signal,
    strength: Math.max(0, Math.min(100, score)),
    reasons,
    price: k.close,
    volume: k.volume,
    changePct
  };
}
