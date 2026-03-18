/**
 * 美股批量数据下载器
 * 
 * 每5分钟下载5次，获取美股Top50的3年K线数据
 * 避开Alpha Vantage API限制（每分钟5次）
 */

import { logger } from '../../utils/logger';
import { getUSStockKlineWithCache, setCachedUSKline } from './us-cache';

const TOP50_STOCKS = [
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'GOOGL', name: '谷歌' },
  { symbol: 'GOOG', name: '谷歌A' },
  { symbol: 'AMZN', name: '亚马逊' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: '特斯拉' },
  { symbol: 'BRK.B', name: '伯克希尔B' },
  { symbol: 'BRK.A', name: '伯克希尔A' },
  { symbol: 'UNH', name: '联合健康' },
  { symbol: 'JNJ', name: '强生' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'XOM', name: '埃克森美孚' },
  { symbol: 'JPM', name: '摩根大通' },
  { symbol: 'WMT', name: '沃尔玛' },
  { symbol: 'MA', name: '万事达' },
  { symbol: 'PG', name: '宝洁' },
  { symbol: 'CVX', name: '雪佛龙' },
  { symbol: 'HD', name: '家得宝' },
  { symbol: 'LLY', name: '礼来' },
  { symbol: 'ABBV', name: '艾伯维' },
  { symbol: 'MRK', name: '默克' },
  { symbol: 'PFE', name: '辉瑞' },
  { symbol: 'AVGO', name: '博通' },
  { symbol: 'KO', name: '可口可乐' },
  { symbol: 'PEP', name: '百事' },
  { symbol: 'COST', name: '好市多' },
  { symbol: 'ADBE', name: 'Adobe' },
  { symbol: 'MCD', name: '麦当劳' },
  { symbol: 'CSCO', name: '思科' },
  { symbol: 'ACN', name: '埃森哲' },
  { symbol: 'ABT', name: '雅培' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'WFC', name: '富国银行' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'DHR', name: '丹纳赫' },
  { symbol: 'TXN', name: '德州仪器' },
  { symbol: 'NKE', name: '耐克' },
  { symbol: 'PM', name: '菲利普莫里斯' },
  { symbol: 'UPS', name: 'UPS' },
  { symbol: 'MS', name: '摩根士丹利' },
  { symbol: 'LOW', name: '劳氏' },
  { symbol: 'INTC', name: '英特尔' },
  { symbol: 'SPGI', name: '标普全球' },
  { symbol: 'INTU', name: 'Intuit' },
  { symbol: 'QCOM', name: '高通' },
  { symbol: 'UNP', name: '联合太平洋' },
  { symbol: 'CAT', name: '卡特彼勒' },
  { symbol: 'IBM', name: 'IBM' },
];

const BATCH_SIZE = 5;  // 每批5只
const BATCH_INTERVAL = 5 * 60 * 1000;  // 5分钟
const KLINE_YEARS = 3;
const KLINE_DAYS = KLINE_YEARS * 250;  // 约3年交易日

interface DownloadResult {
  symbol: string;
  success: boolean;
  dataCount: number;
  error?: string;
}

/**
 * 下载单只股票K线
 */
async function downloadStockKline(symbol: string): Promise<DownloadResult> {
  try {
    logger.info(`[USDownloader] 下载 ${symbol} K线 (${KLINE_DAYS}天)...`);
    
    // 直接从API获取（绕过缓存）
    const { config } = await import('../../config');
    const apiKey = config.ALPHA_VANTAGE_API_KEY;
    
    if (!apiKey || apiKey === 'your_key') {
      return { symbol, success: false, dataCount: 0, error: '无API Key' };
    }
    
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}&outputsize=full`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    const timeKey = data['Meta Data']?.['3. Last Refreshed'] ? 'Time Series (Daily)' : null;
    if (!timeKey || !data[timeKey]) {
      return { symbol, success: false, dataCount: 0, error: '无数据' };
    }
    
    const timeSeries = data[timeKey];
    const klineData = Object.entries(timeSeries)
      .slice(0, KLINE_DAYS)
      .map(([date, values]: [string, any]) => ({
        time: date,
        open: parseFloat(values['1. open']) || 0,
        high: parseFloat(values['2. high']) || 0,
        low: parseFloat(values['3. low']) || 0,
        close: parseFloat(values['4. close']) || 0,
        volume: parseInt(values['5. volume']) || 0,
      })).reverse();
    
    // 存储到缓存（长期存储）
    await setCachedUSKline(symbol, 'daily', {
      symbol,
      period: 'daily',
      data: klineData,
      timestamp: Date.now(),
    });
    
    logger.info(`[USDownloader] ${symbol} 完成: ${klineData.length} 条数据`);
    return { symbol, success: true, dataCount: klineData.length };
  } catch (error: any) {
    logger.error(`[USDownloader] ${symbol} 失败:`, error.message);
    return { symbol, success: false, dataCount: 0, error: error.message };
  }
}

/**
 * 下载一批股票
 */
async function downloadBatch(stocks: { symbol: string }[]): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  
  for (const stock of stocks) {
    const result = await downloadStockKline(stock.symbol);
    results.push(result);
    
    // 每请求1次等待20秒（Alpha Vantage限制：每分钟5次 = 每12秒1次）
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  
  return results;
}

/**
 * 开始批量下载
 */
export async function startUSStockDownloader(): Promise<void> {
  logger.info(`[USDownloader] 开始下载美股Top50 K线数据 (${KLINE_YEARS}年)...`);
  
  const totalStocks = TOP50_STOCKS.length;
  const totalBatches = Math.ceil(totalStocks / BATCH_SIZE);
  
  logger.info(`[USDownloader] 共 ${totalStocks} 只股票，${totalBatches} 批，每批间隔 ${BATCH_INTERVAL/1000}秒`);
  
  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalStocks);
    const batchStocks = TOP50_STOCKS.slice(start, end);
    
    logger.info(`[USDownloader] === 批次 ${batch + 1}/${totalBatches}: ${batchStocks.map(s => s.symbol).join(', ')} ===`);
    
    const results = await downloadBatch(batchStocks);
    
    // 统计
    const successCount = results.filter(r => r.success).length;
    const totalData = results.reduce((sum, r) => sum + r.dataCount, 0);
    logger.info(`[USDownloader] 批次完成: 成功 ${successCount}/${batchStocks.length}, 数据 ${totalData} 条`);
    
    // 等待下一批（除最后一批外）
    if (batch < totalBatches - 1) {
      logger.info(`[USDownloader] 等待 ${BATCH_INTERVAL/1000} 秒...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
    }
  }
  
  logger.info(`[USDownloader] ✅ 全部下载完成！`);
}

/**
 * 定时下载（每天执行一次）
 */
import cron from 'node-cron';

export function startUSStockDownloadScheduler() {
  // 每天凌晨3点执行（美股收盘后）
  cron.schedule('0 3 * * *', async () => {
    logger.info('[USDownloader] 定时任务启动...');
    await startUSStockDownloader();
  });
  
  logger.info('[USDownloader] 定时下载已启动 (每天 03:00)');
}
