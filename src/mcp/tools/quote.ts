/**
 * 实时行情 MCP 工具
 */

import { logger } from '../../utils/logger';
import { 
  getHKQuote, 
  getUSQuote, 
  getBatchHKQuotes, 
  getBatchUSQuotes,
  getHistoryKLine,
  RealtimeQuote,
  KLine 
} from '../../services/market/quote-service';

/**
 * 获取港股实时行情
 */
export async function get_hk_quote(params: {
  symbol: string;
}): Promise<{
  success: boolean;
  data?: RealtimeQuote;
  error?: string;
}> {
  logger.info(`[MCP] get_hk_quote ${params.symbol}`);
  
  try {
    const data = await getHKQuote(params.symbol);
    
    if (!data) {
      return { success: false, error: '无法获取行情' };
    }
    
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取美股实时行情
 */
export async function get_us_quote(params: {
  symbol: string;
}): Promise<{
  success: boolean;
  data?: RealtimeQuote;
  error?: string;
}> {
  logger.info(`[MCP] get_us_quote ${params.symbol}`);
  
  try {
    const data = await getUSQuote(params.symbol);
    
    if (!data) {
      return { success: false, error: '无法获取行情' };
    }
    
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 批量获取港股行情
 */
export async function get_batch_hk_quotes(params: {
  symbols: string[];
}): Promise<{
  success: boolean;
  data: RealtimeQuote[];
}> {
  logger.info(`[MCP] get_batch_hk_quotes ${params.symbols.length}`);
  
  const data = await getBatchHKQuotes(params.symbols);
  
  return { success: true, data };
}

/**
 * 批量获取美股行情
 */
export async function get_batch_us_quotes(params: {
  symbols: string[];
}): Promise<{
  success: boolean;
  data: RealtimeQuote[];
}> {
  logger.info(`[MCP] get_batch_us_quotes ${params.symbols.length}`);
  
  const data = await getBatchUSQuotes(params.symbols);
  
  return { success: true, data };
}

/**
 * 获取历史K线
 */
export async function get_history_kline(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  interval?: '1d' | '1w' | '1M';
  range?: string;
}): Promise<{
  success: boolean;
  data?: KLine[];
  error?: string;
}> {
  const { symbol, market, interval = '1d', range = '1y' } = params;
  logger.info(`[MCP] get_history_kline ${symbol} ${market}`);
  
  try {
    const data = await getHistoryKLine(symbol, market, interval, range);
    
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 快速行情摘要
 */
export async function get_quote_summary(params: {
  symbols: string[];
  market: 'hk' | 'us';
}): Promise<{
  success: boolean;
  data: Array<{
    symbol: string;
    price: number;
    changePct: number;
    volume: number;
  }>;
}> {
  const { symbols, market } = params;
  
  let quotes: RealtimeQuote[] = [];
  
  if (market === 'hk') {
    quotes = await getBatchHKQuotes(symbols);
  } else {
    quotes = await getBatchUSQuotes(symbols);
  }
  
  return {
    success: true,
    data: quotes.map(q => ({
      symbol: q.symbol,
      price: q.price,
      changePct: q.changePct,
      volume: q.volume,
    })),
  };
}
