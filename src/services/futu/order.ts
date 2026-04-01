import { Order } from '../../models/order';
import { User } from '../../models/user';
import { config } from '../../config';
import {
  FutuPlaceOrderRequest,
  FutuTradeConnection,
  getFutuConnection,
} from './connection';
import { logger } from '../../utils/logger';
import { spawn } from 'child_process';

export interface FutuOrderResult {
  success: boolean;
  mode: 'A' | 'B' | 'C' | 'PYTHON';
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
    case 'PYTHON':
      return await executeFutuOrderPython(order);
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

// 方案PYTHON：使用 spawn python3 调用富途 API 自动下单
export async function executeFutuOrderPython(order: Order): Promise<FutuOrderResult> {
  return new Promise((resolve) => {
    // 映射市场代码
    const marketMap: Record<string, string> = {
      us: 'US',
      US: 'US',
      hk: 'HK',
      HK: 'HK',
      a: 'SH',
      A: 'SH',
    };
    const market = marketMap[order.market] || 'US';
    
    // 映射买卖方向
    const side = order.direction === 'buy' ? 'TrdSide.BUY' : 'TrdSide.SELL';
    
    // 富途股票代码格式: US.AAPL
    let code = order.symbol;
    if (!code.includes('.')) {
      code = `${market}.${code}`;
    }
    
    const quantity = Math.floor(order.quantity);
    const price = order.referencePrice || 0;
    const trdEnv = 'TrdEnv.SIMULATE';
    const accId = 9132532; // 硬编码美股模拟账户
    
    const pythonCode = `
from futu import *
import pandas as pd

trd_ctx = OpenSecTradeContext(
    filter_trdmarket=TrdMarket.US,
    host='127.0.0.1',
    port=11111,
    security_firm=SecurityFirm.FUTUSECURITIES
)

# 不需要设置账户，OpenSecTradeContext 默认连接第一个账户

ret, data = trd_ctx.place_order(
    price=${price},
    qty=${quantity},
    code='${code}',
    trd_side=${side},
    order_type=OrderType.MARKET,
    trd_env=TrdEnv.SIMULATE
)

print('RESULT:', ret, '|', 'SUCCESS' if ret == 0 else str(data))
if ret == 0:
    print('ORDER_ID:', data['order_id'].iloc[0])
    print('ORDER_STATUS:', data['order_status'].iloc[0])
trd_ctx.close()
`;

    const child = spawn('python3', ['-c', pythonCode], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      logger.info(`[Python下单] stdout=${stdout}, stderr=${stderr}`);
      
      if (code === 0) {
        const match = stdout.match(/RESULT: (.+)/);
        if (match) {
          const parts = match[1].split('|');
          const ret = parseInt(parts[0]);

          // 提取真实 order_id
          const orderIdMatch = stdout.match(/ORDER_ID:\s*(\S+)/);
          const statusMatch = stdout.match(/ORDER_STATUS:\s*(\S+)/);
          const orderId = (ret === 0 && orderIdMatch) ? orderIdMatch[1] : null;
          const orderStatus = statusMatch ? statusMatch[1] : 'unknown';

          resolve({
            success: ret === 0,
            mode: 'PYTHON',
            brokerOrderId: orderId || undefined,
            orderStatus: ret === 0 ? 'submitted' : 'failed',
            failureMessage: ret !== 0 ? parts[1]?.trim() : undefined,
          });
        } else {
          resolve({ success: false, mode: 'PYTHON', orderStatus: 'failed', failureMessage: stdout });
        }
      } else {
        resolve({ success: false, mode: 'PYTHON', orderStatus: 'failed', failureMessage: stderr || stdout });
      }
    });

    child.on('error', (err) => {
      logger.error(`[Python下单] error=${err.message}`);
      resolve({ success: false, mode: 'PYTHON', orderStatus: 'failed', failureMessage: err.message });
    });
  });
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
    // 根据配置选择账户索引
    const accIndex = config.FUTU_USE_US_ACCOUNT ? config.FUTU_US_ACC_INDEX : config.FUTU_TRADE_ACC_INDEX;
    
    await connection.modifyOrder({
      orderId: brokerOrderId,
      modifyOp: 'CANCEL',
      trdEnv: config.FUTU_TRD_ENV,
      accId: config.FUTU_TRADE_ACC_ID,
      accIndex,
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
  
  // 根据配置选择账户索引
  const accIndex = config.FUTU_USE_US_ACCOUNT ? config.FUTU_US_ACC_INDEX : config.FUTU_TRADE_ACC_INDEX;

  return {
    trdMarket: mapTrdMarket(order.market),
    trdSide: order.direction === 'buy' ? 'BUY' : 'SELL',
    orderType: 'NORMAL',
    code: normalizeCode(order.symbol, order.market),
    qty,
    price,
    trdEnv: config.FUTU_TRD_ENV,
    accId: config.FUTU_TRADE_ACC_ID,
    accIndex,
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
