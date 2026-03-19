/**
 * 短线策略 - 3到5天持股
 * 目标：捕捉技术形态主升浪，严格止损
 */

import { getHistoryKLine, KLine } from '../services/market/quote-service';
import { logger } from '../utils/logger';

export interface ShortTermSignal {
  symbol: string;
  name: string;
  market: 'a' | 'us' | 'hk';
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: number;       // 1-100
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  holdDays: number;       // 预期持股天数
  reasons: string[];
  pattern: string;        // 技术形态名称
  timestamp: number;
}

/**
 * 评估3-5天短线机会
 */
export async function evaluateShortTerm(
  symbol: string,
  market: 'a' | 'us' | 'hk',
  name?: string
): Promise<ShortTermSignal> {
  const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
  
  if (klines.length < 30) {
    return createHoldSignal(symbol, market, '数据不足');
  }
  
  const result = analyzePatterns(klines, symbol, market, name || symbol);
  
  logger.info(`[ShortTerm] ${symbol} 短线信号: ${result.signal} - ${result.pattern}`);
  
  return result;
}

/**
 * 分析技术形态
 */
function analyzePatterns(
  klines: KLine[],
  symbol: string,
  market: 'a' | 'us' | 'hk',
  name: string
): ShortTermSignal {
  const k = klines[klines.length - 1];
  const prevK = klines[klines.length - 2];
  
  const currentPrice = k.close;
  const volume = k.volume;
  
  // 计算指标
  const ma5 = calculateMA(klines, 5);
  const ma10 = calculateMA(klines, 10);
  const ma20 = calculateMA(klines, 20);
  const volumeMA5 = calculateVolumeMA(klines, 5);
  const volumeRatio = volume / volumeMA5;
  
  const changePct = prevK ? ((k.close - prevK.close) / prevK.close) * 100 : 0;
  
  const reasons: string[] = [];
  let score = 50;
  let pattern = '无形态';
  
  // ====== 3-5天短线形态 ======
  
  // 形态1: 放量突破新高 (强烈买入)
  const high20 = Math.max(...klines.slice(-20).map(k => k.high));
  if (currentPrice > high20 * 0.98 && volumeRatio > 1.5 && changePct > 3) {
    score += 30;
    pattern = '放量突破新高';
    reasons.push(`突破20日高点+放量(${volumeRatio.toFixed(1)}倍)`);
  }
  
  // 形态2: 均线多头排列 (趋势健康)
  if (ma5 > ma10 && ma10 > ma20) {
    score += 15;
    reasons.push('均线多头排列');
  }
  
  // 形态3: 连续放量上涨 (资金涌入)
  const last3Volumes = klines.slice(-3).map(k => k.volume);
  const avgVolume = last3Volumes.reduce((a, b) => a + b, 0) / 3;
  const volume10Avg = calculateVolumeMA(klines, 10);
  if (avgVolume > volume10Avg * 1.3 && changePct > 0) {
    score += 15;
    pattern = '资金持续流入';
    reasons.push('近3日连续放量');
  }
  
  // 形态4: 缩量回调至支撑 (低吸机会)
  const low20 = Math.min(...klines.slice(-20).map(k => k.low));
  if (currentPrice < low20 * 1.05 && currentPrice > low20 * 0.95 && volumeRatio < 0.7) {
    score += 20;
    pattern = '回调至支撑';
    reasons.push('缩量回调至20日均线支撑');
  }
  
  // 形态5: 突破盘整区间
  const last10High = Math.max(...klines.slice(-10, -1).map(k => k.high));
  const last10Low = Math.min(...klines.slice(-10, -1).map(k => k.low));
  if (currentPrice > last10High * 1.02 && volumeRatio > 1.2) {
    score += 25;
    pattern = '突破盘整';
    reasons.push(`突破10日整理区间`);
  }
  
  // 形态6: RSI超卖反弹
  const rsi = calculateRSI(klines, 14);
  if (rsi < 35 && changePct > -1) {
    score += 15;
    pattern = 'RSI超卖';
    reasons.push(`RSI(${rsi.toFixed(0)})超卖待反弹`);
  }
  
  // ====== 风险检查 - 触发立即卖出 ======
  
  // 风险1: 放量跌破支撑
  if (currentPrice < low20 * 0.95 && volumeRatio > 1.5) {
    score = 20;
    pattern = '放量跌破';
    reasons.push('危险: 放量跌破支撑');
  }
  
  // 风险2: 均线死叉
  if (ma5 < ma10 && ma10 < ma20) {
    score -= 20;
    reasons.push('均线死叉');
  }
  
  // 确定信号
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let holdDays = 3;
  
  if (score >= 70) {
    signal = 'BUY';
    holdDays = Math.min(5, Math.max(3, Math.floor((high20 - currentPrice) / (currentPrice * 0.02))));
  } else if (score <= 30) {
    signal = 'SELL';
    holdDays = 1; // 尽快跑
  }
  
  // 计算止损止盈
  const stopLoss = currentPrice * 0.95; // 5%止损
  const targetPrice = currentPrice * 1.08; // 8%止盈
  
  return {
    symbol,
    name,
    market,
    signal,
    strength: Math.max(0, Math.min(100, score)),
    entryPrice: currentPrice,
    stopLoss,
    targetPrice,
    holdDays,
    reasons: reasons.length > 0 ? reasons : ['等待形态'],
    pattern,
    timestamp: Date.now(),
  };
}

function createHoldSignal(
  symbol: string,
  market: 'a' | 'us' | 'hk',
  reason: string
): ShortTermSignal {
  return {
    symbol,
    name: symbol,
    market,
    signal: 'HOLD',
    strength: 0,
    entryPrice: 0,
    stopLoss: 0,
    targetPrice: 0,
    holdDays: 0,
    reasons: [reason],
    pattern: '无信号',
    timestamp: Date.now(),
  };
}

// ====== 辅助函数 ======

function calculateMA(klines: KLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].close;
  const sum = klines.slice(-period).reduce((acc, k) => acc + k.close, 0);
  return sum / period;
}

function calculateVolumeMA(klines: KLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].volume;
  const sum = klines.slice(-period).reduce((acc, k) => acc + k.volume, 0);
  return sum / period;
}

function calculateRSI(klines: KLine[], period: number): number {
  if (klines.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  const closes = klines.map(k => k.close);
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 批量扫描短线机会
 */
export async function scanShortTermOpportunities(
  symbols: Array<{symbol: string; market: 'a' | 'us' | 'hk'; name: string}>
): Promise<ShortTermSignal[]> {
  const results: ShortTermSignal[] = [];
  
  for (const stock of symbols) {
    try {
      const signal = await evaluateShortTerm(stock.symbol, stock.market, stock.name);
      if (signal.signal === 'BUY') {
        results.push(signal);
      }
    } catch (e) {
      logger.error(`[ShortTerm] 扫描${stock.symbol}失败:`, e);
    }
    
    // 避免请求过快
    await new Promise(r => setTimeout(r, 300));
  }
  
  // 按强度排序
  return results.sort((a, b) => b.strength - a.strength);
}
