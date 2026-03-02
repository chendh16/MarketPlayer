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

// 实时拉取持仓（富途 or 长桥）
// TODO: 已临时屏蔽 broker API 调用，直接返回空快照
async function fetchLivePositions(userId: string, broker: string): Promise<AccountSnapshot> {
  logger.info(`fetchLivePositions: broker API disabled, returning empty snapshot for user ${userId} broker=${broker}`);
  return { broker, totalAssets: 0, availableCash: 0, positions: [], totalPositionPct: 0, fetchedAt: new Date(), source: 'live' };
}

