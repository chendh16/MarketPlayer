/**
 * 大宗商品数据服务
 * 黄金、白银、原油
 * 注: 部分API需要特殊配置，暂时返回基础数据
 */

import { logger } from '../../utils/logger';

// 黄金价格 - 尝试东方财富
export async function fetchGoldPrice(): Promise<any> {
  try {
    // 尝试不同的市场ID
    const markets = ['0.100', '0.1002', '1.100'];
    for (const market of markets) {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20260301&end=20260311`;
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.data && data.data.klines && data.data.klines.length > 0) {
        const latest = (data.data.klines[data.data.klines.length - 1] as string).split(',');
        return {
          date: latest[0],
          market: market,
          gold: {
            open: parseFloat(latest[1]) || 0,
            high: parseFloat(latest[2]) || 0,
            low: parseFloat(latest[3]) || 0,
            close: parseFloat(latest[4]) || 0,
            volume: parseFloat(latest[5]) || 0
          }
        };
      }
    }
    return { date: new Date().toISOString().split('T')[0], note: 'API暂时不可用' };
  } catch (error) {
    logger.error('[Commodity] 获取黄金价格失败:', error);
    return null;
  }
}

// 白银价格
export async function fetchSilverPrice(): Promise<any> {
  try {
    const markets = ['0.100002', '1.100002'];
    for (const market of markets) {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20260301&end=20260311`;
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.data && data.data.klines && data.data.klines.length > 0) {
        const latest = (data.data.klines[data.data.klines.length - 1] as string).split(',');
        return {
          date: latest[0],
          market: market,
          silver: {
            open: parseFloat(latest[1]) || 0,
            high: parseFloat(latest[2]) || 0,
            low: parseFloat(latest[3]) || 0,
            close: parseFloat(latest[4]) || 0,
            volume: parseFloat(latest[5]) || 0
          }
        };
      }
    }
    return { date: new Date().toISOString().split('T')[0], note: 'API暂时不可用' };
  } catch (error) {
    logger.error('[Commodity] 获取白银价格失败:', error);
    return null;
  }
}

// 原油价格
export async function fetchOilPrice(): Promise<any> {
  try {
    const markets = ['1.999999', '1.999998'];
    for (const market of markets) {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20260301&end=20260311`;
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.data && data.data.klines && data.data.klines.length > 0) {
        const latest = (data.data.klines[data.data.klines.length - 1] as string).split(',');
        return {
          date: latest[0],
          market: market,
          oil: {
            open: parseFloat(latest[1]) || 0,
            high: parseFloat(latest[2]) || 0,
            low: parseFloat(latest[3]) || 0,
            close: parseFloat(latest[4]) || 0,
            volume: parseFloat(latest[5]) || 0
          }
        };
      }
    }
    return { date: new Date().toISOString().split('T')[0], note: 'API暂时不可用' };
  } catch (error) {
    logger.error('[Commodity] 获取原油价格失败:', error);
    return null;
  }
}

export async function fetchAllCommodities(): Promise<any> {
  const [gold, silver, oil] = await Promise.all([
    fetchGoldPrice(),
    fetchSilverPrice(),
    fetchOilPrice()
  ]);
  
  return { gold, silver, oil };
}
