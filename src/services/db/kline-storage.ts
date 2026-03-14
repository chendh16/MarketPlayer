/**
 * K线数据存储服务
 * 
 * 内存存储 (可升级为SQLite)
 */

import { logger } from '../../utils/logger';

/**
 * K线数据模型
 */
export interface KLineRecord {
  id?: number;
  symbol: string;
  market: 'a' | 'hk' | 'us';
  interval: '1d' | '1w' | '1M' | '1h' | '5m' | '15m' | '30m' | '1m';
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  createdAt?: string;
}

// 内存存储
const klineStorage: Map<string, KLineRecord[]> = new Map();

function getKey(symbol: string, market: string, interval: string): string {
  return `${market}-${symbol}-${interval}`;
}

/**
 * 初始化K线表
 */
export async function initKLineTable(): Promise<void> {
  logger.info('[KLine] 内存存储初始化');
}

/**
 * 保存K线数据
 */
export async function saveKLines(records: KLineRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  
  let saved = 0;
  
  for (const record of records) {
    const key = getKey(record.symbol, record.market, record.interval);
    
    if (!klineStorage.has(key)) {
      klineStorage.set(key, []);
    }
    
    const existing = klineStorage.get(key)!;
    const exists = existing.some(r => r.timestamp === record.timestamp);
    
    if (!exists) {
      existing.push(record);
      saved++;
    }
  }
  
  logger.info(`[KLine] 保存 ${saved}/${records.length} 条`);
  
  return saved;
}

/**
 * 获取K线数据
 */
export async function getKLines(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  interval: string = '1d',
  startTime?: number,
  endTime?: number,
  limit: number = 500
): Promise<KLineRecord[]> {
  const key = getKey(symbol, market, interval);
  let records = klineStorage.get(key) || [];
  
  if (startTime) {
    records = records.filter(r => r.timestamp >= startTime);
  }
  
  if (endTime) {
    records = records.filter(r => r.timestamp <= endTime);
  }
  
  // 排序并限制数量
  records = records.sort((a, b) => a.timestamp - b.timestamp);
  
  return records.slice(-limit);
}

/**
 * 获取最新K线
 */
export async function getLatestKLine(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  interval: string = '1d'
): Promise<KLineRecord | null> {
  const records = await getKLines(symbol, market, interval, undefined, undefined, 1);
  return records[0] || null;
}

/**
 * 删除K线数据
 */
export async function deleteKLines(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  beforeTime: number
): Promise<number> {
  const key = getKey(symbol, market, '1d');
  const records = klineStorage.get(key) || [];
  
  const beforeCount = records.length;
  const filtered = records.filter(r => r.timestamp >= beforeTime);
  
  klineStorage.set(key, filtered);
  
  const deleted = beforeCount - filtered.length;
  logger.info(`[KLine] 删除 ${deleted} 条`);
  
  return deleted;
}

/**
 * 获取K线统计
 */
export async function getKLineStats(
  symbol: string,
  market: 'a' | 'hk' | 'us',
  interval: string = '1d'
): Promise<{
  count: number;
  earliest: number;
  latest: number;
}> {
  const records = await getKLines(symbol, market, interval);
  
  if (records.length === 0) {
    return { count: 0, earliest: 0, latest: 0 };
  }
  
  return {
    count: records.length,
    earliest: records[0].timestamp,
    latest: records[records.length - 1].timestamp,
  };
}
