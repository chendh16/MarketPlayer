import { redisClient } from '../../db/redis';
import { AccountSnapshot } from '../../models/position';
import { logger } from '../../utils/logger';

const POSITION_CACHE_TTL = 60; // 60秒

// 获取持仓（优先缓存，缓存失效则实时拉取）
export async function getAccountSnapshot(
  userId: string,
  broker: string,
  forceRefresh = false
): Promise<AccountSnapshot> {
  const cacheKey = `position:cache:${userId}:${broker}`;
  
  if (!forceRefresh) {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const snapshot = JSON.parse(cached) as AccountSnapshot;
      snapshot.source = 'cache';
      logger.info(`Using cached position for user ${userId}`);
      return snapshot;
    }
  }
  
  // 实时拉取
  const snapshot = await fetchLivePositions(userId, broker);
  snapshot.source = 'live';
  
  // 写入缓存
  await redisClient.setEx(cacheKey, POSITION_CACHE_TTL, JSON.stringify(snapshot));
  
  logger.info(`Fetched live position for user ${userId}`);
  return snapshot;
}

// 下单前强制实时拉取（二次验证，不用缓存）
export async function getAccountSnapshotForOrder(
  userId: string,
  broker: string
): Promise<AccountSnapshot> {
  return getAccountSnapshot(userId, broker, true);
}

// 下单成功后立即更新缓存
export async function invalidatePositionCache(userId: string, broker: string): Promise<void> {
  const cacheKey = `position:cache:${userId}:${broker}`;
  await redisClient.del(cacheKey);
  logger.info(`Invalidated position cache for user ${userId}`);
}

// 实时拉取持仓（TODO: 实现富途API对接）
async function fetchLivePositions(_userId: string, broker: string): Promise<AccountSnapshot> {
  // TODO: 实现实际的富途API调用
  logger.warn(`fetchLivePositions not implemented for ${broker}, returning mock data`);
  
  return {
    broker,
    totalAssets: 100000,
    availableCash: 50000,
    positions: [],
    totalPositionPct: 0,
    fetchedAt: new Date(),
    source: 'live',
  };
}

