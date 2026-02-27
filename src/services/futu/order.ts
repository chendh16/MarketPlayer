import { Order } from '../../models/order';
import { User } from '../../models/user';
import { logger } from '../../utils/logger';

export interface FutuOrderResult {
  success: boolean;
  brokerOrderId?: string;
  executedPrice?: number;
  executedQty?: number;
  failureType?: 'retryable' | 'price_deviation' | 'insufficient_funds' | 'system_error';
  failureMessage?: string;
}

// 方案B：生成富途深链接（MVP 默认方案）
export async function executeFutuOrderPlanB(order: Order): Promise<{ deepLink: string }> {
  const baseUrl = 'futunn://trade/order';
  const params = new URLSearchParams({
    code: order.symbol,
    market: mapMarketToFutuCode(order.market),
    side: order.direction === 'buy' ? '1' : '2',
    qty: String(Math.floor(order.quantity)),
    price: String(order.referencePrice ?? 0),
  });
  
  return { deepLink: `${baseUrl}?${params.toString()}` };
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
  _user: User,
  order: Order
): Promise<FutuOrderResult> {
  // TODO: 实现实际的富途API调用
  logger.warn('Futu Plan A not implemented, using mock');
  
  return {
    success: true,
    brokerOrderId: 'MOCK-' + Date.now(),
    executedPrice: order.referencePrice,
    executedQty: order.quantity,
  };
}

