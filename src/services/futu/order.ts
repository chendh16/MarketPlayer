import { Order } from '../../models/order';
import { User } from '../../models/user';
import { config } from '../../config';
import {
  FutuPlaceOrderRequest,
  FutuTradeConnection,
  getFutuConnection,
} from './connection';
import { logger } from '../../utils/logger';

export interface FutuOrderResult {
  success: boolean;
  mode: 'A' | 'B' | 'C';
  brokerOrderId?: string;
  executedPrice?: number;
  executedQty?: number;
  orderStatus?: 'submitted' | 'filled' | 'partial_filled' | 'failed' | 'cancelled';
  deepLink?: string;
  failureType?: 'retryable' | 'price_deviation' | 'insufficient_funds' | 'system_error';
  failureMessage?: string;
}

export async function executeFutuOrder(user: User, order: Order): Promise<FutuOrderResult> {
  if (config.COLD_START_MODE) {
    logger.warn('COLD_START_MODE enabled, force fallback to Plan B');
    return executeFutuOrderPlanB(order);
  }

  switch (config.FUTU_ORDER_MODE) {
    case 'A': {
      const result = await executeFutuOrderPlanA(user, order);
      if (!result.success && config.FUTU_FALLBACK_TO_PLAN_B) {
        logger.warn(`Plan A failed, fallback to Plan B. reason=${result.failureMessage}`);
        return executeFutuOrderPlanB(order);
      }
      return result;
    }
    case 'C':
      return executeFutuOrderPlanC(order);
    case 'B':
    default:
      return executeFutuOrderPlanB(order);
  }
}

// 方案B：生成富途深链接（MVP 默认方案）
export async function executeFutuOrderPlanB(order: Order): Promise<FutuOrderResult> {
  const baseUrl = 'futunn://trade/order';
  const params = new URLSearchParams({
    code: normalizeCode(order.symbol, order.market),
    market: mapMarketToFutuCode(order.market),
    side: order.direction === 'buy' ? '1' : '2',
    qty: String(Math.floor(order.quantity)),
    price: String(order.referencePrice ?? 0),
  });

  const deepLink = `${baseUrl}?${params.toString()}`;
  return {
    success: true,
    mode: 'B',
    orderStatus: 'submitted',
    brokerOrderId: `DEEPLINK-${Date.now()}`,
    deepLink,
  };
}

// 方案C：纯通知，不执行下单
export async function executeFutuOrderPlanC(order: Order): Promise<FutuOrderResult> {
  logger.info(`Plan C (notify only), order=${order.id}, symbol=${order.symbol}`);
  return {
    success: true,
    mode: 'C',
    orderStatus: 'submitted',
    brokerOrderId: `MANUAL-${Date.now()}`,
  };
}

function mapMarketToFutuCode(market: string): string {
  const mapping: Record<string, string> = {
    us: 'US',
    hk: 'HK',
    a: 'SH', // 或 SZ
  };
  return mapping[market] ?? 'US';
}

// 方案A：全自动下单（需要富途交易级API权限）
export async function executeFutuOrderPlanA(
  user: User,
  order: Order
): Promise<FutuOrderResult> {
  let connection: FutuTradeConnection;
  try {
    connection = await getFutuConnection(user.id);
  } catch (error) {
    return classifyFutuError(error, 'A');
  }

  try {
    const request = buildPlaceOrderRequest(order);
    const placed = await connection.placeOrder(request);

    const mappedStatus = mapFutuOrderStatus(placed.orderStatus);
    return {
      success: mappedStatus !== 'failed',
      mode: 'A',
      brokerOrderId: placed.orderId || undefined,
      executedPrice: placed.dealtAvgPrice ?? order.referencePrice,
      executedQty: placed.dealtQty,
      orderStatus: mappedStatus,
      failureType: mappedStatus === 'failed' ? 'system_error' : undefined,
      failureMessage: mappedStatus === 'failed' ? 'Futu order status is failed' : undefined,
    };
  } catch (error) {
    return classifyFutuError(error, 'A');
  }
}

export async function cancelFutuOrder(
  user: User,
  brokerOrderId: string
): Promise<FutuOrderResult> {
  try {
    const connection = await getFutuConnection(user.id);
    await connection.modifyOrder({
      orderId: brokerOrderId,
      modifyOp: 'CANCEL',
      trdEnv: config.FUTU_TRD_ENV,
      accId: config.FUTU_TRADE_ACC_ID,
      accIndex: config.FUTU_TRADE_ACC_INDEX,
    });
    return {
      success: true,
      mode: 'A',
      brokerOrderId,
      orderStatus: 'cancelled',
    };
  } catch (error) {
    return classifyFutuError(error, 'A');
  }
}

function buildPlaceOrderRequest(order: Order): FutuPlaceOrderRequest {
  const reference = order.referencePrice ?? 0;
  const slipPct = Math.max(0, config.FUTU_ORDER_PRICE_SLIPPAGE_PCT);
  const price = applySlippage(reference, order.direction, slipPct, order.market);
  const qty = Math.max(1, Math.floor(order.quantity));

  return {
    trdMarket: mapTrdMarket(order.market),
    trdSide: order.direction === 'buy' ? 'BUY' : 'SELL',
    orderType: 'NORMAL',
    code: normalizeCode(order.symbol, order.market),
    qty,
    price,
    trdEnv: config.FUTU_TRD_ENV,
    accId: config.FUTU_TRADE_ACC_ID,
    accIndex: config.FUTU_TRADE_ACC_INDEX,
    remark: `MarketPlayer order=${order.id}`,
  };
}

function mapTrdMarket(market: Order['market']): 'US' | 'HK' | 'CN' {
  switch (market) {
    case 'us':
      return 'US';
    case 'hk':
      return 'HK';
    case 'a':
      return 'CN';
    default:
      throw new Error(`Unsupported market for Futu trade: ${market}`);
  }
}

function normalizeCode(symbol: string, market: Order['market']): string {
  if (symbol.includes('.')) return symbol.toUpperCase();

  switch (market) {
    case 'us':
      return `US.${symbol.toUpperCase()}`;
    case 'hk':
      return `HK.${symbol.toUpperCase()}`;
    case 'a': {
      const normalized = symbol.toUpperCase();
      const exchange = normalized.startsWith('6') ? 'SH' : 'SZ';
      return `${exchange}.${normalized}`;
    }
    default:
      return symbol.toUpperCase();
  }
}

function applySlippage(
  referencePrice: number,
  direction: Order['direction'],
  slippagePct: number,
  market: Order['market']
): number {
  if (referencePrice <= 0) return 0;
  const multiplier = direction === 'buy' ? (1 + slippagePct) : (1 - slippagePct);
  const raw = referencePrice * multiplier;
  const decimals = market === 'us' ? 4 : 3;
  return Number(raw.toFixed(decimals));
}

function mapFutuOrderStatus(status: string | number | undefined): 'submitted' | 'filled' | 'partial_filled' | 'failed' | 'cancelled' {
  if (status === undefined || status === null) return 'submitted';

  // Futu enum numeric values (OrderStatus):
  // Unknown=0, Unsubmitted=1, WaitingSubmit=2, Submitting=3, SubmitFailed=4, Submitted=5,
  // FilledPart=10, FilledAll=11, CancelledPart=12, CancelledAll=13, Failed=21, Disabled=22, Deleted=23
  if (typeof status === 'number') {
    if (status === 10 || status === 12) return 'partial_filled';
    if (status === 11) return 'filled';
    if (status === 13 || status === 23) return 'cancelled';
    if (status === 4 || status === 21 || status === 22 || status === 0) return 'failed';
    return 'submitted';
  }

  const normalized = status.toLowerCase();
  if (normalized.includes('filledall') || normalized.includes('filled_all')) return 'filled';
  if (normalized.includes('filledpart') || normalized.includes('filled_part') || normalized.includes('cancelledpart')) return 'partial_filled';
  if (normalized.includes('cancelledall') || normalized.includes('cancelled_all') || normalized.includes('deleted')) return 'cancelled';
  if (normalized.includes('failed') || normalized.includes('submitfailed') || normalized.includes('disabled') || normalized.includes('unknown')) return 'failed';
  return 'submitted';
}

function classifyFutuError(error: unknown, mode: 'A' | 'B' | 'C'): FutuOrderResult {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('timeout') ||
    normalized.includes('network') ||
    normalized.includes('econnrefused') ||
    normalized.includes('socket') ||
    normalized.includes('temporarily')
  ) {
    return { success: false, mode, failureType: 'retryable', failureMessage: message, orderStatus: 'failed' };
  }

  if (
    normalized.includes('price') ||
    normalized.includes('deviation') ||
    normalized.includes('outside') ||
    normalized.includes('tick')
  ) {
    return { success: false, mode, failureType: 'price_deviation', failureMessage: message, orderStatus: 'failed' };
  }

  if (
    normalized.includes('fund') ||
    normalized.includes('cash') ||
    normalized.includes('balance') ||
    normalized.includes('buying power')
  ) {
    return { success: false, mode, failureType: 'insufficient_funds', failureMessage: message, orderStatus: 'failed' };
  }

  return { success: false, mode, failureType: 'system_error', failureMessage: message, orderStatus: 'failed' };
}
