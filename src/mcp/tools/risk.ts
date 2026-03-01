import { checkRisk } from '../../services/risk/engine';
import { getAccountSnapshot } from '../../services/futu/position';
import { getUserById, getManualPositions } from '../../db/queries';
import { logger } from '../../utils/logger';

/**
 * check_risk — 对指定用户和交易意图执行风控检查
 */
export async function check_risk(params: {
  userId: string;
  symbol: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  direction: 'long' | 'short';
  positionPct: number;
}) {
  const { userId, symbol, market, direction, positionPct } = params;
  logger.info(`[MCP] check_risk userId=${userId} symbol=${symbol} positionPct=${positionPct}`);

  const user = await getUserById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  const [snapshot, manualPositions] = await Promise.all([
    getAccountSnapshot(userId, 'futu'),
    getManualPositions(userId),
  ]);

  const result = await checkRisk({
    user,
    symbol,
    market,
    suggestedPositionPct: positionPct,
    accountSnapshot: snapshot,
    manualPositions,
  });

  return { userId, symbol, direction, positionPct, ...result };
}
