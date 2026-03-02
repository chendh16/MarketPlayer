import { Order } from '../../models/order';
import { User } from '../../models/user';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getLongbridgeContext, LongbridgePlaceOrderRequest } from './connection';
import { invalidateLongbridgeCache } from './position';

export interface LongbridgeOrderResult {
  success: boolean;
  mode: 'A' | 'B' | 'C';
  brokerOrderId?: string;
  executedPrice?: number;
  orderStatus?: 'submitted' | 'filled' | 'partial_filled' | 'failed' | 'cancelled';
  failureType?: 'retryable' | 'price_deviation' | 'insufficient_funds' | 'system_error';
  failureMessage?: string;
  deepLink?: string;
}

// ─── 主入口：根据 LONGBRIDGE_ORDER_MODE 选择方案 ──────────────────────────────

export async function executeLongbridgeOrder(
  user: User,
  order: Order
): Promise<LongbridgeOrderResult> {
  const mode = config.LONGBRIDGE_ORDER_MODE;

  switch (mode) {
    case 'A':
      return executePlanA(user, order);
    case 'C':
      return executePlanC(order);
    case 'B':
    default:
      return executePlanB(order);
  }
}

// 方案 A：全自动下单（需要 LongBridge API 交易权限）
async function executePlanA(user: User, order: Order): Promise<LongbridgeOrderResult> {
  try {
    const ctx = await getLongbridgeContext();
    const req = buildPlaceOrderRequest(order);
    const res = await ctx.submitOrder(req);

    logger.info(`LongBridge order placed: orderId=${res.orderId} user=${user.id}`);
    await invalidateLongbridgeCache(user.id);

    return {
      success: true,
      mode: 'A',
      brokerOrderId: res.orderId,
      orderStatus: 'submitted',
    };
  } catch (err: unknown) {
    return classifyError(err);
  }
}

// 方案 B：生成长桥 App 深链接（默认）
function executePlanB(order: Order): LongbridgeOrderResult {
  const symbol = normalizeLongbridgeSymbol(order.symbol, order.market);
  // 长桥深链接格式（参考长桥 App URL Scheme）
  const params = new URLSearchParams({
    symbol,
    side:  order.direction === 'buy' ? '1' : '2',
    qty:   String(Math.floor(order.quantity)),
    price: String(order.referencePrice ?? 0),
  });
  const deepLink = `longbridge://trade/order?${params.toString()}`;

  return {
    success: true,
    mode: 'B',
    orderStatus: 'submitted',
    brokerOrderId: `LB-DEEPLINK-${Date.now()}`,
    deepLink,
  };
}

// 方案 C：纯通知
function executePlanC(order: Order): LongbridgeOrderResult {
  logger.info(`LongBridge Plan C (notify only), order=${order.id}, symbol=${order.symbol}`);
  return {
    success: true,
    mode: 'C',
    orderStatus: 'submitted',
    brokerOrderId: `LB-MANUAL-${Date.now()}`,
  };
}

export async function cancelLongbridgeOrder(
  user: User,
  brokerOrderId: string
): Promise<LongbridgeOrderResult> {
  try {
    const ctx = await getLongbridgeContext();
    await ctx.cancelOrder(brokerOrderId);
    await invalidateLongbridgeCache(user.id);
    return { success: true, mode: 'A', brokerOrderId, orderStatus: 'cancelled' };
  } catch (err: unknown) {
    return classifyError(err);
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function buildPlaceOrderRequest(order: Order): LongbridgePlaceOrderRequest {
  const slipPct = config.LONGBRIDGE_PRICE_SLIPPAGE_PCT;
  const ref = order.referencePrice ?? 0;
  const price = ref > 0
    ? ref * (order.direction === 'buy' ? (1 + slipPct) : (1 - slipPct))
    : undefined;

  return {
    symbol: normalizeLongbridgeSymbol(order.symbol, order.market),
    side: order.direction === 'buy' ? 'Buy' : 'Sell',
    orderType: price != null ? 'LO' : 'MO',
    quantity: Math.max(1, Math.floor(order.quantity)),
    price: price != null ? parseFloat(price.toFixed(order.market === 'us' ? 4 : 3)) : undefined,
    timeInForce: 'Day',
    remark: `MarketPlayer order=${order.id}`,
  };
}

function normalizeLongbridgeSymbol(symbol: string, market: string): string {
  // 若已有后缀（700.HK）直接返回
  if (/\.(HK|US|SH|SZ)$/i.test(symbol)) return symbol.toUpperCase();

  switch (market) {
    case 'us': return `${symbol.toUpperCase()}.US`;
    case 'hk': return `${symbol.toUpperCase()}.HK`;
    case 'a': {
      const s = symbol.toUpperCase();
      return s.startsWith('6') ? `${s}.SH` : `${s}.SZ`;
    }
    default: return symbol.toUpperCase();
  }
}

function classifyError(err: unknown): LongbridgeOrderResult {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('network') || lower.includes('connection')) {
    return { success: false, mode: 'A', failureType: 'retryable', failureMessage: message, orderStatus: 'failed' };
  }
  if (lower.includes('price') || lower.includes('deviation')) {
    return { success: false, mode: 'A', failureType: 'price_deviation', failureMessage: message, orderStatus: 'failed' };
  }
  if (lower.includes('fund') || lower.includes('cash') || lower.includes('balance')) {
    return { success: false, mode: 'A', failureType: 'insufficient_funds', failureMessage: message, orderStatus: 'failed' };
  }
  return { success: false, mode: 'A', failureType: 'system_error', failureMessage: message, orderStatus: 'failed' };
}
