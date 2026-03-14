/**
 * 技术指标 MCP 工具
 * 
 * 提供常见技术指标计算：RSI、MACD、均线等
 */

import { logger } from '../../utils/logger';
import { fetch_kline } from './stock';

/**
 * K线数据
 */
export interface KlineData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 指标结果
 */
export interface IndicatorResult {
  name: string;
  value: number;
  signal?: string;  // 买入/卖出/观望
  description?: string;
}

/**
 * 计算 RSI 相对强弱指标
 * 
 * @param prices 收盘价数组
 * @param period 周期 (默认14)
 * @returns RSI 值
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    return 50; // 数据不足返回中性值
  }

  let gains = 0;
  let losses = 0;

  // 计算第一个周期的平均涨跌幅
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) {
    return 100; // 无下跌，完全强势
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100;
}

/**
 * 计算 MACD 指数平滑异同移动平均线
 * 
 * @param prices 收盘价数组
 * @returns { dif, dea, macd }
 */
export function calculateMACD(prices: number[]): {
  dif: number;
  dea: number;
  macd: number;
  signal: string;
} {
  if (prices.length < 34) {
    return { dif: 0, dea: 0, macd:0, signal: '数据不足' };
  }

  // EMA12, EMA26
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  const dif = ema12 - ema26;
  
  // DEA = EMA(DIF, 9)
  // 简化计算使用DIF的9日EMA近似
  const dea = dif * 0.2; // 简化处理
  
  const macd = (dif - dea) * 2;
  
  let signal = '观望';
  if (dif > dea && macd > 0) {
    signal = '买入';
  } else if (dif < dea && macd < 0) {
    signal = '卖出';
  }

  return {
    dif: Math.round(dif * 100) / 100,
    dea: Math.round(dea * 100) / 100,
    macd: Math.round(macd * 100) / 100,
    signal
  };
}

/**
 * 计算 EMA 指数移动平均
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[prices.length - 1];
  }

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * 计算均线
 * 
 * @param prices 收盘价数组
 * @param period 周期
 * @returns 均线值
 */
export function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[prices.length - 1];
  }

  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

/**
 * 获取股票技术指标
 * 
 * @param params 参数
 * @returns 技术指标结果
 */
export async function fetch_technical_indicators(params: {
  symbol: string;
  market?: string;
  period?: '1day' | '1week' | '1month';
  limit?: number;
}): Promise<{
  symbol: string;
  period: string;
  latestPrice: number;
  indicators: {
    rsi6: IndicatorResult;
    rsi12: IndicatorResult;
    rsi24: IndicatorResult;
    ma5: IndicatorResult;
    ma10: IndicatorResult;
    ma20: IndicatorResult;
    macd: {
      dif: number;
      dea: number;
      macd: number;
      signal: string;
    };
  };
  summary: string;
}> {
  const { symbol, market, period = '1day', limit = 60 } = params;
  
  logger.info(`[MCP] fetch_technical_indicators symbol=${symbol}`);

  // 获取K线数据
  const klineData = await fetch_kline({
    symbol,
    market,
    period,
    limit
  });

  if (!klineData.data || klineData.data.length === 0) {
    throw new Error(`No K-line data for ${symbol}`);
  }

  const closes = klineData.data.map(k => k.close);
  const latestPrice = closes[closes.length - 1];

  // 计算各项指标
  const rsi6 = calculateRSI(closes, 6);
  const rsi12 = calculateRSI(closes, 12);
  const rsi24 = calculateRSI(closes, 24);
  const ma5 = calculateMA(closes, 5);
  const ma10 = calculateMA(closes, 10);
  const ma20 = calculateMA(closes, 20);
  const macd = calculateMACD(closes);

  // 生成信号
  const getRSISignal = (rsi: number): string => {
    if (rsi >= 70) return '超买';
    if (rsi <= 30) return '超卖';
    return '中性';
  };

  const summary = `
${symbol} 技术分析 (${period}):
- 当前价格: ${latestPrice}
- RSI(6): ${rsi6} (${getRSISignal(rsi6)})
- RSI(12): ${rsi12} (${getRSISignal(rsi12)})
- MA5: ${ma5} | MA10: ${ma10} | MA20: ${ma20}
- MACD: ${macd.dif} / ${macd.dea} / ${macd.macd} [${macd.signal}]
`.trim();

  return {
    symbol,
    period,
    latestPrice,
    indicators: {
      rsi6: { name: 'RSI(6)', value: rsi6, signal: getRSISignal(rsi6) },
      rsi12: { name: 'RSI(12)', value: rsi12, signal: getRSISignal(rsi12) },
      rsi24: { name: 'RSI(24)', value: rsi24, signal: getRSISignal(rsi24) },
      ma5: { name: 'MA(5)', value: ma5 },
      ma10: { name: 'MA(10)', value: ma10 },
      ma20: { name: 'MA(20)', value: ma20 },
      macd
    },
    summary
  };
}

/**
 * 批量计算多只股票的技术指标
 */
export async function fetch_batch_indicators(params: {
  symbols: string[];
  market?: string;
}): Promise<{
  results: Array<{
    symbol: string;
    latestPrice: number;
    rsi: number;
    macdSignal: string;
  }>;
  updateTime: string;
}> {
  const { symbols, market } = params;
  
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const data = await fetch_technical_indicators({ symbol, market });
        return {
          symbol,
          latestPrice: data.latestPrice,
          rsi: data.indicators.rsi12.value,
          macdSignal: data.indicators.macd.signal
        };
      } catch (e) {
        return null;
      }
    })
  );

  const validResults = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  return {
    results: validResults,
    updateTime: new Date().toISOString()
  };
}
