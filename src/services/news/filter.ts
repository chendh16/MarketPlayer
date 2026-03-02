import { redisClient } from '../../db/redis';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export interface RawNewsItem {
  symbol: string;
  market: string;
  triggerType?: string;
  changePercent?: number;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentHourBlock(): string {
  const now = new Date();
  const hourBlock = Math.floor(now.getHours() / 4);
  return `${now.toISOString().split('T')[0]}-${hourBlock}`;
}

export async function preFilter(newsItem: RawNewsItem): Promise<FilterResult> {
  // 规则1：涨跌幅过滤（仅对市场异动类）
  if (newsItem.triggerType === 'anomaly') {
    const changePercent = Math.abs(newsItem.changePercent ?? 0);
    if (changePercent < 3) {
      return { pass: false, reason: 'change_below_threshold' };
    }
  }

  // 规则2：重复去重（同一标的1小时内已处理）
  const recentKey = `news:recent:${newsItem.symbol}:${newsItem.market}`;
  const isRecent = await redisClient.get(recentKey);
  if (isRecent) {
    return { pass: false, reason: 'duplicate_within_1h' };
  }

  // 规则3：BTC 每4小时限制
  if (newsItem.market === 'btc') {
    const btcKey = `btc:signal:count:${getCurrentHourBlock()}`;
    const count = await redisClient.get(btcKey);
    if (Number(count) >= 1) {
      return { pass: false, reason: 'btc_rate_limit' };
    }
  }

  // 规则4：AI 日调用上限检查
  const todayCalls = await redisClient.get(`ai:daily:calls:${getToday()}`);
  if (Number(todayCalls) >= config.AI_DAILY_CALL_LIMIT) {
    return { pass: false, reason: 'daily_call_limit_reached' };
  }

  return { pass: true };
}

// 通过后设置去重标记
export async function markAsProcessed(symbol: string, market: string): Promise<void> {
  const key = `news:recent:${symbol}:${market}`;
  await redisClient.setEx(key, 3600, '1'); // 1小时去重
  
  logger.info(`Marked ${symbol} (${market}) as processed`);
}

// BTC 计数增加
export async function incrementBTCCount(): Promise<void> {
  const btcKey = `btc:signal:count:${getCurrentHourBlock()}`;
  const result = await redisClient.incr(btcKey);
  if (result === 1) {
    await redisClient.expire(btcKey, 14400); // 4小时过期，仅首次创建 key 时设置
  }
}

