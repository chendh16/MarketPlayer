/**
 * 数据持久化 MCP 工具
 */

import { initDatabase, savePosition, getPosition, getAllPositions, deletePosition, saveSignal, getSignals, saveSetting, getSetting, getStats, PositionRecord, SignalRecord } from '../../services/db/persistence';

// 初始化
initDatabase();

/**
 * 保存持仓
 */
export async function save_position_record(params: {
  symbol: string;
  market: string;
  quantity: number;
  avgPrice: number;
}): Promise<{ success: boolean; message: string }> {
  const id = `${params.market}-${params.symbol}`;
  savePosition({
    id,
    symbol: params.symbol,
    market: params.market,
    quantity: params.quantity,
    avgPrice: params.avgPrice,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { success: true, message: `持仓已保存: ${params.symbol}` };
}

/**
 * 获取持仓
 */
export async function get_position_record(params: {
  symbol: string;
  market: string;
}): Promise<{ success: boolean; data?: PositionRecord }> {
  const pos = getPosition(params.market, params.symbol);
  return { success: true, data: pos };
}

/**
 * 获取所有持仓
 */
export async function get_all_position_records(): Promise<{ success: boolean; data: PositionRecord[] }> {
  return { success: true, data: getAllPositions() };
}

/**
 * 删除持仓
 */
export async function delete_position_record(params: {
  symbol: string;
  market: string;
}): Promise<{ success: boolean; message: string }> {
  const deleted = deletePosition(params.market, params.symbol);
  return { success: deleted, message: deleted ? '已删除' : '不存在' };
}

/**
 * 保存交易信号
 */
export async function save_trading_signal(params: {
  symbol: string;
  market: string;
  signal: 'buy' | 'sell' | 'hold';
  strategy: string;
  price: number;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const id = `sig_${Date.now()}_${params.symbol}`;
  saveSignal({
    id,
    symbol: params.symbol,
    market: params.market,
    signal: params.signal,
    strategy: params.strategy,
    price: params.price,
    reason: params.reason,
    timestamp: Date.now(),
  });
  return { success: true, message: `信号已保存: ${params.signal} ${params.symbol}` };
}

/**
 * 获取交易信号
 */
export async function get_trading_signals(params: {
  symbol?: string;
  limit?: number;
}): Promise<{ success: boolean; data: SignalRecord[] }> {
  const signals = getSignals(params.symbol, params.limit || 100);
  return { success: true, data: signals };
}

/**
 * 保存设置
 */
export async function save_user_setting(params: {
  key: string;
  value: any;
}): Promise<{ success: boolean; message: string }> {
  saveSetting(params.key, params.value);
  return { success: true, message: `设置已保存: ${params.key}` };
}

/**
 * 获取设置
 */
export async function get_user_setting<T>(params: {
  key: string;
  defaultValue?: T;
}): Promise<{ success: boolean; value: T }> {
  const value = getSetting(params.key, params.defaultValue || null);
  return { success: true, value: value as any };
}

/**
 * 获取统计
 */
export async function get_database_stats(): Promise<{ success: boolean; data: { positions: number; orders: number; signals: number } }> {
  return { success: true, data: getStats() };
}
