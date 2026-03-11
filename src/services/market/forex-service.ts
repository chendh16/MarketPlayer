/**
 * 外汇数据服务
 * 美元/人民币汇率
 */

import { logger } from '../../utils/logger';

// 美元指数
export async function fetchUSDIndex(): Promise<any> {
  try {
    const url = 'https://push2ex.eastmoney.com/getTopicZDFenBu?ut=7eea3edcaed734bea9cbfc24409ed989&dession=01&mession=01';
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('[Forex] 获取美元指数失败:', error);
    return null;
  }
}

// 在岸人民币汇率
export async function fetchCNYRate(): Promise<any> {
  try {
    // 使用新浪API
    const url = 'https://hq.sinajs.cn/list=fx_susdcny';
    const response = await fetch(url);
    const text = await response.text();
    
    // 解析: var hq_str_fx_susdcny="6.8235,6.8235,6.8235,06:15:15,0.00%,6.8235,6.8235,6.8235,6.8200,6.8250,0,0,"
    const match = text.match(/"([^"]+)"/);
    if (match) {
      const parts = match[1].split(',');
      return {
        date: new Date().toISOString().split('T')[0],
        usdcny: {
          current: parseFloat(parts[0]) || 0,
          open: parseFloat(parts[1]) || 0,
          high: parseFloat(parts[3]) || 0,
          low: parseFloat(parts[4]) || 0
        }
      };
    }
    return null;
  } catch (error) {
    logger.error('[Forex] 获取人民币汇率失败:', error);
    return null;
  }
}

// 离岸人民币汇率
export async function fetchCNHRate(): Promise<any> {
  try {
    const url = 'https://hq.sinajs.cn/list=fx_susdcnh';
    const response = await fetch(url);
    const text = await response.text();
    
    const match = text.match(/"([^"]+)"/);
    if (match) {
      const parts = match[1].split(',');
      return {
        date: new Date().toISOString().split('T')[0],
        usdcnh: {
          current: parseFloat(parts[0]) || 0,
          open: parseFloat(parts[1]) || 0,
          high: parseFloat(parts[3]) || 0,
          low: parseFloat(parts[4]) || 0
        }
      };
    }
    return null;
  } catch (error) {
    logger.error('[Forex] 获取离岸人民币汇率失败:', error);
    return null;
  }
}

export async function fetchAllForex(): Promise<any> {
  const [usd, cny, cnh] = await Promise.all([
    fetchUSDIndex(),
    fetchCNYRate(),
    fetchCNHRate()
  ]);
  
  return { usdIndex: usd, usdcny: cny, usdcnh: cnh };
}
