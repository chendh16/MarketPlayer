/**
 * 多市场实时价格获取服务
 * 支持 A股、港股、美股
 * 统一接口，扩展性强
 */

import { logger } from '../../utils/logger';

export type Market = 'a' | 'hk' | 'us' | 'jp';

export interface StockQuote {
  market: Market;
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  updateTime: Date;
}

export interface PriceAlert {
  id: string;
  market: Market;
  code: string;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  condition: number;  // 触发次数
  enabled: boolean;
  lastTriggered?: Date;
}

// A股配置
const A_STOCKS = [
  { code: '600519', name: '贵州茅台' },
  { code: '000001', name: '平安银行' },
  { code: '600036', name: '招商银行' },
  { code: '000858', name: '五粮液' },
  { code: '300750', name: '宁德时代' }
];

// 港股配置
const HK_STOCKS = [
  { code: '00700', name: '腾讯控股' },
  { code: '09988', name: '阿里巴巴' },
  { code: '02318', name: '平安保险' }
];

// 美股配置
const US_STOCKS = [
  { code: 'AAPL', name: '苹果' },
  { code: 'MSFT', name: '微软' },
  { code: 'GOOGL', name: '谷歌' }
];

// HTTP GET
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require('https');
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res: any) => {
      let data = '';
      res.on('data', (c: any) => { data += c; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

// 运行 Python 脚本
function runPython(script: string, args: string[]): Promise<any> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('python3', [script, ...args]);
    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', () => {
      try {
        const lines = output.split('\n');
        const jsonLine = lines.find(l => l.trim().startsWith('{'));
        resolve(jsonLine ? JSON.parse(jsonLine) : { error: 'No data' });
      } catch (e) { resolve({ error: output }); }
    });
  });
}

// 获取A股实时价格
export async function getAStockPrice(code: string): Promise<StockQuote | null> {
  try {
    const secid = code.startsWith('6') ? '1.' : '0.';
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}${code}&fields=f43,f44,f45,f46,f60`;
    const data = await httpGet(url);
    const json = JSON.parse(data);
    
    if (json.data) {
      const d = json.data;
      const price = d.f43 / 10000;
      const prevClose = d.f60 / 10000;
      return {
        market: 'a',
        code,
        name: '',
        price,
        change: price - prevClose,
        changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
        prevClose,
        updateTime: new Date()
      };
    }
    return null;
  } catch (e) {
    logger.error(`获取A股${code}价格失败:`, e);
    return null;
  }
}

// 获取港股实时价格
export async function getHKStockPrice(code: string): Promise<StockQuote | null> {
  try {
    // 港股代码格式转换
    const hkCode = code.padStart(5, '0');
    const url = `https://qt.gtimg.cn/q=r_hk${hkCode}`;
    const data = await httpGet(url);
    
    const match = data.match(/"([^"]+)"/);
    if (match) {
      const parts = match[1].split('~');
      const price = parseFloat(parts[3]);
      const prevClose = parseFloat(parts[5]) || price;
      return {
        market: 'hk',
        code,
        name: '',
        price,
        change: price - prevClose,
        changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
        prevClose,
        updateTime: new Date()
      };
    }
    return null;
  } catch (e) {
    logger.error(`获取港股${code}价格失败:`, e);
    return null;
  }
}

// 获取美股实时价格
export async function getUSStockPrice(code: string): Promise<StockQuote | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${code}.US&i=d`;
    const data = await httpGet(url);
    const parts = data.trim().split(',');
    
    if (parts.length >= 7) {
      const price = parseFloat(parts[6]);  // 收盘价
      const open = parseFloat(parts[3]);    // 开盘价作为参考
      return {
        market: 'us',
        code,
        name: '',
        price,
        change: price - open,
        changePercent: open > 0 ? ((price - open) / open * 100) : 0,
        prevClose: open,
        updateTime: new Date()
      };
    }
    return null;
  } catch (e) {
    logger.error(`获取美股${code}价格失败:`, e);
    return null;
  }
}

// 统一获取接口
export async function getStockPrice(market: Market, code: string): Promise<StockQuote | null> {
  switch (market) {
    case 'a': return getAStockPrice(code);
    case 'hk': return getHKStockPrice(code);
    case 'us': return getUSStockPrice(code);
    case 'jp': 
      logger.warn('日股暂不支持');
      return null;
    default:
      return null;
  }
}

// 获取默认股票列表价格
export async function getDefaultQuotes(): Promise<StockQuote[]> {
  const results: StockQuote[] = [];
  
  // A股
  for (const stock of A_STOCKS) {
    const quote = await getAStockPrice(stock.code);
    if (quote) {
      quote.name = stock.name;
      results.push(quote);
    }
  }
  
  // 港股
  for (const stock of HK_STOCKS) {
    const quote = await getHKStockPrice(stock.code);
    if (quote) {
      quote.name = stock.name;
      results.push(quote);
    }
  }
  
  // 美股
  for (const stock of US_STOCKS) {
    const quote = await getUSStockPrice(stock.code);
    if (quote) {
      quote.name = stock.name;
      results.push(quote);
    }
  }
  
  return results;
}

// 导出默认股票列表
export const DEFAULT_STOCKS = {
  a: A_STOCKS,
  hk: HK_STOCKS,
  us: US_STOCKS,
  jp: [] as { code: string; name: string }[]
};
