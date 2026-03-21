/**
 * 技术指标库 - 基于 TradingView MCP 竞品
 * 包含: Bollinger Bands, 多时间框, 形态识别
 */

import { KLine } from '../services/market/quote-service';
import { logger } from '../utils/logger';

// ====== Bollinger Bands ======

export interface BollingerBands {
  upper: number;    // 上轨
  middle: number;  // 中轨 (MA20)
  lower: number;   // 下轨
  width: number;   // 带宽 (BBW)
  position: number; // 当前位置 (相对于 Bands)
  rating: number;  // -3 到 +3 评级
}

export interface BollingerResult {
  bands: BollingerBands;
  isSqueeze: boolean;  // 是否挤压 (BBW < 0.05)
  isBreakout: boolean; // 是否突破
}

/**
 * 计算 Bollinger Bands
 * @param klines K线数据
 * @param period 周期 (默认20)
 * @param stdDev 标准差倍数 (默认2)
 */
export function calculateBollingerBands(
  klines: KLine[],
  period: number = 20,
  stdDev: number = 2
): BollingerResult | null {
  if (klines.length < period) return null;

  const closes = klines.map(k => k.close);
  const recent = closes.slice(-period);
  
  // 中轨 = MA20
  const middle = recent.reduce((a, b) => a + b, 0) / period;
  
  // 标准差
  const variance = recent.reduce((acc, price) => acc + Math.pow(price - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  
  // 带宽 (BBW) - 越小表示越挤压
  const width = (upper - lower) / middle;
  
  // 当前价格位置
  const currentPrice = closes[closes.length - 1];
  const position = (currentPrice - lower) / (upper - lower);
  
  // 评级 (-3 到 +3)
  let rating = 0;
  if (currentPrice > upper) rating = 3;
  else if (currentPrice > middle + std * 0.5) rating = 2;
  else if (currentPrice > middle) rating = 1;
  else if (currentPrice < lower) rating = -3;
  else if (currentPrice < middle - std * 0.5) rating = -2;
  else if (currentPrice < middle) rating = -1;
  
  const isSqueeze = width < 0.05; // 挤压阈值
  const isBreakout = currentPrice > upper || currentPrice < lower;
  
  return {
    bands: { upper, middle, lower, width, position, rating },
    isSqueeze,
    isBreakout,
  };
}

/**
 * 批量扫描 Bollinger 挤压的股票
 */
export async function scanBollingerSqueeze(
  getKLines: (symbol: string, market: string, timeframe: string) => Promise<KLine[]>,
  symbols: Array<{symbol: string; market: 'a' | 'us' | 'hk'; name: string}>
): Promise<BollingerSignal[]> {
  const results: BollingerSignal[] = [];
  
  for (const stock of symbols) {
    try {
      const klines = await getKLines(stock.symbol, stock.market, '1d');
      if (klines.length < 20) continue;
      
      const bb = calculateBollingerBands(klines);
      if (!bb || !bb.isSqueeze) continue;
      
      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        bands: bb.bands,
        breakout: bb.isBreakout ? 'WAITING' : 'SQUEEZE',
        reasons: [`Bollinger带宽=${(bb.bands.width * 100).toFixed(2)}% < 5%`, '等待突破'],
        timestamp: Date.now(),
      });
    } catch (e) {
      logger.error(`[Bollinger] 扫描${stock.symbol}失败:`, e);
    }
  }
  
  return results.sort((a, b) => a.bands.width - b.bands.width);
}

export interface BollingerSignal {
  symbol: string;
  name: string;
  market: 'a' | 'us' | 'hk';
  bands: BollingerBands;
  breakout: 'SQUEEZE' | 'BREAKUP' | 'BREAKDOWN' | 'WAITING';
  reasons: string[];
  timestamp: number;
}

// ====== 多时间框指标 ======

export interface MultiTimeframeIndicators {
  symbol: string;
  timeframes: {
    [key: string]: {
      bb: BollingerBands | null;
      rsi: number;
      macd: MACDResult | null;
      trend: 'UP' | 'DOWN' | 'SIDE';
    };
  };
}

/**
 * 获取多时间框技术指标
 */
export async function getMultiTimeframeIndicators(
  getKLines: (symbol: string, market: string, timeframe: string) => Promise<KLine[]>,
  symbol: string,
  market: 'a' | 'us' | 'hk',
  timeframes: string[] = ['5m', '15m', '1h', '4h', '1d']
): Promise<MultiTimeframeIndicators> {
  const result: MultiTimeframeIndicators = {
    symbol,
    timeframes: {},
  };
  
  for (const tf of timeframes) {
    try {
      const klines = await getKLines(symbol, market, tf);
      if (klines.length < 20) continue;
      
      const bb = calculateBollingerBands(klines);
      const rsi = calculateRSI(klines, 14);
      const macd = calculateMACD(klines);
      const trend = determineTrend(klines);
      
      result.timeframes[tf] = {
        bb: bb ? bb.bands : null,
        rsi,
        macd,
        trend,
      };
    } catch (e) {
      logger.error(`[MultiTF] ${symbol} ${tf} 失败:`, e);
    }
  }
  
  return result;
}

// ====== RSI ======

export function calculateRSI(klines: KLine[], period: number = 14): number {
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

// ====== MACD ======

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export function calculateMACD(klines: KLine[], fast: number = 12, slow: number = 26, signal: number = 9): MACDResult | null {
  if (klines.length < slow) return null;
  
  const closes = klines.map(k => k.close);
  
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  
  const macdLine = emaFast - emaSlow;
  
  // 计算signal线 (MACD的EMA)
  const macdSeries: number[] = [];
  for (let i = slow; i < closes.length; i++) {
    macdSeries.push(calculateEMA(closes.slice(0, i + 1), fast) - calculateEMA(closes.slice(0, i + 1), slow));
  }
  
  const signalLine = calculateEMA(macdSeries, signal);
  const histogram = macdLine - signalLine;
  
  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (macdLine > signalLine && histogram > 0) trend = 'BULLISH';
  else if (macdLine < signalLine && histogram < 0) trend = 'BEARISH';
  
  return { macd: macdLine, signal: signalLine, histogram, trend };
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// ====== 趋势判断 ======

export function determineTrend(klines: KLine[]): 'UP' | 'DOWN' | 'SIDE' {
  if (klines.length < 20) return 'SIDE';
  
  const ma20 = calculateMA(klines, 20);
  const ma50 = calculateMA(klines, 50);
  const currentPrice = klines[klines.length - 1].close;
  
  if (ma20 > ma50 && currentPrice > ma20) return 'UP';
  if (ma20 < ma50 && currentPrice < ma20) return 'DOWN';
  return 'SIDE';
}

function calculateMA(klines: KLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1].close;
  const sum = klines.slice(-period).reduce((acc, k) => acc + k.close, 0);
  return sum / period;
}

// ====== K线形态识别 ======

export interface CandlePattern {
  name: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 1-100
  description: string;
}

/**
 * 识别连续K线形态
 */
export function detectConsecutiveCandles(klines: KLine[], minCount: number = 3): CandlePattern | null {
  if (klines.length < minCount) return null;
  
  const recent = klines.slice(-minCount);
  const isBullish = recent.every(k => k.close > k.open);
  const isBearish = recent.every(k => k.close < k.open);
  
  if (isBullish) {
    return {
      name: `${minCount}连阳`,
      type: 'BULLISH',
      strength: 70,
      description: `连续${minCount}根阳线上涨`,
    };
  }
  
  if (isBearish) {
    return {
      name: `${minCount}连阴`,
      type: 'BEARISH',
      strength: 70,
      description: `连续${minCount}根阴线下跌`,
    };
  }
  
  return null;
}

/**
 * 识别锤子线/上吊线
 */
export function detectHammer(klines: KLine[]): CandlePattern | null {
  if (klines.length < 1) return null;
  
  const k = klines[klines.length - 1];
  const body = Math.abs(k.close - k.open);
  const upperShadow = k.high - Math.max(k.close, k.open);
  const lowerShadow = Math.min(k.close, k.open) - k.low;
  
  // 锤子线: 下影线>= body*2, 上影线很短
  if (lowerShadow >= body * 2 && upperShadow < body * 0.5) {
    return {
      name: '锤子线',
      type: 'BULLISH',
      strength: 65,
      description: '下影线长，确认支撑',
    };
  }
  
  // 上吊线: 上影线>= body*2, 下影线很短
  if (upperShadow >= body * 2 && lowerShadow < body * 0.5) {
    return {
      name: '上吊线',
      type: 'BEARISH',
      strength: 65,
      description: '上影线长，警惕回落',
    };
  }
  
  return null;
}

/**
 * 识别吞没形态
 */
export function detectEngulfing(klines: KLine[]): CandlePattern | null {
  if (klines.length < 2) return null;
  
  const k = klines[klines.length - 1];
  const prevK = klines[klines.length - 2];
  
  const body = Math.abs(k.close - k.open);
  const prevBody = Math.abs(prevK.close - prevK.open);
  
  // 阳包阴
  if (prevK.close < prevK.open && k.close > k.open &&
      k.open < prevK.close && k.close > prevK.open &&
      body > prevBody * 1.5) {
    return {
      name: '看涨吞没',
      type: 'BULLISH',
      strength: 80,
      description: '阳线吞没前一根阴线',
    };
  }
  
  // 阴包阳
  if (prevK.close > prevK.open && k.close < k.open &&
      k.open > prevK.close && k.close < prevK.open &&
      body > prevBody * 1.5) {
    return {
      name: '看跌吞没',
      type: 'BEARISH',
      strength: 80,
      description: '阴线吞没前一根阳线',
    };
  }
  
  return null;
}

/**
 * 综合形态识别
 */
export function detectAllPatterns(klines: KLine[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  
  const consecutive = detectConsecutiveCandles(klines, 3);
  if (consecutive) patterns.push(consecutive);
  
  const hammer = detectHammer(klines);
  if (hammer) patterns.push(hammer);
  
  const engulfing = detectEngulfing(klines);
  if (engulfing) patterns.push(engulfing);
  
  return patterns;
}
