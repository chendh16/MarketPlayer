/**
 * 资金流向数据服务
 * A股北向资金 + 港股通
 */

import { logger } from '../../utils/logger';

// 东方财富北向资金流向 (简化版)
export async function fetchNorthboundFlow(): Promise<any> {
  try {
    const url = 'https://push2his.eastmoney.com/api/qt/stock/get?fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid=0.000001';
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (data.data) {
      // 返回原始数据，由调用方解析
      return {
        date: new Date().toISOString().split('T')[0],
        raw: data.data
      };
    }
    return null;
  } catch (error) {
    logger.error('[Flow] 获取北向资金失败:', error);
    return null;
  }
}

// 港股通南向资金 (简化版)
export async function fetchSouthboundFlow(): Promise<any> {
  try {
    const url = 'https://push2his.eastmoney.com/api/qt/stock/get?fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid=0.00175';
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (data.data) {
      return {
        date: new Date().toISOString().split('T')[0],
        raw: data.data
      };
    }
    return null;
  } catch (error) {
    logger.error('[Flow] 获取南向资金失败:', error);
    return null;
  }
}

// 主力资金流向 (上证指数)
export async function fetchMainFlow(): Promise<any> {
  try {
    const url = 'https://push2his.eastmoney.com/api/qt/stock/get?fields1=f1,f2,f3,f7&fields2=f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid=1.000001';
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (data.data) {
      // f47=超大单净流入, f48=大单净流入, f49=中单净流入, f50=小单净流入
      return {
        date: new Date().toISOString().split('T')[0],
        superLarge: data.data.f47 || 0,
        large: data.data.f48 || 0,
        medium: data.data.f49 || 0,
        small: data.data.f50 || 0
      };
    }
    return null;
  } catch (error) {
    logger.error('[Flow] 获取主力资金失败:', error);
    return null;
  }
}

export async function fetchAllFlow(): Promise<any> {
  const [north, south, main] = await Promise.all([
    fetchNorthboundFlow(),
    fetchSouthboundFlow(),
    fetchMainFlow()
  ]);
  
  return { northbound: north, southbound: south, main };
}
