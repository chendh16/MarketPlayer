import { getAccountSnapshot } from '../../services/futu/position';
import { getLongbridgeSnapshot } from '../../services/longbridge/position';
import { getManualPositions } from '../../db/queries';
import { config } from '../../config';
import { logger } from '../../utils/logger';

type Broker = 'futu' | 'longbridge';

/** 屏蔽净资产金额，仅保留持仓比例供风控使用 */
function maskFinancials<T extends { totalAssets?: number; availableCash?: number }>(obj: T): Omit<T, 'totalAssets' | 'availableCash'> {
  const { totalAssets: _ta, availableCash: _ac, ...rest } = obj as any;
  return rest;
}

/**
 * get_positions — 获取用户持仓快照
 * @param broker 券商：futu（默认）| longbridge
 */
export async function get_positions(params: {
  userId: string;
  broker?: Broker;
  forceRefresh?: boolean;
}) {
  const { userId, broker = config.PREFERRED_BROKER as Broker, forceRefresh = false } = params;
  logger.info(`[MCP] get_positions userId=${userId} broker=${broker} forceRefresh=${forceRefresh}`);

  const [snapshot, manualPositions] = await Promise.all([
    getAccountSnapshot(userId, broker, forceRefresh),
    getManualPositions(userId),
  ]);

  return {
    userId,
    broker,
    snapshot: maskFinancials(snapshot),
    manualPositions,
    fetchedAt: new Date(),
  };
}

/**
 * get_account — 获取用户账户资金概况
 * @param broker 券商：futu（默认）| longbridge
 */
export async function get_account(params: {
  userId: string;
  broker?: Broker;
}) {
  const { userId, broker = config.PREFERRED_BROKER as Broker } = params;
  logger.info(`[MCP] get_account userId=${userId} broker=${broker}`);

  const snapshot = await getAccountSnapshot(userId, broker);

  return {
    userId,
    broker,
    totalPositionPct: snapshot.totalPositionPct,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
  };
}

/**
 * get_broker_balance — 直接查询券商账户余额（无需 userId，适合 Agent 探测账户状态）
 * @param broker 券商：longbridge | futu
 */
export async function get_broker_balance(params: {
  broker: Broker;
  userId?: string;
}) {
  const { broker, userId = 'system' } = params;
  logger.info(`[MCP] get_broker_balance broker=${broker}`);

  if (broker === 'longbridge') {
    const snapshot = await getLongbridgeSnapshot(userId, true);
    return {
      broker,
      positions: snapshot.positions,
      totalPositionPct: snapshot.totalPositionPct,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  // futu：需要 userId
  const snapshot = await getAccountSnapshot(userId, 'futu', true);
  return {
    broker,
    positions: snapshot.positions,
    totalPositionPct: snapshot.totalPositionPct,
    fetchedAt: snapshot.fetchedAt,
  };
}
