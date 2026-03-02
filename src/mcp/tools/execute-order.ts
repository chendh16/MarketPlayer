import { executeLongbridgeOrder, cancelLongbridgeOrder } from '../../services/longbridge/order';
import { getUserById } from '../../db/queries';
import { logger } from '../../utils/logger';
import { Order } from '../../models/order';

/**
 * execute_longbridge_order — 通过长桥执行下单（支持 A/B/C 模式）
 *
 * Mode B（默认）：返回 deepLink，用户点击跳转长桥 App 确认
 * Mode A：全自动下单（需交易权限）
 * Mode C：纯通知
 */
export async function execute_longbridge_order(params: {
  userId: string;
  symbol: string;
  market: 'us' | 'hk' | 'a';
  direction: 'buy' | 'sell';
  quantity: number;
  referencePrice?: number;
}) {
  const { userId, symbol, market, direction, quantity, referencePrice } = params;
  logger.info(`[MCP] execute_longbridge_order userId=${userId} symbol=${symbol} direction=${direction} qty=${quantity}`);

  const user = await getUserById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  const order = {
    id: `mcp-${Date.now()}`,
    deliveryId: '',
    userId,
    broker: 'longbridge',
    symbol,
    market,
    direction,
    quantity,
    referencePrice: referencePrice ?? 0,
    status: 'pending' as const,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies Order;

  return executeLongbridgeOrder(user, order);
}

/**
 * cancel_longbridge_order — 取消长桥订单（仅 Mode A 全自动模式下有效）
 */
export async function cancel_longbridge_order(params: {
  userId: string;
  brokerOrderId: string;
}) {
  const { userId, brokerOrderId } = params;
  logger.info(`[MCP] cancel_longbridge_order userId=${userId} brokerOrderId=${brokerOrderId}`);

  const user = await getUserById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  return cancelLongbridgeOrder(user, brokerOrderId);
}
