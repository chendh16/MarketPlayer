import { stepConfirmOrder } from '../../queues/steps/order-interact';
import { getDelivery } from '../../db/queries';
import { query } from '../../db/postgres';
import { SignalDelivery } from '../../models/signal';
import { logger } from '../../utils/logger';

/**
 * get_deliveries — 查询信号交付记录
 */
export async function get_deliveries(params: {
  userId?: string;
  status?: string;
  limit?: number;
}) {
  const { userId, status, limit = 50 } = params;
  logger.info(`[MCP] get_deliveries userId=${userId} status=${status}`);

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (userId) { conditions.push(`user_id = $${idx++}`); values.push(userId); }
  if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
  values.push(limit);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query<SignalDelivery>(`
    SELECT * FROM signal_deliveries
    ${where}
    ORDER BY sent_at DESC
    LIMIT $${idx}
  `, values);

  return { deliveries: rows, total: rows.length };
}

/**
 * get_delivery — 查询单条信号交付记录
 */
export async function get_delivery(params: { deliveryId: string }) {
  const { deliveryId } = params;
  logger.info(`[MCP] get_delivery deliveryId=${deliveryId}`);

  const delivery = await getDelivery(deliveryId);
  if (!delivery) throw new Error(`Delivery not found: ${deliveryId}`);
  return delivery;
}

/**
 * confirm_order — 确认下单（将 delivery 加入下单队列）
 */
export async function confirm_order(params: {
  deliveryId: string;
  orderToken: string;
  overrideWarning?: boolean;
}) {
  const { deliveryId, orderToken, overrideWarning = false } = params;
  logger.info(`[MCP] confirm_order deliveryId=${deliveryId}`);

  const result = await stepConfirmOrder(deliveryId, orderToken, overrideWarning);
  return result;
}
