/**
 * 虚拟盘 MCP 工具
 * 
 * 提供虚拟交易接口
 */

import { logger } from '../../utils/logger';
import {
  initVirtualAccount,
  getVirtualAccount,
  resetVirtualAccount,
  placeVirtualOrder,
  closePosition,
  getPositions,
  getOrderHistory,
  refreshAccount,
  VirtualAccount,
  VirtualPosition,
  VirtualOrder,
  Market,
  Direction,
} from './order';

/**
 * 初始化虚拟账户
 */
export async function init_virtual_account(params: {
  userId?: string;
  initialCash?: number;
}): Promise<{
  success: boolean;
  account?: VirtualAccount;
  message: string;
}> {
  const { userId = 'default', initialCash = 1000000 } = params;
  
  logger.info(`[Virtual] 初始化虚拟账户: ${userId}, ${initialCash}`);
  
  const account = initVirtualAccount(userId, initialCash);
  
  return {
    success: true,
    account,
    message: `虚拟账户已初始化，资金 ¥${initialCash}`,
  };
}

/**
 * 获取虚拟账户状态
 */
export async function get_virtual_account(): Promise<{
  success: boolean;
  account?: VirtualAccount | null;
}> {
  const account = await refreshAccount();
  
  return {
    success: true,
    account,
  };
}

/**
 * 重置虚拟账户
 */
export async function reset_virtual_account(): Promise<{
  success: boolean;
  message: string;
}> {
  resetVirtualAccount();
  
  return {
    success: true,
    message: '虚拟账户已重置',
  };
}

/**
 * 买入（做多）
 */
export async function virtual_buy(params: {
  symbol: string;
  market: 'us' | 'hk' | 'a';
  quantity: number;
  price?: number;  // 市价单则不传
}): Promise<{
  success: boolean;
  order?: VirtualOrder;
  account?: VirtualAccount;
  message: string;
}> {
  const result = await placeVirtualOrder({
    symbol: params.symbol,
    market: params.market,
    direction: 'long',
    quantity: params.quantity,
    price: params.price,
    orderType: params.price ? 'limit' : 'market',
  });
  
  if (result.success) {
    const account = await refreshAccount();
    return {
      success: true,
      order: result.order,
      account: account!,
      message: result.message,
    };
  }
  
  return {
    success: false,
    message: result.message,
  };
}

/**
 * 卖出（平多仓）
 */
export async function virtual_sell(params: {
  symbol: string;
  market: 'us' | 'hk' | 'a';
  quantity?: number;  // 不传则全部卖出
}): Promise<{
  success: boolean;
  account?: VirtualAccount;
  message: string;
  profit?: number;
}> {
  const result = await closePosition({
    symbol: params.symbol,
    market: params.market,
    quantity: params.quantity,
  });
  
  if (result.success) {
    const account = await refreshAccount();
    return {
      success: true,
      account: account!,
      message: result.message,
      profit: result.profit,
    };
  }
  
  return {
    success: false,
    message: result.message,
  };
}

/**
 * 做空
 */
export async function virtual_short(params: {
  symbol: string;
  market: 'us' | 'hk' | 'a';
  quantity: number;
}): Promise<{
  success: boolean;
  order?: VirtualOrder;
  account?: VirtualAccount;
  message: string;
}> {
  const result = await placeVirtualOrder({
    symbol: params.symbol,
    market: params.market,
    direction: 'short',
    quantity: params.quantity,
    orderType: 'market',
  });
  
  if (result.success) {
    const account = await refreshAccount();
    return {
      success: true,
      order: result.order,
      account: account!,
      message: result.message,
    };
  }
  
  return {
    success: false,
    message: result.message,
  };
}

/**
 * 买回（平空仓）
 */
export async function virtual_cover(params: {
  symbol: string;
  market: 'us' | 'hk' | 'a';
  quantity?: number;
}): Promise<{
  success: boolean;
  account?: VirtualAccount;
  message: string;
  profit?: number;
}> {
  const result = await closePosition({
    symbol: params.symbol,
    market: params.market,
    quantity: params.quantity,
  });
  
  if (result.success) {
    const account = await refreshAccount();
    return {
      success: true,
      account: account!,
      message: result.message,
      profit: result.profit,
    };
  }
  
  return {
    success: false,
    message: result.message,
  };
}

/**
 * 获取持仓
 */
export async function get_virtual_positions(): Promise<{
  success: boolean;
  positions: VirtualPosition[];
}> {
  const positions = getPositions();
  
  return {
    success: true,
    positions,
  };
}

/**
 * 获取订单历史
 */
export async function get_virtual_orders(params: {
  limit?: number;
}): Promise<{
  success: boolean;
  orders: VirtualOrder[];
}> {
  const orders = getOrderHistory(params.limit || 20);
  
  return {
    success: true,
    orders,
  };
}

/**
 * 获取账户摘要
 */
export async function get_virtual_summary(): Promise<{
  success: boolean;
  summary: {
    totalValue: number;
    totalProfit: number;
    profitPercent: number;
    positions: number;
    cash: number;
  };
}> {
  const account = await refreshAccount();
  
  if (!account) {
    return {
      success: false,
      summary: {
        totalValue: 0,
        totalProfit: 0,
        profitPercent: 0,
        positions: 0,
        cash: 0,
      },
    };
  }
  
  return {
    success: true,
    summary: {
      totalValue: account.totalValue,
      totalProfit: account.totalProfit,
      profitPercent: account.profitPercent,
      positions: account.positions.length,
      cash: account.currentCash,
    },
  };
}
