import { AccountSnapshot } from '../../models/position';
import { logger } from '../../utils/logger';

const POSITION_CACHE_TTL = 60;

export async function getLongbridgeSnapshot(
  userId: string,
  forceRefresh = false
): Promise<AccountSnapshot> {
  // 尝试 Redis 缓存（与 futu/position.ts 保持一致）
  if (!forceRefresh) {
    try {
      const { redisClient } = await import('../../db/redis');
      const cacheKey = `position:cache:${userId}:longbridge`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const snapshot = JSON.parse(cached) as AccountSnapshot;
        snapshot.source = 'cache';
        logger.info(`Using cached LongBridge position for user ${userId}`);
        return snapshot;
      }
    } catch {
      // Redis 不可用时跳过缓存
    }
  }

  const snapshot = await fetchLiveLongbridgeSnapshot(userId);

  // 写缓存
  try {
    const { redisClient } = await import('../../db/redis');
    const cacheKey = `position:cache:${userId}:longbridge`;
    await redisClient.setEx(cacheKey, POSITION_CACHE_TTL, JSON.stringify(snapshot));
  } catch {
    // 忽略缓存写入失败
  }

  return snapshot;
}

export async function getLongbridgeSnapshotForOrder(userId: string): Promise<AccountSnapshot> {
  return getLongbridgeSnapshot(userId, true);
}

export async function invalidateLongbridgeCache(userId: string): Promise<void> {
  try {
    const { redisClient } = await import('../../db/redis');
    await redisClient.del(`position:cache:${userId}:longbridge`);
    logger.info(`Invalidated LongBridge position cache for user ${userId}`);
  } catch {
    // 忽略
  }
}

// TODO: 已临时屏蔽 LongBridge API 调用，直接返回空快照
async function fetchLiveLongbridgeSnapshot(userId: string): Promise<AccountSnapshot> {
  logger.info(`fetchLiveLongbridgeSnapshot: broker API disabled, returning empty snapshot for user ${userId}`);
  return {
    broker: 'longbridge',
    totalAssets: 0,
    availableCash: 0,
    positions: [],
    totalPositionPct: 0,
    fetchedAt: new Date(),
    source: 'live',
  };
}
