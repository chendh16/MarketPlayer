/**
 * 短线Agent - 日线循环交易
 * 持仓周期: 2-10天
 * 
 * 特性:
 * - 相对强度过滤 (跑赢大盘才能买入)
 * - 技术指标信号
 * - 动态止损
 */

import { getHistoryKLine, KLine } from '../../services/market/quote-service';
import { logger } from '../../utils/logger';
import { calculateRelativeStrength } from './relative-strength';

/**
 * 交易信号
 */
export interface ShortSignal {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  signal: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;      // 止损价
  targetPrice: number;   // 止盈价
  holdDays: number;      // 预期持仓天数
  reasons: string[];
  strength: number;      // 信号强度 0-100
}

/**
 * 计算技术指标
 */
function calculateIndicators(klines: KLine[]) {
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  
  // MA
  const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  
  // RSI
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  const rsi = 100 - (100 / (1 + rs));
  
  // 波动率
  const mean = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
  const volatility = Math.sqrt(variance) / mean;
  
  // 放量
  const v5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const v20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = v5 / (v20 || 1);
  
  // 20日高低点
  const high20 = Math.max(...klines.slice(-20).map(k => k.high));
  const low20 = Math.min(...klines.slice(-20).map(k => k.low));
  
  return { ma5, ma10, ma20, rsi, volatility, volumeRatio, high20, low20, closes, volumes };
}

/**
 * 短线信号检测 (2-10天持仓)
 */
export async function detectShortSignal(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  name?: string
): Promise<ShortSignal> {
  try {
    const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
    
    if (klines.length < 30) {
      return { symbol, market, signal: 'HOLD', entryPrice: 0, stopLoss: 0, targetPrice: 0, holdDays: 0, reasons: ['数据不足'], strength: 0 };
    }
    
    const { ma5, ma10, ma20, rsi, volatility, volumeRatio, high20, low20, closes, volumes } = calculateIndicators(klines);
    const currentPrice = closes[closes.length - 1];
    const reasons: string[] = [];
    let score = 50;
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    
    // ====== 买入条件 (2-10天) ======
    
    // 1. 放量突破 (强烈)
    if (currentPrice > high20 * 0.98 && volumeRatio > 1.5) {
      score += 25;
      reasons.push(`放量突破20日高点+${volumeRatio.toFixed(1)}倍`);
    }
    
    // 2. 均线多头排列
    if (ma5 > ma10 && ma10 > ma20) {
      score += 15;
      reasons.push('均线多头排列');
    }
    
    // 3. RSI超卖反弹
    if (rsi < 35) {
      score += 15;
      reasons.push(`RSI超卖(${rsi.toFixed(0)})`);
    }
    
    // 4. 回调到支撑
    if (currentPrice < low20 * 1.05 && currentPrice > low20 * 0.95 && volumeRatio < 0.7) {
      score += 15;
      reasons.push('缩量回调至支撑');
    }
    
    // 5. 连续放量
    const last3Up = volumes.slice(-3).every((v, i) => i === 0 || v > volumes[i - 1]);
    if (last3Up && volumeRatio > 1.2) {
      score += 10;
      reasons.push('连续3日放量');
    }
    
    // ====== 相对强度过滤 (P0) ======
    const rs = await calculateRelativeStrength(symbol, market);
    let relativePass = true;
    if (rs && !rs.passes) {
      relativePass = false;
      reasons.push(`相对强度不足(${rs.relativeStrength.toFixed(1)}%)`);
      score -= 20; // 相对强度不足扣分
    }
    
    // ====== 止盈止损计算 ======
    const targetReturn = 0.08; // 8%止盈
    const stopLossPct = 0.05; // 5%止损
    
    const stopLoss = currentPrice * (1 - stopLossPct);
    const targetPrice = currentPrice * (1 + targetReturn);
    
    // ====== 确定信号 ======
    let holdReason = '';
    
    // 预估持仓天数
    let holdDays = 5;
    if (score >= 80) holdDays = 2;       // 强信号
    else if (score >= 70) holdDays = 3;
    else if (score >= 60) holdDays = 5;
    else holdDays = 7;                   // 弱信号
    
    if (score >= 65 && relativePass) {
      signal = 'BUY';
      logger.info(`[ShortAgent] ${symbol} BUY 信号: ${score}分, 持仓${holdDays}天, 相对强度${rs?.relativeStrength.toFixed(1)}%`);
    } else if (score <= 35) {
      signal = 'SELL';
    } else if (!relativePass) {
      holdReason = '相对强度不足';
    }
    
    return {
      symbol,
      market,
      signal,
      entryPrice: currentPrice,
      stopLoss,
      targetPrice,
      holdDays,
      reasons,
      strength: score
    };
    
  } catch (error) {
    logger.error(`[ShortAgent] ${symbol} 分析失败:`, error);
    return { symbol, market, signal: 'HOLD', entryPrice: 0, stopLoss: 0, targetPrice: 0, holdDays: 0, reasons: ['分析失败'], strength: 0 };
  }
}

/**
 * 批量扫描
 */
export async function scanShortOpportunities(
  symbols: string[],
  market: 'a' | 'hk' | 'us'
): Promise<ShortSignal[]> {
  const results: ShortSignal[] = [];
  
  for (const symbol of symbols) {
    const signal = await detectShortSignal(symbol, market);
    if (signal.signal === 'BUY') {
      results.push(signal);
    }
  }
  
  // 按强度排序
  return results.sort((a, b) => b.strength - a.strength);
}

export default {
  detectShortSignal,
  scanShortOpportunities,
};
