/**
 * 富途API服务 - 简化版
 * 使用现有的 connection.ts 中的方法
 */

import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getFutuConnection } from './connection';

const FUTU_HOST = '127.0.0.1';
const FUTU_PORT = 11111;

export interface FutuAccount {
  power: number;
  cash: number;
  totalAssets: number;
  marketValue: number;
}

export interface FutuPosition {
  code: string;
  name: string;
  qty: number;
  canSellQty: number;
  costPrice: number;
  marketPrice: number;
  marketValue: number;
  plRatio: number;
  plVal: number;
}

export interface FutuOrderResult {
  success: boolean;
  orderId?: string;
  status?: string;
  message?: string;
}

/**
 * 获取账户资金
 */
export async function getFutuFunds(trdEnv: 'SIMULATE' | 'REAL' = 'SIMULATE'): Promise<FutuAccount | null> {
  try {
    const conn = await getFutuConnection('default');
    if (!conn) return null;
    
    const funds = await conn.getFunds(trdEnv);
    
    const f = funds as any;
    return {
      power: f.power || 0,
      cash: f.cash || 0,
      totalAssets: f.totalAssets || f.securitiesAssets || 0,
      marketValue: f.marketVal || f.market_value || 0,
    };
  } catch (e) {
    logger.error('[Futu] get funds error:', e);
    return null;
  }
}

/**
 * 获取持仓列表
 */
export async function getFutuPositions(trdEnv: 'SIMULATE' | 'REAL' = 'SIMULATE'): Promise<FutuPosition[]> {
  try {
    const conn = await getFutuConnection('default');
    if (!conn) return [];
    
    const positions = await conn.getPositions(trdEnv);
    
    return positions.map((p: any) => ({
      code: p.code,
      name: p.name || '',
      qty: p.qty || 0,
      canSellQty: p.canSellQty || p.qty || 0,
      costPrice: p.costPrice || 0,
      marketPrice: p.currentPrice || 0,
      marketValue: p.marketVal || 0,
      plRatio: 0,
      plVal: 0,
    }));
  } catch (e) {
    logger.error('[Futu] get positions error:', e);
    return [];
  }
}

/**
 * 下单
 */
export async function placeFutuOrder(
  code: string,
  market: string,
  direction: 'buy' | 'sell',
  quantity: number,
  price: number = 0,
  orderType: string = 'MARKET',
  trdEnv: 'SIMULATE' | 'REAL' = 'SIMULATE'
): Promise<FutuOrderResult> {
  try {
    const conn = await getFutuConnection('default');
    if (!conn) {
      return { success: false, message: '富途连接不可用' };
    }
    
    // 格式化股票代码
    const marketCode = market.toUpperCase();
    const fullCode = code.includes('.') ? code.toUpperCase() : `${marketCode}.${code}`;
    
    const result = await conn.placeOrder({
      trdMarket: marketCode as any,
      trdSide: direction === 'buy' ? 'BUY' : 'SELL',
      orderType: orderType === 'MARKET' ? 'MARKET' : 'NORMAL',
      code: fullCode,
      qty: quantity,
      price: price || 0,
      trdEnv,
    });
    
    return {
      success: true,
      orderId: result.orderId,
      status: result.orderStatus?.toString(),
      message: '订单提交成功',
    };
  } catch (e: any) {
    logger.error('[Futu] place order error:', e);
    return {
      success: false,
      message: e.message || '下单失败',
    };
  }
}

/**
 * 同步富途账户
 */
export async function syncFutuAccount(): Promise<{
  account: FutuAccount | null;
  positions: FutuPosition[];
}> {
  const [account, positions] = await Promise.all([
    getFutuFunds('SIMULATE'),
    getFutuPositions('SIMULATE'),
  ]);
  
  return { account, positions };
}
