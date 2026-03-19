/**
 * 股票分析服务
 * 真实K线数据 + 技术指标 + 交易信号
 */

import { logger } from '../../utils/logger';

interface KLine {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AnalysisResult {
  symbol: string;
  currentPrice: number;
  change: number;
  changePct: number;
  rsi?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  macd?: { line: number; signal: number; histogram: number };
  boll?: { upper: number; middle: number; lower: number };
  signal: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  updatedAt: Date;
}

/**
 * 获取美股分析数据
 * 
 * 注意: 当前使用模拟数据
 * TODO: 接入真实数据源 (需要付费API或自建数据服务)
 */
export async function analyzeStock(symbol: string): Promise<AnalysisResult> {
  // 尝试从富途获取真实数据
  const realData = await tryGetRealData(symbol);
  
  if (realData) {
    return realData;
  }
  
  // 使用模拟数据进行演示
  return generateMockAnalysis(symbol);
}

/**
 * 尝试获取真实数据
 */
async function tryGetRealData(symbol: string): Promise<AnalysisResult | null> {
  // TODO: 接入真实数据源
  // 方案1: 富途付费行情API
  // 方案2: Alpha Vantage / polygon.io / intrinio
  // 方案3: 自建数据服务
  
  // 目前返回null使用模拟数据
  return null;
}

/**
 * 生成模拟分析数据 (演示用)
 */
function generateMockAnalysis(symbol: string): AnalysisResult {
  // 根据不同股票生成不同的模拟数据
  const mockData: Record<string, { price: number; change: number }> = {
    'US.TSLA': { price: 265.50, change: -2.5 },
    'US.AAPL': { price: 175.30, change: 1.2 },
    'US.NVDA': { price: 780.25, change: 3.8 },
    'US.MSFT': { price: 415.80, change: 0.5 },
    'US.GOOGL': { price: 175.20, change: -0.8 },
    'US.AMZN': { price: 178.50, change: 1.5 },
    'US.META': { price: 505.30, change: 2.1 },
  };
  
  const data = mockData[symbol] || { price: 100, change: 0 };
  
  // 生成模拟历史价格
  const prices = generateMockPrices(data.price, data.change, 60);
  const currentPrice = prices[prices.length - 1];
  
  // 计算指标
  const rsi = calculateRSI(prices, 14);
  const ma5 = calculateMA(prices, 5);
  const ma10 = calculateMA(prices, 10);
  const ma20 = calculateMA(prices, 20);
  const ma60 = calculateMA(prices, 60);
  const macd = calculateMACD(prices);
  const boll = calculateBOLL(prices, 20);
  
  // 生成信号
  const { signal, reason } = generateSignal({
    rsi, ma5, ma10, ma20, macd, boll, prices
  });
  
  return {
    symbol,
    currentPrice,
    change: data.change,
    changePct: data.change,
    rsi,
    ma5,
    ma10,
    ma20,
    ma60,
    macd,
    boll,
    signal,
    reason,
    updatedAt: new Date(),
  };
}

/**
 * 生成模拟历史价格
 */
function generateMockPrices(currentPrice: number, changePct: number, count: number): number[] {
  const prices: number[] = [];
  const dailyChange = (changePct / 100) * currentPrice / 30; // 平均每日变化
  
  for (let i = count; i > 0; i--) {
    const noise = (Math.random() - 0.5) * currentPrice * 0.02;
    const price = currentPrice - (dailyChange * i) + noise;
    prices.push(price);
  }
  
  prices.push(currentPrice);
  return prices;
}

/**
 * 生成交易信号
 */
function generateSignal(data: {
  rsi?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  macd?: { line: number; signal: number; histogram: number };
  boll?: { upper: number; middle: number; lower: number };
  prices: number[];
}): { signal: 'BUY' | 'SELL' | 'HOLD'; reason: string } {
  const reasons: string[] = [];
  let buyScore = 0;
  let sellScore = 0;
  
  // RSI 分析
  if (data.rsi) {
    if (data.rsi < 30) {
      buyScore += 2;
      reasons.push(`RSI超卖(${data.rsi.toFixed(0)})`);
    } else if (data.rsi > 70) {
      sellScore += 2;
      reasons.push(`RSI超买(${data.rsi.toFixed(0)})`);
    }
  }
  
  // 均线分析
  if (data.ma5 && data.ma20) {
    if (data.ma5 > data.ma20) {
      buyScore += 1;
      reasons.push('MA5>MA20(金叉)');
    } else {
      sellScore += 1;
      reasons.push('MA5<MA20(死叉)');
    }
  }
  
  // MACD分析
  if (data.macd) {
    if (data.macd.histogram > 0) {
      buyScore += 1;
      reasons.push('MACD柱状图>0');
    } else {
      sellScore += 1;
      reasons.push('MACD柱状图<0');
    }
  }
  
  // 布林带分析
  if (data.boll && data.prices) {
    const currentPrice = data.prices[data.prices.length - 1];
    if (currentPrice < data.boll.lower) {
      buyScore += 1;
      reasons.push('触及布林下轨');
    } else if (currentPrice > data.boll.upper) {
      sellScore += 1;
      reasons.push('触及布林上轨');
    }
  }
  
  // 生成最终信号
  if (buyScore > sellScore + 1) {
    return { signal: 'BUY', reason: reasons.join(', ') || '多项指标看涨' };
  } else if (sellScore > buyScore + 1) {
    return { signal: 'SELL', reason: reasons.join(', ') || '多项指标看跌' };
  }
  
  return { signal: 'HOLD', reason: reasons.join(', ') || '指标中性' };
}

// ============= 指标计算函数 =============

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMA(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateMACD(prices: number[]): { line: number; signal: number; histogram: number } | undefined {
  if (prices.length < 34) return undefined;
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const ema9 = calculateEMA(prices.slice(-34), 9);
  
  if (!ema12 || !ema26 || !ema9) return undefined;
  
  const line = ema12 - ema26;
  const histogram = line - ema9;
  
  return { line, signal: ema9, histogram };
}

function calculateBOLL(prices: number[], period: number = 20): { upper: number; middle: number; lower: number } | undefined {
  if (prices.length < period) return undefined;
  
  const slice = prices.slice(-period);
  const ma = slice.reduce((a, b) => a + b, 0) / period;
  
  const squaredDiffs = slice.map(p => Math.pow(p - ma, 2));
  const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period);
  
  return {
    upper: ma + 2 * stdDev,
    middle: ma,
    lower: ma - 2 * stdDev,
  };
}

/**
 * 批量分析多只股票
 */
export async function batchAnalyze(symbols: string[]): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  
  for (const symbol of symbols) {
    const analysis = await analyzeStock(symbol);
    results.push(analysis);
  }
  
  return results;
}

/**
 * 获取推荐股票
 */
export async function getRecommendations(): Promise<{
  strongBuy: AnalysisResult[];
  buy: AnalysisResult[];
  hold: AnalysisResult[];
  sell: AnalysisResult[];
}> {
  const watchList = ['US.TSLA', 'US.AAPL', 'US.NVDA', 'US.MSFT', 'US.GOOGL', 'US.AMZN', 'US.META'];
  const results = await batchAnalyze(watchList);
  
  return {
    strongBuy: results.filter(r => r.signal === 'BUY' && r.reason.includes('RSI')),
    buy: results.filter(r => r.signal === 'BUY'),
    hold: results.filter(r => r.signal === 'HOLD'),
    sell: results.filter(r => r.signal === 'SELL'),
  };
}
