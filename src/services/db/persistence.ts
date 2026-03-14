/**
 * 数据持久化服务
 * SQLite 存储
 */

import { logger } from '../../utils/logger';

// 简单的SQLite内存实现 (可替换为better-sqlite3)
class Database {
  private data: Map<string, Map<string, any>> = new Map();
  
  // 初始化表
  init(table: string, schema: string): void {
    if (!this.data.has(table)) {
      this.data.set(table, new Map());
      logger.info(`[DB] 初始化表: ${table}`);
    }
  }
  
  // 插入/更新
  upsert(table: string, key: string, value: any): void {
    this.data.get(table)!.set(key, { ...value, updatedAt: Date.now() });
  }
  
  // 查询
  get(table: string, key: string): any {
    return this.data.get(table)?.get(key);
  }
  
  // 列表
  list(table: string, filter?: (v: any) => boolean): any[] {
    const rows = Array.from(this.data.get(table)?.values() || []);
    return filter ? rows.filter(filter) : rows;
  }
  
  // 删除
  delete(table: string, key: string): boolean {
    return this.data.get(table)?.delete(key) || false;
  }
  
  // 统计
  count(table: string): number {
    return this.data.get(table)?.size || 0;
  }
}

const db = new Database();

// ==================== 初始化 ====================

export function initDatabase(): void {
  // 持仓表
  db.init('positions', 'symbol,market,quantity,avgPrice');
  
  // 订单表
  db.init('orders', 'id,symbol,type,price,quantity,status');
  
  // 信号表
  db.init('signals', 'id,symbol,signal,strategy,price,reason,timestamp');
  
  // K线表
  db.init('klines', 'symbol,market,interval,timestamp,open,high,low,close,volume');
  
  // 用户设置表
  db.init('settings', 'key,value');
  
  logger.info('[DB] 数据库初始化完成');
}

// ==================== 持仓 ====================

export interface PositionRecord {
  id: string;
  symbol: string;
  market: string;
  quantity: number;
  avgPrice: number;
  createdAt: number;
  updatedAt: number;
}

export function savePosition(pos: PositionRecord): void {
  db.upsert('positions', `${pos.market}-${pos.symbol}`, pos);
}

export function getPosition(market: string, symbol: string): PositionRecord | undefined {
  return db.get('positions', `${market}-${symbol}`);
}

export function getAllPositions(): PositionRecord[] {
  return db.list('positions');
}

export function deletePosition(market: string, symbol: string): boolean {
  return db.delete('positions', `${market}-${symbol}`);
}

// ==================== 订单 ====================

export interface OrderRecord {
  id: string;
  symbol: string;
  market: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  status: 'pending' | 'filled' | 'cancelled';
  createdAt: number;
}

export function saveOrder(order: OrderRecord): void {
  db.upsert('orders', order.id, order);
}

export function getOrder(id: string): OrderRecord | undefined {
  return db.get('orders', id);
}

export function getOrders(status?: string): OrderRecord[] {
  return db.list('orders', status ? (o: any) => o.status === status : undefined);
}

// ==================== 信号 ====================

export interface SignalRecord {
  id: string;
  symbol: string;
  market: string;
  signal: 'buy' | 'sell' | 'hold';
  strategy: string;
  price: number;
  reason: string;
  timestamp: number;
}

export function saveSignal(signal: SignalRecord): void {
  db.upsert('signals', signal.id, signal);
}

export function getSignals(symbol?: string, limit = 100): SignalRecord[] {
  const all = db.list('signals');
  const filtered = symbol ? all.filter((s: any) => s.symbol === symbol) : all;
  return filtered.sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, limit);
}

// ==================== 设置 ====================

export function saveSetting(key: string, value: any): void {
  db.upsert('settings', key, { key, value, updatedAt: Date.now() });
}

export function getSetting<T>(key: string, defaultValue: T): T {
  const row = db.get('settings', key);
  return row ? row.value : defaultValue;
}

// ==================== 统计 ====================

export function getStats(): {
  positions: number;
  orders: number;
  signals: number;
} {
  return {
    positions: db.count('positions'),
    orders: db.count('orders'),
    signals: db.count('signals'),
  };
}
