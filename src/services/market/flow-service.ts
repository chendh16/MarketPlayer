/**
 * 资金流向数据服务
 * 
 * 获取A股/港股/美股资金流向
 * 北向资金、主力资金、大单流向
 */

import { logger } from '../../utils/logger';

/**
 * 资金流向数据
 */
export interface FlowData {
  market: string;
  symbol: string;
  name: string;
  mainNetInflow: number;   // 主力净流入(万)
  mainNetInflowPct: number; // 主力净流入占比
  superNetInflow: number;   // 超大单净流入
  largeNetInflow: number;   // 大单净流入
  mediumNetInflow: number;  // 中单净流入
  smallNetInflow: number;   // 小单净流入
  close: number;           // 收盘价
  changePct: number;       // 涨跌幅
  volume: number;           // 成交量
  timestamp: Date;
}

/**
 * 北向资金数据
 */
export interface NorthBoundData {
  date: string;
  HongKongStockBuy: number;   // 港股通买入
  HongKongStockSell: number;  // 港股通卖出
  netInflow: number;          // 净流入
  ShanghaiStockBuy: number;   //沪股通买入
  ShanghaiStockSell: number;   // 沪股通卖出
}

/**
 * 获取个股资金流向
 */
export async function getStockFlow(symbol: string, market: 'a' | 'hk' | 'us'): Promise<FlowData | null> {
  logger.info(`[Flow] 获取${market}股${symbol}资金流向`);
  
  try {
    if (market === 'a') {
      return await getAStockFlow(symbol);
    } else if (market === 'hk') {
      return await getHKStockFlow(symbol);
    }
    return null;
  } catch (error) {
    logger.error('[Flow] 获取资金流向失败:', error);
    return null;
  }
}

/**
 * 获取A股资金流向
 */
async function getAStockFlow(symbol: string): Promise<FlowData | null> {
  try {
    // 东方财富资金流向API
    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=1.${symbol}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!data.data?.klines) return null;
    
    const klines = data.data.klines;
    const latest = klines[klines.length - 1].split(',');
    
    return {
      market: 'a',
      symbol,
      name: latest[0] || '',
      mainNetInflow: parseFloat(latest[1]) || 0,
      mainNetInflowPct: parseFloat(latest[2]) || 0,
      superNetInflow: parseFloat(latest[3]) || 0,
      largeNetInflow: parseFloat(latest[4]) || 0,
      mediumNetInflow: parseFloat(latest[5]) || 0,
      smallNetInflow: parseFloat(latest[6]) || 0,
      close: parseFloat(latest[7]) || 0,
      changePct: parseFloat(latest[8]) || 0,
      volume: parseFloat(latest[9]) || 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Flow] 获取A股资金流向失败:', error);
    return null;
  }
}

/**
 * 获取港股资金流向
 */
async function getHKStockFlow(symbol: string): Promise<FlowData | null> {
  try {
    const hkCode = symbol.padStart(5, '0');
    const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=0.${hkCode}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!data.data?.klines) return null;
    
    const klines = data.data.klines;
    const latest = klines[klines.length - 1].split(',');
    
    return {
      market: 'hk',
      symbol,
      name: latest[0] || '',
      mainNetInflow: parseFloat(latest[1]) || 0,
      mainNetInflowPct: parseFloat(latest[2]) || 0,
      superNetInflow: parseFloat(latest[3]) || 0,
      largeNetInflow: parseFloat(latest[4]) || 0,
      mediumNetInflow: parseFloat(latest[5]) || 0,
      smallNetInflow: parseFloat(latest[6]) || 0,
      close: parseFloat(latest[7]) || 0,
      changePct: parseFloat(latest[8]) || 0,
      volume: parseFloat(latest[9]) || 0,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[Flow] 获取港股资金流向失败:', error);
    return null;
  }
}

/**
 * 获取北向资金数据
 */
export async function getNorthBoundData(): Promise<NorthBoundData[]> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=1.000001&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65';
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!data.data?.klines) return [];
    
    return data.data.klines.map((kline: string) => {
      const parts = kline.split(',');
      return {
        date: parts[0],
        HongKongStockBuy: parseFloat(parts[1]) || 0,
        HongKongStockSell: parseFloat(parts[2]) || 0,
        netInflow: parseFloat(parts[3]) || 0,
        ShanghaiStockBuy: parseFloat(parts[4]) || 0,
        ShanghaiStockSell: parseFloat(parts[5]) || 0,
      };
    });
  } catch (error) {
    logger.error('[Flow] 获取北向资金数据失败:', error);
    return [];
  }
}

/**
 * 批量获取资金流向
 */
export async function getBatchFlow(symbols: string[], market: 'a' | 'hk'): Promise<FlowData[]> {
  const results: FlowData[] = [];
  
  for (const symbol of symbols) {
    const flow = await getStockFlow(symbol, market);
    if (flow) results.push(flow);
  }
  
  return results;
}
