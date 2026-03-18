/**
 * 港股美股基本面 MCP 工具
 *
 * 提供港股/美股行情、K线、资金流向数据获取
 * 数据来源：Yahoo Finance / 腾讯港股API
 */

import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getHKStockDetail, getUSStockDetail, HKStockDetail, USStockDetail } from '../../services/market/hk-us-service';

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

// ==================== 港股K线 ====================

/**
 * 获取港股K线 - 腾讯API
 */
export async function fetch_hk_kline(params: {
  code: string;
  period?: '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week';
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  data?: KlineData[];
  error?: string;
}> {
  const { code, period = '1day', startDate, endDate, limit = 500 } = params;
  logger.info(`[MCP] fetch_hk_kline code=${code} period=${period}`);

  try {
    // 腾讯港股K线API - 修正格式
    const hkCode = code.padStart(5, '0');

    // 周期映射 - 腾讯使用 day/week/min
    const periodMap: Record<string, string> = {
      '1min': 'min',
      '5min': '5min',
      '15min': '15min',
      '30min': '30min',
      '1hour': '60min',
      '1day': 'day',
      '1week': 'week',
    };

    const periodType = periodMap[period] || 'day';

    // 腾讯API格式: param=hk00700,day,,,500,qfq
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline_${period}&param=hk${hkCode},${periodType},,,${limit},qfq`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    // 解析返回数据 - 格式: kline_1day={"code":0,"data":{"hk00700":{"day":[...]}}}
    let klineData: string[] = [];
    try {
      const jsonMatch = text.match(/kline_[^=]+=(.+)/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        const dayData = parsed.data?.[`hk${hkCode}`]?.day;
        if (dayData && Array.isArray(dayData)) {
          klineData = dayData;
        }
      }
    } catch (e) {
      logger.error('[MCP] parse error:', e);
    }

    if (klineData.length === 0) {
      return { success: false, error: '无法解析K线数据' };
    }

    const klines: KlineData[] = klineData.slice(0, limit).map((item: any) => ({
      time: item[0],
      open: parseFloat(item[1]) || 0,
      close: parseFloat(item[2]) || 0,
      high: parseFloat(item[3]) || 0,
      low: parseFloat(item[4]) || 0,
      volume: parseInt(item[5]) || 0,
    }));

    return { success: true, data: klines };
  } catch (error: any) {
    logger.error('[MCP] fetch_hk_kline error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== 美股K线 ====================

/**
 * 获取美股K线 - Yahoo Finance / Alpha Vantage
 */
export async function fetch_us_kline(params: {
  code: string;
  period?: '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week' | '1month';
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  data?: KlineData[];
  error?: string;
}> {
  const { code, period = '1day', startDate, endDate, limit = 500 } = params;
  logger.info(`[MCP] fetch_us_kline code=${code} period=${period}`);

  // 首先尝试 Yahoo Finance
  try {
    const intervalMap: Record<string, string> = {
      '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
      '1hour': '1h', '1day': '1d', '1week': '1wk', '1month': '1mo',
    };
    const interval = intervalMap[period] || '1d';

    let startTime: number;
    if (startDate) {
      startTime = Math.floor(new Date(startDate).getTime() / 1000);
    } else {
      const periodSeconds: Record<string, number> = {
        '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
        '1hour': 3600, '1day': 86400, '1week': 604800, '1month': 2592000,
      };
      const sec = periodSeconds[period] || 86400;
      startTime = Math.floor(Date.now() / 1000) - limit * sec;
    }
    const endTime = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

    const ticker = code.includes('.') ? code : `${code}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${startTime}&period2=${endTime}&count=${limit}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
      },
    });

    if (response.ok) {
      const data = await response.json() as any;
      const result = data.chart?.result?.[0];

      if (result && result.timestamp && result.indicators?.quote?.[0]) {
        const timestamps = result.timestamp as number[];
        const quotes = result.indicators.quote[0];

        const klines: KlineData[] = timestamps.map((ts, i) => ({
          time: new Date(ts * 1000).toISOString(),
          open: quotes.open[i] || 0,
          high: quotes.high[i] || 0,
          low: quotes.low[i] || 0,
          close: quotes.close[i] || 0,
          volume: quotes.volume[i] || 0,
        })).filter(k => k.close > 0);

        if (klines.length > 0) {
          return { success: true, data: klines };
        }
      }
    }
  } catch (error: any) {
    logger.warn('[MCP] Yahoo fetch failed:', error.message);
  }

  // Yahoo 失败或无数据，尝试 Alpha Vantage
  try {
    const apiKey = config.ALPHA_VANTAGE_API_KEY;
    logger.info(`[MCP] Alpha Vantage API Key: ${apiKey?.substring(0, 5)}...`);

    if (apiKey && apiKey !== 'your_key') {
      const func = period === '1day' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
      const url = `https://www.alphavantage.co/query?function=${func}&symbol=${code}&apikey=${apiKey}${period !== '1day' ? `&interval=${period}` : ''}`;

      const response = await fetch(url);
      const data = await response.json() as any;

      const timeKey = data['Meta Data']?.['4. Last Refreshed'] ? 'Time Series (Daily)' : 
                      data['Meta Data']?.['3. Last Refreshed'] ? 'Time Series (Daily)' : null;

      if (timeKey && data[timeKey]) {
        const timeSeries = data[timeKey];
        const klines: KlineData[] = Object.entries(timeSeries)
          .slice(0, limit)
          .map(([date, values]: [string, any]) => ({
            time: date,
            open: parseFloat(values['1. open']) || 0,
            high: parseFloat(values['2. high']) || 0,
            low: parseFloat(values['3. low']) || 0,
            close: parseFloat(values['4. close']) || 0,
            volume: parseInt(values['5. volume']) || 0,
          })).reverse();

        return { success: true, data: klines };
      }
    }
  } catch (error: any) {
    logger.warn('[MCP] Alpha Vantage fetch failed:', error.message);
  }

  return {
    success: false,
    error: 'Yahoo Finance 访问受限，请配置 ALPHA_VANTAGE_API_KEY 或稍后重试'
  };
}

/**
 * 获取港股基本面数据
 */
export async function get_hk_stock_detail(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: HKStockDetail;
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_hk_stock_detail code=${code}`);

  try {
    const data = await getHKStockDetail(code);

    if (!data) {
      return {
        success: false,
        error: `无法获取港股${code}数据`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    logger.error(`[MCP] get_hk_stock_detail error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取美股基本面数据
 */
export async function get_us_stock_detail(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: USStockDetail;
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_us_stock_detail code=${code}`);

  try {
    const data = await getUSStockDetail(code);

    if (!data) {
      return {
        success: false,
        error: `无法获取美股${code}数据`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    logger.error(`[MCP] get_us_stock_detail error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 批量获取港股数据
 */
export async function get_batch_hk_stocks(params: {
  codes: string[];
}): Promise<{
  success: boolean;
  data: HKStockDetail[];
  errors: string[];
}> {
  const { codes } = params;
  logger.info(`[MCP] get_batch_hk_stocks count=${codes.length}`);

  const results: HKStockDetail[] = [];
  const errors: string[] = [];

  for (const code of codes) {
    try {
      const data = await getHKStockDetail(code);
      if (data) {
        results.push(data);
      } else {
        errors.push(code);
      }
    } catch (error) {
      errors.push(code);
    }
  }

  return {
    success: results.length > 0,
    data: results,
    errors,
  };
}

/**
 * 批量获取美股数据
 */
export async function get_batch_us_stocks(params: {
  codes: string[];
}): Promise<{
  success: boolean;
  data: USStockDetail[];
  errors: string[];
}> {
  const { codes } = params;
  logger.info(`[MCP] get_batch_us_stocks count=${codes.length}`);

  const results: USStockDetail[] = [];
  const errors: string[] = [];

  for (const code of codes) {
    try {
      const data = await getUSStockDetail(code);
      if (data && data.price > 0) {
        results.push(data);
      } else {
        errors.push(code);
      }
    } catch (error) {
      errors.push(code);
    }
  }

  return {
    success: results.length > 0,
    data: results,
    errors,
  };
}

// ==================== 港股资金流向 ====================

/**
 * 获取港股资金流向
 * 注意：由于网络限制，当前可能无法获取
 */
export async function get_hk_stock_flow(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: {
    code: string;
    name: string;
    mainNetInflow: number;    // 主力净流入(万港币)
    mainNetInflowPct: number; // 主力净流入占比
    close: number;            // 收盘价
    changePct: number;        // 涨跌幅
    timestamp: string;
    note?: string;
  };
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_hk_stock_flow code=${code}`);

  try {
    const hkCode = code.padStart(5, '0');
    // 东方财富港股资金流向API
    const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=0.${hkCode}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;

    // 检查返回数据
    if (!data.data || !data.data.klines || data.data.klines.length === 0) {
      // 返回基本信息（从实时报价获取）
      const quoteUrl = `https://qt.gtimg.cn/q=phk${hkCode}`;
      const quoteRes = await fetch(quoteUrl, { signal: AbortSignal.timeout(5000) });
      if (quoteRes.ok) {
        const quoteText = await quoteRes.text();
        const quoteMatch = quoteText.match(/"([^"]+)"/);
        if (quoteMatch) {
          const parts = quoteMatch[1].split('~');
          return {
            success: true,
            data: {
              code,
              name: parts[1] || '',
              mainNetInflow: 0,
              mainNetInflowPct: 0,
              close: parseFloat(parts[3]) || 0,
              changePct: parseFloat(parts[5]) || 0,
              timestamp: new Date().toISOString(),
              note: '资金流向数据暂不可用',
            },
          };
        }
      }
      return { success: false, error: '无资金流向数据' };
    }

    const klines = data.data.klines;
    // 取最新一条
    const latest = klines[klines.length - 1].split(',');

    return {
      success: true,
      data: {
        code,
        name: latest[0] || '',
        mainNetInflow: parseFloat(latest[1]) || 0,
        mainNetInflowPct: parseFloat(latest[2]) || 0,
        close: parseFloat(latest[7]) || 0,
        changePct: parseFloat(latest[8]) || 0,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('[MCP] get_hk_stock_flow error:', error);
    return {
      success: true,
      data: {
        code,
        name: '',
        mainNetInflow: 0,
        mainNetInflowPct: 0,
        close: 0,
        changePct: 0,
        timestamp: new Date().toISOString(),
        note: '资金流向API暂不可用，请稍后重试',
      },
      error: error.message
    };
  }
}

// ==================== 美股资金流向 ====================

/**
 * 获取美股资金流向（Alpha Vantage - 需要API Key）
 * 注意：免费API有限制，可能无法获取实时资金流向
 */
export async function get_us_stock_flow(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: {
    code: string;
    price: number;
    changePercent: number;
    volume: number;
    note: string;
  };
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_us_stock_flow code=${code}`);

  try {
    const apiKey = config.ALPHA_VANTAGE_API_KEY;

    if (!apiKey || apiKey === 'your_key') {
      return {
        success: true,
        data: {
          code,
          price: 0,
          changePercent: 0,
          volume: 0,
          note: '请配置 ALPHA_VANTAGE_API_KEY 以获取完整资金流向数据',
        },
      };
    }

    // Alpha Vantage 的 GLOBAL_QUOTE 可以获取价格和成交量
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${code}&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json() as any;
    const quote = data['Global Quote'];

    if (!quote || Object.keys(quote).length === 0) {
      return { success: false, error: '无法获取美股数据' };
    }

    return {
      success: true,
      data: {
        code,
        price: parseFloat(quote['05. price']) || 0,
        changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
        volume: parseInt(quote['06. volume']) || 0,
        note: '完整资金流向需付费API',
      },
    };
  } catch (error: any) {
    logger.error('[MCP] get_us_stock_flow error:', error);
    return { success: false, error: error.message };
  }
}
