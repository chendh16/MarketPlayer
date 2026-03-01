import { getAccountSnapshot } from '../../services/futu/position';
import { getManualPositions } from '../../db/queries';
import { logger } from '../../utils/logger';

/**
 * get_positions — 获取用户持仓快照（富途 + 手动）
 */
export async function get_positions(params: { userId: string; forceRefresh?: boolean }) {
  const { userId, forceRefresh = false } = params;
  logger.info(`[MCP] get_positions userId=${userId} forceRefresh=${forceRefresh}`);

  const [snapshot, manualPositions] = await Promise.all([
    getAccountSnapshot(userId, 'futu', forceRefresh),
    getManualPositions(userId),
  ]);

  return {
    userId,
    snapshot,
    manualPositions,
    fetchedAt: new Date(),
  };
}

/**
 * get_account — 获取用户账户资金概况
 */
export async function get_account(params: { userId: string }) {
  const { userId } = params;
  logger.info(`[MCP] get_account userId=${userId}`);

  const snapshot = await getAccountSnapshot(userId, 'futu');

  return {
    userId,
    totalAssets: snapshot.totalAssets,
    availableCash: snapshot.availableCash,
    totalPositionPct: snapshot.totalPositionPct,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
  };
}
