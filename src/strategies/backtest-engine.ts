/**
 * 回测系统
 * 简单实现，支持MA/RSI策略回测
 */

import { logger } from '../utils/logger';
import { getHistoryKLine, KLine } from '../services/market/quote-service';

/**
 * 回测结果
 */
export interface BacktestResult {
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  winRate: number;
  trades: number;
  holdingDays: number;
}

/**
 * 交易记录
 */
export interface Trade {
  date: number;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  reason: string;
}

/**
 * 回测参数
 */
export interface BacktestParams {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  strategy: 'ma' | 'rsi' | 'breakout';
  startDate?: string;
  endDate?: string;
  initialCapital?: number;
}

/**
 * MA策略回测
 */
async function backtestMA(params: BacktestParams, klines: KLine[]): Promise<BacktestResult> {
  const initialCapital = params.initialCapital || 100000;
  let capital = initialCapital;
  let position = 0;
  const trades: Trade[] = [];
  
  for (let i = 20; i < klines.length; i++) {
    const recent = klines.slice(i - 20, i);
    const ma5 = recent.slice(-5).reduce((a, b) => a + b.close, 0) / 5;
    const ma20 = recent.reduce((a, b) => a + b.close, 0) / 20;
    const price = klines[i].close;
    
    // 金叉买入
    if (ma5 > ma20 && position === 0) {
      const qty = Math.floor(capital * 0.9 / price);
      if (qty > 0) {
        capital -= qty * price;
        position = qty;
        trades.push({ date: klines[i].timestamp, type: 'buy', price, quantity: qty, reason: 'MA金叉' });
      }
    }
    // 死叉卖出
    else if (ma5 < ma20 && position > 0) {
      capital += position * price;
      trades.push({ date: klines[i].timestamp, type: 'sell', price, quantity: position, reason: 'MA死叉' });
      position = 0;
    }
  }
  
  // 最后平仓
  if (position > 0) {
    capital += position * klines[klines.length - 1].close;
  }
  
  return calculateResult(params, klines, trades, initialCapital, capital);
}

/**
 * RSI策略回测
 */
async function backtestRSI(params: BacktestParams, klines: KLine[]): Promise<BacktestResult> {
  const initialCapital = params.initialCapital || 100000;
  let capital = initialCapital;
  let position = 0;
  const trades: Trade[] = [];
  
  for (let i = 15; i < klines.length; i++) {
    const period = klines.slice(i - 14, i);
    let gains = 0, losses = 0;
    
    for (let j = 1; j < period.length; j++) {
      const diff = period[j].close - period[j - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    
    const rs = gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));
    const price = klines[i].close;
    
    // 超卖买入
    if (rsi < 30 && position === 0) {
      const qty = Math.floor(capital * 0.9 / price);
      if (qty > 0) {
        capital -= qty * price;
        position = qty;
        trades.push({ date: klines[i].timestamp, type: 'buy', price, quantity: qty, reason: `RSI超卖${rsi.toFixed(0)}` });
      }
    }
    // 超买卖出
    else if (rsi > 70 && position > 0) {
      capital += position * price;
      trades.push({ date: klines[i].timestamp, type: 'sell', price, quantity: position, reason: `RSI超买${rsi.toFixed(0)}` });
      position = 0;
    }
  }
  
  if (position > 0) {
    capital += position * klines[klines.length - 1].close;
  }
  
  return calculateResult(params, klines, trades, initialCapital, capital);
}

/**
 * 计算结果
 */
function calculateResult(params: BacktestParams, klines: KLine[], trades: Trade[], initialCapital: number, finalCapital: number): BacktestResult {
  const totalReturn = finalCapital - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;
  
  // 计算最大回撤
  let maxDrawdown = 0;
  let peak = initialCapital;
  let current = initialCapital;
  
  for (const trade of trades) {
    if (trade.type === 'buy') {
      current -= trade.price * trade.quantity;
    } else {
      current += trade.price * trade.quantity;
    }
    if (current > peak) peak = current;
    const drawdown = (peak - current) / peak * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // 胜率
  let wins = 0;
  for (let i = 0; i < trades.length - 1; i += 2) {
    if (trades[i].type === 'buy' && trades[i + 1]?.type === 'sell') {
      if (trades[i + 1].price > trades[i].price) wins++;
    }
  }
  const winRate = trades.length > 0 ? (wins / (trades.length / 2)) * 100 : 0;
  
  return {
    symbol: params.symbol,
    strategy: params.strategy,
    startDate: new Date(klines[0]?.timestamp || Date.now()).toISOString().split('T')[0],
    endDate: new Date(klines[klines.length - 1]?.timestamp || Date.now()).toISOString().split('T')[0],
    initialCapital,
    finalCapital,
    totalReturn,
    totalReturnPct,
    maxDrawdown,
    winRate,
    trades: trades.length / 2,
    holdingDays: Math.floor((klines[klines.length - 1].timestamp - klines[0].timestamp) / (1000 * 60 * 60 * 24)),
  };
}

/**
 * 运行回测
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult | null> {
  logger.info(`[Backtest] 开始回测: ${params.symbol} ${params.strategy}`);
  
  try {
    const klines = await getHistoryKLine(params.symbol, params.market, '1d', '1y');
    
    if (klines.length < 50) {
      logger.warn(`[Backtest] 数据不足: ${klines.length}条`);
      return null;
    }
    
    switch (params.strategy) {
      case 'ma':
        return await backtestMA(params, klines);
      case 'rsi':
        return await backtestRSI(params, klines);
      default:
        logger.error(`[Backtest] 未知策略: ${params.strategy}`);
        return null;
    }
  } catch (error) {
    logger.error('[Backtest] 回测失败:', error);
    return null;
  }
}

/**
 * 批量回测
 */
export async function batchBacktest(
  symbols: string[],
  market: 'a' | 'hk' | 'us',
  strategy: 'ma' | 'rsi' | 'breakout'
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];
  
  for (const symbol of symbols) {
    const result = await runBacktest({ symbol, market, strategy });
    if (result) results.push(result);
  }
  
  return results.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
}
