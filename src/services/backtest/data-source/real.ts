/**
 * 真实数据源 - 使用代理/CORS 绕过
 * 通过服务端代理获取数据
 */

import axios from 'axios';
import { KLine } from './types';

// 使用公开的代理服务或第三方 API
// 这里使用 Financial Modeling Prep (有免费 tier)

const FMP_API_KEY = process.env.FMP_API_KEY || 'demo';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * Financial Modeling Prep 数据源
 */
export async function fetchFromFMP(
  symbol: string,
  market: 'hk' | 'us',
  years: number = 3
): Promise<KLine[]> {
  // 转换股票代码
  let fsymbol = symbol;
  if (market === 'hk') {
    fsymbol = `${symbol}:HK`;
  }
  
  const url = `${FMP_BASE_URL}/historical-price-full/${fsymbol}`;
  const params = {
    from: getDateYearsAgo(years),
    to: getToday(),
    apikey: FMP_API_KEY,
  };
  
  try {
    const response = await axios.get(url, { params, timeout: 30000 });
    const data = response.data;
    
    if (!data.historical) {
      throw new Error('No historical data returned');
    }
    
    const kLines: KLine[] = data.historical.map((item: any) => ({
      date: new Date(item.date),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume),
    }));
    
    return kLines.reverse(); // FMP 返回的是倒序
  } catch (error: any) {
    console.error(`FMP fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * 新浪财经数据源 (免费，国内可用)
 */
export async function fetchFromSina(symbol: string, market: 'hk' | 'us'): Promise<KLine[]> {
  let url: string;
  
  if (market === 'hk') {
    // 港股: 0.00700 表示 00700
    const code = symbol.padStart(5, '0');
    url = `https://stock2.finance.sina.com.cn/fundService/api/common/json.php/IndexService/getInnerFundDailyNVDI`;
  }
  
  // 新浪美股
  url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=5&datalen=1024`;
  
  try {
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data;
    
    // 解析新浪数据
    const match = data.match(/\[(.*)\]/);
    if (!match) {
      throw new Error('Invalid data format');
    }
    
    const items = JSON.parse(match[0]);
    const kLines: KLine[] = items.map((item: any) => ({
      date: new Date(item.day),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume),
    }));
    
    return kLines;
  } catch (error: any) {
    console.error(`Sina fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * 随机森林数据 (Random Forest) - 免费美股数据
 */
export async function fetchFromRandomForest(symbol: string, years: number = 3): Promise<KLine[]> {
  const endDate = getToday();
  const startDate = getDateYearsAgo(years);
  
  // 使用 stooq.com (免费，无需 API key)
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`;
  
  try {
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data;
    
    const lines = data.trim().split('\n');
    const kLines: KLine[] = [];
    
    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 6) {
        kLines.push({
          date: new Date(parts[0]),
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parseInt(parts[5]),
        });
      }
    }
    
    return kLines.filter(k => k.date >= new Date(startDate));
  } catch (error: any) {
    console.error(`Stooq fetch error: ${error.message}`);
    throw error;
  }
}

// 辅助函数
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().split('T')[0];
}

// 导出统一的获取函数
export async function fetchRealData(
  symbol: string,
  market: 'hk' | 'us',
  years: number = 3
): Promise<KLine[]> {
  // 优先尝试 Stooq (免费且稳定)
  if (market === 'us') {
    try {
      return await fetchFromRandomForest(symbol, years);
    } catch (e) {
      console.log('Stooq failed, trying FMP...');
    }
  }
  
  // 备用: FMP
  try {
    return await fetchFromFMP(symbol, market, years);
  } catch (e) {
    console.log('FMP failed');
  }
  
  throw new Error('All data sources failed');
}
