import { redisClient } from '../../db/redis';
import { AccountSnapshot, Position } from '../../models/position';
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

// 实时拉取持仓（富途SDK）
async function fetchLivePositions(userId: string, broker: string): Promise<AccountSnapshot> {
  if (broker !== 'futu') {
    logger.warn(`fetchLivePositions: unsupported broker ${broker}`);
    return { broker, totalAssets: 0, availableCash: 0, positions: [], totalPositionPct: 0, fetchedAt: new Date(), source: 'live' };
  }

  try {
    const { getFutuConnection } = await import('./connection');
    const { config } = await import('../../config');
    const conn = await getFutuConnection(userId);

    if (!conn.isConnected()) {
      throw new Error('Futu connection not available');
    }

    const [positionItems, funds] = await Promise.all([
      conn.getPositions(config.FUTU_TRD_ENV, config.FUTU_TRADE_ACC_ID, config.FUTU_TRADE_ACC_INDEX),
      conn.getFunds(config.FUTU_TRD_ENV, config.FUTU_TRADE_ACC_ID, config.FUTU_TRADE_ACC_INDEX),
    ]);

    const totalAssets = funds.totalAssets ?? funds.power ?? 0;
    const availableCash = funds.cash ?? funds.power ?? 0;

    const positions: Position[] = positionItems
      .filter(p => p.qty > 0)
      .map(p => {
        const marketVal = p.marketVal ?? 0;
        return {
          symbol: p.code,
          market: inferMarket(p.code),
          quantity: p.qty,
          marketValue: marketVal,
          positionPct: totalAssets > 0 ? (marketVal / totalAssets) * 100 : 0,
        };
      });

    const totalPositionPct = positions.reduce((sum, p) => sum + p.positionPct, 0);

    logger.info(`Fetched ${positions.length} positions for user ${userId}, totalAssets=${totalAssets}`);
    return { broker, totalAssets, availableCash, positions, totalPositionPct, fetchedAt: new Date(), source: 'live' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch live positions for user ${userId}: ${msg}, returning empty snapshot`);
    return { broker, totalAssets: 0, availableCash: 0, positions: [], totalPositionPct: 0, fetchedAt: new Date(), source: 'live' };
  }
}

function inferMarket(code: string): 'us' | 'hk' | 'a' | 'btc' {
  if (code.startsWith('US.')) return 'us';
  if (code.startsWith('HK.')) return 'hk';
  if (code.startsWith('SH.') || code.startsWith('SZ.')) return 'a';
  return 'us';
}

