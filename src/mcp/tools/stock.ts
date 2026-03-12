/**
 * A股股票行情 MCP 工具
 * 
 * 提供实时行情和历史K线数据获取功能
 * 数据来源：东方财富API
 */

import { logger } from '../../utils/logger';

/**
 * 东方财富API基础URL
 */
const EASTMONEY_BASE_URL = 'https://push2.eastmoney.com';

/**
 * 解析A股市场代码
 * a股: sh（上交所）、sz（深交所）
 */
function parseMarketCode(symbol: string, market?: string): string {
  // 如果传入market参数，优先使用
  if (market === 'a' || market === 'sh' || market === 'sz' || market === 'bj') {
    if (market === 'a') {
      // 根据代码判断市场：6开头上海，0/3开头深圳
      if (symbol.startsWith('6')) return 'sh';
      if (symbol.startsWith('0') || symbol.startsWith('3')) return 'sz';
      if (symbol.startsWith('8') || symbol.startsWith('4')) return 'bj';
    }
    return market === 'sh' ? 'sh' : market === 'sz' ? 'sz' : market === 'bj' ? 'bj' : 'sh';
  }
  // 根据代码判断市场
  if (symbol.startsWith('6')) return 'sh';
  if (symbol.startsWith('0') || symbol.startsWith('3')) return 'sz';
  if (symbol.startsWith('8') || symbol.startsWith('4')) return 'bj';
  return 'sh';
}

/**
 * 获取实时行情 - 调用东方财富API
 */
export async function fetch_realtime_quote(params: {
  symbol: string;
  market?: string;
}): Promise<{
  symbol: string;
  name: string;
  market: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  bidVolume: number;
  askVolume: number;
  limitUp: number;
  limitDown: number;
  prevClose: number;
  quoteTime: string;
}> {
  const { symbol, market } = params;
  const marketCode = parseMarketCode(symbol, market);
  
  logger.info(`[MCP] fetch_realtime_quote symbol=${symbol} market=${marketCode}`);

  try {
    // 东方财富实时行情API
    const url = `${EASTMONEY_BASE_URL}/api/qt/stock/get`;
    const fullSymbol = `${marketCode}${symbol}`;
    const apiUrl = `${url}?secid=${marketCode === 'sh' ? '1.' : marketCode === 'sz' ? '0.' : '0.'}${symbol}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f59,f60,f116,f117,f162,f167,f168,f169,f170,f171,f173,f177`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json() as any;
    
    if (!data.data) {
      throw new Error(`Stock not found: ${symbol}`);
    }

    const d = data.data;
    return {
      symbol: symbol,
      name: d.f58 || '',
      market: marketCode,
      lastPrice: d.f43 / 10000,  // 价格单位转换
      open: d.f44 / 10000,
      high: d.f45 / 10000,
      low: d.f46 / 10000,
      volume: d.f47,              // 成交量（手）
      amount: d.f48 / 10000,       // 成交额（万元 -> 元）
      change: (d.f43 - d.f60) / 10000,
      changePercent: ((d.f43 - d.f60) / d.f60 * 100),
      bid: d.f50 / 10000,         // 买一价
      ask: d.f51 / 10000,         // 卖一价
      bidVolume: d.f52,           // 买一量
      askVolume: d.f57,           // 卖一量
      limitUp: d.f170 / 10000,    // 涨停价
      limitDown: d.f171 / 10000,  // 跌停价
      prevClose: d.f60 / 10000,   // 昨收
      quoteTime: new Date().toISOString(),
    };
  } catch (error: any) {
    logger.error(`[MCP] fetch_realtime_quote error:`, error);
    throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
  }
}

/**
 * 获取历史K线 - 调用东方财富API
 */
export async function fetch_kline(params: {
  symbol: string;
  market?: string;
  period?: '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week' | '1month';
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{
  symbol: string;
  period: string;
  data: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
  }>;
  total: number;
}> {
  const { 
    symbol, 
    market, 
    period = '1day',
    startDate,
    endDate,
    limit = 500 
  } = params;
  
  const marketCode = parseMarketCode(symbol, market);
  
  logger.info(`[MCP] fetch_kline symbol=${symbol} period=${period}`);

  try {
    // K线周期映射到东方财富API参数
    const periodMap: Record<string, { type: string; unit: number }> = {
      '1min': { type: '1', unit: 60 },
      '5min': { type: '5', unit: 300 },
      '15min': { type: '15', unit: 900 },
      '30min': { type: '30', unit: 1800 },
      '1hour': { type: '60', unit: 3600 },
      '1day': { type: '101', unit: 86400 },
      '1week': { type: '102', unit: 604800 },
      '1month': { type: '103', unit: 2592000 },
    };
    
    const periodConfig = periodMap[period] || periodMap['1day'];
    
    // 计算时间范围
    const now = Date.now();
    let startTime = 0;
    
    if (startDate) {
      startTime = new Date(startDate).getTime();
    } else {
      // 默认获取最近N条数据
      startTime = now - (limit * periodConfig.unit * 1000);
    }
    
    const endTime = endDate ? new Date(endDate).getTime() : now;
    
    // 东方财富K线API
    const url = `${EASTMONEY_BASE_URL}/api/qt/stock/kline/get`;
    const paramsStr = `secid=${marketCode === 'sh' ? '1.' : marketCode === 'sz' ? '0.' : '0.'}${symbol}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${periodConfig.type}&fqt=0&beg=${startTime}&end=${endTime}&lmt=${limit}`;
    
    const response = await fetch(`${url}?${paramsStr}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (!result.data || !result.data.klines) {
      throw new Error(`No K-line data for ${symbol}`);
    }

    const klines = result.data.klines;
    const data = klines.map((kline: string) => {
      const parts = kline.split(',');
      return {
        time: parts[0],
        open: parseFloat(parts[1]),
        high: parseFloat(parts[2]),
        low: parseFloat(parts[3]),
        close: parseFloat(parts[4]),
        volume: parseInt(parts[5]),
        amount: parseFloat(parts[6]) || 0,
      };
    });

    return {
      symbol,
      period,
      data,
      total: data.length,
    };
  } catch (error: any) {
    logger.error(`[MCP] fetch_kline error:`, error);
    throw new Error(`Failed to fetch K-line for ${symbol}: ${error.message}`);
  }
}

/**
 * 批量获取多个股票实时行情
 */
export async function fetch_batch_quote(params: {
  symbols: string[];
  market?: string;
}): Promise<{
  quotes: Array<{
    symbol: string;
    name: string;
    market: string;
    lastPrice: number;
    change: number;
    changePercent: number;
    quoteTime: string;
  }>;
  failed: string[];
}> {
  const { symbols, market } = params;
  
  logger.info(`[MCP] fetch_batch_quote count=${symbols.length}`);

  const quotes: Array<{
    symbol: string;
    name: string;
    market: string;
    lastPrice: number;
    change: number;
    changePercent: number;
    quoteTime: string;
  }> = [];
  const failed: string[] = [];

  // 并发获取（限制并发数）
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(s => fetch_realtime_quote({ symbol: s, market }))
    );
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const q = result.value;
        quotes.push({
          symbol: q.symbol,
          name: q.name,
          market: q.market,
          lastPrice: q.lastPrice,
          change: q.change,
          changePercent: q.changePercent,
          quoteTime: q.quoteTime,
        });
      } else {
        failed.push(batch[idx]);
      }
    });
  }

  return { quotes, failed };
}

/**
 * 搜索股票（A股）
 */
export async function search_stock(params: {
  keyword: string;
  market?: 'sh' | 'sz' | 'bj' | 'all';
  limit?: number;
}): Promise<{
  suggestions: Array<{
    symbol: string;
    name: string;
    market: string;
    exchange: string;
    securityType: string;
  }>;
}> {
  const { keyword, market = 'all', limit = 10 } = params;
  
  logger.info(`[MCP] search_stock keyword=${keyword}`);

  try {
    // 东方财富股票搜索API
    const url = `https://searchapi.eastmoney.com/api/suggest/get`;
    const inputParams = `input=${encodeURIComponent(keyword)}&type=14&token=43C147C0E63E425EB3A5E02F24F5B8&count=${limit}`;
    
    const response = await fetch(`${url}?${inputParams}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Search API request failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (!result.Datas) {
      return { suggestions: [] };
    }

    const suggestions = result.Datas
      .filter((item: any) => {
        if (market === 'all') return true;
        const m = item.Exchange === 'SSE' ? 'sh' : item.Exchange === 'SZSE' ? 'sz' : 'bj';
        return m === market;
      })
      .slice(0, limit)
      .map((item: any) => ({
        symbol: item.Symbol,
        name: item.Name,
        market: item.Exchange === 'SSE' ? 'sh' : item.Exchange === 'SZSE' ? 'sz' : 'bj',
        exchange: item.Exchange || '',
        securityType: item.Type || 'stock',
      }));

    return { suggestions };
  } catch (error: any) {
    logger.error(`[MCP] search_stock error:`, error);
    throw new Error(`Failed to search stock: ${error.message}`);
  }
}
