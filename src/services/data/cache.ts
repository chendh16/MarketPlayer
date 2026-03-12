/**
 * 数据缓存系统
 * 本地缓存历史K线数据，支持离线分析和历史回顾
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

export interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  name?: string;
  klines: KLine[];
  updatedAt: string;
}

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');
const KLINE_CACHE_DIR = path.join(CACHE_DIR, 'klines');

// 确保目录存在
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取K线缓存文件路径
 */
function getCachePath(symbol: string, market: string): string {
  ensureDir(KLINE_CACHE_DIR);
  return path.join(KLINE_CACHE_DIR, `${market}_${symbol}.json`);
}

/**
 * 保存K线数据到缓存
 */
export function saveKlinesToCache(symbol: string, market: string, klines: KLine[]): void {
  const cachePath = getCachePath(symbol, market);
  
  const data: StockData = {
    symbol,
    market: market as 'a' | 'hk' | 'us',
    klines,
    updatedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log(`[Cache] 已保存 ${market}/${symbol} ${klines.length} 条K线数据`);
}

/**
 * 从缓存读取K线数据
 */
export function getKlinesFromCache(symbol: string, market: string): KLine[] | null {
  const cachePath = getCachePath(symbol, market);
  
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(cachePath, 'utf-8');
    const parsed: StockData = JSON.parse(data);
    return parsed.klines;
  } catch (e) {
    console.error(`[Cache] 读取缓存失败: ${symbol}`, e);
    return null;
  }
}

/**
 * 检查缓存是否过期
 */
export function isCacheExpired(symbol: string, market: string, maxAgeHours: number = 24): boolean {
  const cachePath = getCachePath(symbol, market);
  
  if (!fs.existsSync(cachePath)) {
    return true;
  }
  
  try {
    const data = fs.readFileSync(cachePath, 'utf-8');
    const parsed: StockData = JSON.parse(data);
    const updatedAt = new Date(parsed.updatedAt);
    const hoursOld = (Date.now() - updatedAt.getTime()) / 3600000;
    return hoursOld > maxAgeHours;
  } catch (e) {
    return true;
  }
}

/**
 * 获取缓存信息
 */
export function getCacheInfo(symbol: string, market: string): { exists: boolean; count: number; updatedAt: string; expired: boolean } | null {
  const cachePath = getCachePath(symbol, market);
  
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(cachePath, 'utf-8');
    const parsed: StockData = JSON.parse(data);
    const expired = isCacheExpired(symbol, market);
    
    return {
      exists: true,
      count: parsed.klines.length,
      updatedAt: parsed.updatedAt,
      expired,
    };
  } catch (e) {
    return null;
  }
}

/**
 * 列出所有缓存
 */
export function listAllCache(): { symbol: string; market: string; count: number; updatedAt: string }[] {
  ensureDir(KLINE_CACHE_DIR);
  
  const files = fs.readdirSync(KLINE_CACHE_DIR);
  const cacheList: { symbol: string; market: string; count: number; updatedAt: string }[] = [];
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    try {
      const data = fs.readFileSync(path.join(KLINE_CACHE_DIR, file), 'utf-8');
      const parsed: StockData = JSON.parse(data);
      cacheList.push({
        symbol: parsed.symbol,
        market: parsed.market,
        count: parsed.klines.length,
        updatedAt: parsed.updatedAt,
      });
    } catch (e) {
      // 忽略损坏的文件
    }
  }
  
  return cacheList;
}

/**
 * 智能获取K线（优先缓存，必要时更新）
 */
export async function getKlinesSmart(
  symbol: string,
  market: string,
  days: number = 500,
  fetchFn?: () => Promise<KLine[]>
): Promise<{ klines: KLine[]; fromCache: boolean }> {
  // 检查缓存
  const cached = getKlinesFromCache(symbol, market);
  const expired = isCacheExpired(symbol, market);
  
  // 有缓存且未过期
  if (cached && !expired) {
    console.log(`[Cache] 使用缓存: ${market}/${symbol} (${cached.length}条)`);
    return { klines: cached, fromCache: true };
  }
  
  // 缓存过期或不存在，需要更新
  if (fetchFn) {
    console.log(`[Cache] 更新缓存: ${market}/${symbol}`);
    const klines = await fetchFn();
    if (klines.length > 0) {
      saveKlinesToCache(symbol, market, klines);
    }
    return { klines, fromCache: false };
  }
  
  // 没有更新函数，返回过期缓存
  if (cached) {
    console.log(`[Cache] 使用过期缓存: ${market}/${symbol}`);
    return { klines: cached, fromCache: true };
  }
  
  return { klines: [], fromCache: false };
}

/**
 * 批量更新缓存
 */
export async function batchUpdateCache(
  symbols: { symbol: string; market: string; fetchFn: () => Promise<KLine[]> }[]
): Promise<void> {
  console.log(`[Cache] 批量更新 ${symbols.length} 个标的...`);
  
  for (const item of symbols) {
    try {
      const klines = await item.fetchFn();
      if (klines.length > 0) {
        saveKlinesToCache(item.symbol, item.market, klines);
      }
    } catch (e) {
      console.error(`[Cache] 更新失败: ${item.symbol}`, e);
    }
  }
  
  console.log('[Cache] 批量更新完成');
}

/**
 * 清理过期缓存
 */
export function cleanExpiredCache(maxAgeHours: number = 168): number {  // 默认7天
  const files = fs.readdirSync(KLINE_CACHE_DIR);
  let cleaned = 0;
  
  for (const file of files) {
    const match = file.match(/^(.+?)_(.+?)\.json$/);
    if (!match) continue;
    
    const market = match[1];
    const symbol = match[2];
    
    if (isCacheExpired(symbol, market, maxAgeHours)) {
      const cachePath = path.join(KLINE_CACHE_DIR, file);
      fs.unlinkSync(cachePath);
      cleaned++;
    }
  }
  
  console.log(`[Cache] 清理了 ${cleaned} 个过期缓存`);
  return cleaned;
}

/**
 * 导出缓存为CSV
 */
export function exportToCSV(symbol: string, market: string): string | null {
  const klines = getKlinesFromCache(symbol, market);
  if (!klines || klines.length === 0) return null;
  
  let csv = 'Date,Open,High,Low,Close,Volume\n';
  for (const k of klines) {
    csv += `${k.date},${k.open},${k.high},${k.low},${k.close},${k.volume}\n`;
  }
  
  return csv;
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): { totalFiles: number; totalKLines: number; oldest: string; newest: string } {
  const list = listAllCache();
  
  if (list.length === 0) {
    return { totalFiles: 0, totalKLines: 0, oldest: '-', newest: '-' };
  }
  
  const dates = list.map(l => new Date(l.updatedAt).getTime());
  
  return {
    totalFiles: list.length,
    totalKLines: list.reduce((s, l) => s + l.count, 0),
    oldest: new Date(Math.min(...dates)).toISOString().slice(0, 10),
    newest: new Date(Math.max(...dates)).toISOString().slice(0, 10),
  };
}
