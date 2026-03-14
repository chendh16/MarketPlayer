/**
 * 港股美股实时行情服务
 */

import { logger } from '../../utils/logger';

/**
 * 实时行情数据
 */
export interface RealtimeQuote {
  symbol: string;
  market: 'hk' | 'us';
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  bid: number;      // 买价
  ask: number;      // 卖价
  timestamp: Date;
}

/**
 * 获取港股实时行情
 */
export async function getHKQuote(symbol: string): Promise<RealtimeQuote | null> {
  try {
    const hkCode = symbol.padStart(5, '0');
    const url = `https://qt.gtimg.cn/q=${hkCode}`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    if (!text || text.includes('null')) return null;
    
    // 腾讯财经格式: "1="股票名","2="代码","3="当前价格","4="昨收","5="开盘","6="成交量","7..." 
    const match = text.match(/"([^"]+)"/);
    if (!match) return null;
    
    const parts = match[1].split('~');
    
    return {
      symbol,
      market: 'hk',
      name: parts[1] || '',
      price: parseFloat(parts[3]) || 0,
      change: parseFloat(parts[3]) - parseFloat(parts[4]) || 0,
      changePct: ((parseFloat(parts[3]) - parseFloat(parts[4])) / parseFloat(parts[4]) * 100) || 0,
      open: parseFloat(parts[5]) || 0,
      high: parseFloat(parts[33]) || 0,
      low: parseFloat(parts[34]) || 0,
      volume: parseFloat(parts[6]) || 0,
      amount: parseFloat(parts[37]) || 0,
      bid: parseFloat(parts[9]) || 0,
      ask: parseFloat(parts[19]) || 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Quote] 获取港股行情失败:', error);
    return null;
  }
}

/**
 * 获取美股实时行情
 */
export async function getUSQuote(symbol: string): Promise<RealtimeQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!data?.chart?.result?.[0]) return null;
    
    const result = data.chart.result[0];
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    
    const currentPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    
    return {
      symbol,
      market: 'us',
      name: meta.symbol || symbol,
      price: currentPrice,
      change: currentPrice - previousClose,
      changePct: ((currentPrice - previousClose) / previousClose * 100) || 0,
      open: meta.regularMarketOpen || 0,
      high: meta.regularMarketDayHigh || 0,
      low: meta.regularMarketDayLow || 0,
      volume: meta.regularMarketVolume || 0,
      amount: 0,
      bid: 0,
      ask: 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Quote] 获取美股行情失败:', error);
    return null;
  }
}

/**
 * 批量获取港股行情
 */
export async function getBatchHKQuotes(symbols: string[]): Promise<RealtimeQuote[]> {
  const results: RealtimeQuote[] = [];
  
  // 腾讯API支持批量
  const codes = symbols.map(s => s.padStart(5, '0')).join(',');
  const url = `https://qt.gtimg.cn/q=${codes}`;
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    const matches = text.match(/"[^"]+"/g) || [];
    
    symbols.forEach((symbol, index) => {
      if (matches[index]) {
        const parts = matches[index].replace(/"/g, '').split('~');
        results.push({
          symbol,
          market: 'hk',
          name: parts[1] || '',
          price: parseFloat(parts[3]) || 0,
          change: parseFloat(parts[3]) - parseFloat(parts[4]) || 0,
          changePct: ((parseFloat(parts[3]) - parseFloat(parts[4])) / parseFloat(parts[4]) * 100) || 0,
          open: parseFloat(parts[5]) || 0,
          high: parseFloat(parts[33]) || 0,
          low: parseFloat(parts[34]) || 0,
          volume: parseFloat(parts[6]) || 0,
          amount: parseFloat(parts[37]) || 0,
          bid: parseFloat(parts[9]) || 0,
          ask: parseFloat(parts[19]) || 0,
          timestamp: new Date(),
        });
      }
    });
  } catch (error) {
    logger.error('[Quote] 批量获取港股行情失败:', error);
  }
  
  return results;
}

/**
 * 批量获取美股行情
 */
export async function getBatchUSQuotes(symbols: string[]): Promise<RealtimeQuote[]> {
  const results: RealtimeQuote[] = [];
  
  for (const symbol of symbols) {
    const quote = await getUSQuote(symbol);
    if (quote) results.push(quote);
  }
  
  return results;
}

/**
 * K线数据
 */
export interface KLine {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 获取历史K线
 */
export async function getHistoryKLine(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  interval: '1d' | '1w' | '1M' = '1d',
  range: string = '1y'
): Promise<KLine[]> {
  try {
    if (market === 'us') {
      return await getUSKLine(symbol, interval, range);
    } else if (market === 'hk') {
      return await getHKKLine(symbol, interval, range);
    }
    return [];
  } catch (error) {
    logger.error('[KLine] 获取K线失败:', error);
    return [];
  }
}

async function getUSKLine(symbol: string, interval: string, range: string): Promise<KLine[]> {
  const intervalMap: Record<string, string> = {
    '1d': '1d',
    '1w': '1wk',
    '1M': '1mo',
  };
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${intervalMap[interval]}&range=${range}`;
  
  const response = await fetch(url);
  const data = await response.json() as any;
  
  if (!data?.chart?.result?.[0]) return [];
  
  const result = data.chart.result[0];
  const timestamps = result.timestamp as number[];
  const quote = result.indicators?.quote?.[0];
  
  if (!timestamps || !quote) return [];
  
  return timestamps.map((ts, i) => ({
    timestamp: ts * 1000,
    open: quote.open?.[i] || 0,
    high: quote.high?.[i] || 0,
    low: quote.low?.[i] || 0,
    close: quote.close?.[i] || 0,
    volume: quote.volume?.[i] || 0,
  }));
}

async function getHKKLine(symbol: string, interval: string, range: string): Promise<KLine[]> {
  // 港股K线 - 使用英为财情
  const period = range === '1y' ? '1year' : range === '6m' ? '6month' : '1month';
  const url = `https://cn.investing.com/instruments/HistoricalDataAjax`;
  
  // 简化处理
  logger.warn('[KLine] 港股K线获取待完善');
  return [];
}

// ==================== 兼容旧版本 ====================

export type StockQuote = RealtimeQuote;

export async function getUSStockPrice(symbol: string): Promise<StockQuote | null> {
  return getUSQuote(symbol);
}

export async function getHKStockPrice(symbol: string): Promise<StockQuote | null> {
  return getHKQuote(symbol);
}

// ==================== 兼容旧版本2 ====================

export type Market = 'a' | 'hk' | 'us';

export const DEFAULT_STOCKS: Record<Market, Array<{code: string, name: string}>> = {
  a: [
    {code: '000001', name: '平安银行'},
    {code: '600000', name: '浦发银行'},
    {code: '600519', name: '贵州茅台'},
  ],
  hk: [
    {code: '00700', name: '腾讯控股'},
    {code: '09988', name: '阿里巴巴'},
  ],
  us: [
    {code: 'AAPL', name: '苹果'},
    {code: 'MSFT', name: '微软'},
  ],
};

// ==================== 兼容旧版本3 ====================

export async function getStockPrice(market: Market, symbol: string): Promise<StockQuote | null> {
  if (market === 'us') {
    return getUSQuote(symbol);
  } else if (market === 'hk') {
    return getHKQuote(symbol);
  }
  return null;
}
