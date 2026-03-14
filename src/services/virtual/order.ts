/**
 * 虚拟盘服务
 * 
 * 模拟真实交易，支持做多/做空
 * 调用富途/长桥API获取实时行情
 */

import { logger } from '../../utils/logger';
import { getUSStockPrice, getHKStockPrice, StockQuote } from '../market/quote-service';

export type Market = 'us' | 'hk' | 'a';
export type Direction = 'long' | 'short';

export interface VirtualPosition {
  id: number;
  symbol: string;
  market: Market;
  direction: Direction;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  profit: number;
  profitPercent: number;
  openDate: Date;
}

export interface VirtualOrder {
  id: number;
  symbol: string;
  market: Market;
  direction: Direction;
  quantity: number;
  price: number;
  amount: number;
  status: 'pending' | 'filled' | 'cancelled';
  orderType: 'market' | 'limit';
  createdAt: Date;
  filledAt?: Date;
}

export interface VirtualAccount {
  userId: string;
  initialCash: number;
  currentCash: number;
  marketValue: number;  // 持仓市值
  totalValue: number;  // 总资产 = cash + marketValue
  totalProfit: number; // 总盈亏
  profitPercent: number; // 盈亏比例
  positions: VirtualPosition[];
  updatedAt: Date;
}

// 默认配置
const DEFAULT_CONFIG = {
  initialCash: 1000000,  // 100万
  userId: 'default',
};

// 内存存储（后续可持久化）
let account: VirtualAccount | null = null;
let orders: VirtualOrder[] = [];
let nextOrderId = 1;

// ==================== 账户管理 ====================

/**
 * 初始化虚拟账户
 */
export function initVirtualAccount(userId: string = DEFAULT_CONFIG.userId, initialCash: number = DEFAULT_CONFIG.initialCash): VirtualAccount {
  account = {
    userId,
    initialCash,
    currentCash: initialCash,
    marketValue: 0,
    totalValue: initialCash,
    totalProfit: 0,
    profitPercent: 0,
    positions: [],
    updatedAt: new Date(),
  };
  
  logger.info(`[Virtual] 虚拟账户初始化: ${userId}, 初始资金 ¥${initialCash}`);
  
  return account;
}

/**
 * 获取虚拟账户
 */
export function getVirtualAccount(): VirtualAccount | null {
  return account;
}

/**
 * 重置虚拟账户
 */
export function resetVirtualAccount(): void {
  account = null;
  orders = [];
  nextOrderId = 1;
  logger.info('[Virtual] 虚拟账户已重置');
}

// ==================== 行情获取 ====================

/**
 * 获取实时行情
 */
async function getQuote(symbol: string, market: Market): Promise<StockQuote | null> {
  try {
    if (market === 'us') {
      return await getUSStockPrice(symbol);
    } else if (market === 'hk') {
      return await getHKStockPrice(symbol);
    }
    // A股暂时返回null
    return null;
  } catch (error) {
    logger.error(`[Virtual] 获取行情失败: ${symbol}`, error);
    return null;
  }
}

// ==================== 下单 ====================

/**
 * 下单（做多/做空）
 */
export async function placeVirtualOrder(params: {
  symbol: string;
  market: Market;
  direction: Direction;
  quantity: number;
  price?: number;  // 市价单时不需要
  orderType?: 'market' | 'limit';
}): Promise<{
  success: boolean;
  order?: VirtualOrder;
  message: string;
}> {
  const { symbol, market, direction, quantity, price, orderType = 'market' } = params;
  
  if (!account) {
    return { success: false, message: '请先初始化虚拟账户' };
  }
  
  // 获取实时价格
  const quote = await getQuote(symbol, market);
  const execPrice = price || quote?.price;
  
  if (!execPrice) {
    return { success: false, message: `无法获取 ${symbol} 行情` };
  }
  
  const orderAmount = execPrice * quantity;
  
  // 资金检查
  if (direction === 'long') {
    if (orderAmount > account.currentCash) {
      return { success: false, message: `资金不足，需要 ¥${orderAmount}，可用 ¥${account.currentCash}` };
    }
  } else {
    // 做空需要保证金（简化：按80%计算）
    const margin = orderAmount * 0.8;
    if (margin > account.currentCash) {
      return { success: false, message: `做空保证金不足，需要 ¥${margin}` };
    }
  }
  
  // 创建订单
  const order: VirtualOrder = {
    id: nextOrderId++,
    symbol,
    market,
    direction,
    quantity,
    price: execPrice,
    amount: orderAmount,
    status: 'pending',
    orderType,
    createdAt: new Date(),
  };
  
  // 市价单立即成交
  if (orderType === 'market') {
    order.status = 'filled';
    order.filledAt = new Date();
    
    // 更新持仓
    await updatePosition(order);
    
    // 更新账户
    account.currentCash -= direction === 'long' ? orderAmount : -orderAmount;
  }
  
  orders.push(order);
  
  await updateAccountValue();
  
  logger.info(`[Virtual] 下单成功: ${direction} ${quantity}股 ${symbol} @ ¥${execPrice}`);
  
  return {
    success: true,
    order,
    message: `${direction === 'long' ? '做多' : '做空'} ${quantity}股 ${symbol} @ ¥${execPrice}`,
  };
}

/**
 * 平仓（卖出/买回）
 */
export async function closePosition(params: {
  symbol: string;
  market: Market;
  quantity?: number;  // 不指定则全部平掉
}): Promise<{
  success: boolean;
  message: string;
  profit?: number;
}> {
  const { symbol, market, quantity } = params;
  
  if (!account) {
    return { success: false, message: '账户未初始化' };
  }
  
  // 查找持仓
  const position = account.positions.find(p => p.symbol === symbol && p.market === market);
  
  if (!position) {
    return { success: false, message: `没有${symbol}的持仓` };
  }
  
  const closeQty = quantity || position.quantity;
  
  if (closeQty > position.quantity) {
    return { success: false, message: `持仓不足，当前 ${position.quantity}股` };
  }
  
  // 获取实时价格
  const quote = await getQuote(symbol, market);
  if (!quote) {
    return { success: false, message: '无法获取行情' };
  }
  
  const closeAmount = quote.price * closeQty;
  
  // 做空平仓需要买入
  if (position.direction === 'short') {
    if (closeAmount > account.currentCash) {
      return { success: false, message: '资金不足，无法买回' };
    }
    account.currentCash -= closeAmount;
  } else {
    account.currentCash += closeAmount;
  }
  
  // 计算平仓盈亏
  const profit = position.direction === 'long'
    ? (quote.price - position.avgCost) * closeQty
    : (position.avgCost - quote.price) * closeQty;
  
  // 更新持仓
  if (closeQty === position.quantity) {
    account.positions = account.positions.filter(p => p !== position);
  } else {
    position.quantity -= closeQty;
    position.marketValue = position.quantity * quote.price;
    position.profit = position.direction === 'long'
      ? (quote.price - position.avgCost) * position.quantity
      : (position.avgCost - quote.price) * position.quantity;
    position.profitPercent = (position.profit / (position.avgCost * position.quantity)) * 100;
  }
  
  await updateAccountValue();
  
  logger.info(`[Virtual] 平仓成功: ${symbol} ${closeQty}股, 盈亏: ¥${profit}`);
  
  return {
    success: true,
    message: `平仓 ${closeQty}股 ${symbol}, 盈亏 ¥${profit}`,
    profit,
  };
}

// ==================== 持仓管理 ====================

/**
 * 更新持仓
 */
async function updatePosition(order: VirtualOrder): Promise<void> {
  if (!account) return;
  
  const existing = account.positions.find(
    p => p.symbol === order.symbol && p.market === order.market && p.direction === order.direction
  );
  
  if (existing) {
    // 增持：更新均价
    const totalCost = existing.avgCost * existing.quantity + order.price * order.quantity;
    const totalQty = existing.quantity + order.quantity;
    existing.avgCost = totalCost / totalQty;
    existing.quantity = totalQty;
  } else {
    // 新持仓
    account.positions.push({
      id: Date.now(),
      symbol: order.symbol,
      market: order.market,
      direction: order.direction,
      quantity: order.quantity,
      avgCost: order.price,
      currentPrice: order.price,
      marketValue: order.price * order.quantity,
      profit: 0,
      profitPercent: 0,
      openDate: new Date(),
    });
  }
}

/**
 * 更新账户市值和盈亏
 */
async function updateAccountValue(): Promise<void> {
  if (!account) return;
  
  let totalMarketValue = 0;
  
  // 更新每个持仓的当前市值
  for (const pos of account.positions) {
    const quote = await getQuote(pos.symbol, pos.market);
    if (quote) {
      pos.currentPrice = quote.price;
      pos.marketValue = pos.quantity * quote.price;
      pos.profit = pos.direction === 'long'
        ? (quote.price - pos.avgCost) * pos.quantity
        : (pos.avgCost - quote.price) * pos.quantity;
      pos.profitPercent = (pos.profit / (pos.avgCost * pos.quantity)) * 100;
      totalMarketValue += pos.marketValue;
    }
  }
  
  account.marketValue = totalMarketValue;
  account.totalValue = account.currentCash + totalMarketValue;
  account.totalProfit = account.totalValue - account.initialCash;
  account.profitPercent = (account.totalProfit / account.initialCash) * 100;
  account.updatedAt = new Date();
}

// ==================== 查询 ====================

/**
 * 获取持仓列表
 */
export function getPositions(): VirtualPosition[] {
  return account?.positions || [];
}

/**
 * 获取订单历史
 */
export function getOrderHistory(limit: number = 20): VirtualOrder[] {
  return orders.slice(-limit).reverse();
}

/**
 * 刷新账户（更新最新行情）
 */
export async function refreshAccount(): Promise<VirtualAccount | null> {
  await updateAccountValue();
  return account;
}
