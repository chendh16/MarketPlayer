/**
 * 看盘服务数据库操作
 * 
 * 管理监控规则和告警日志
 */

import { getPool } from '../../../db/postgres';
import { logger } from '../../../utils/logger';
import { WatchRule, WatchAlert, WatchConditions } from './detector';

const DEFAULT_CONDITIONS: WatchConditions = {
  priceChangePercent: 5,
  limitUp: true,
  limitDown: true,
  volumeRatio: 2,
  rsiOverbought: 80,
  rsiOversold: 20,
};

/**
 * 初始化数据库表
 */
export async function initWatcherTables(): Promise<void> {
  // 监控规则表
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS watch_rules (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      market VARCHAR(10) DEFAULT 'a',
      conditions JSONB DEFAULT '{"priceChangePercent": 5, "limitUp": true, "limitDown": true, "volumeRatio": 2, "rsiOverbought": 80, "rsiOversold": 20}',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, symbol)
    )
  `);
  
  // 告警日志表
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS watch_alerts (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES watch_rules(id),
      user_id VARCHAR(255) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      condition VARCHAR(50) NOT NULL,
      trigger_value FLOAT,
      message TEXT,
      sent_to JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // 创建索引
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS idx_watch_rules_user ON watch_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_watch_alerts_user ON watch_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_watch_alerts_created ON watch_alerts(created_at);
  `);
  
  logger.info('[Watcher] 数据库表初始化完成');
}

/**
 * 获取用户的监控规则
 */
export async function getWatchRules(userId: string): Promise<WatchRule[]> {
  const result = await getPool().query(
    'SELECT * FROM watch_rules WHERE user_id = $1 AND enabled = true',
    [userId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    market: row.market,
    conditions: row.conditions,
    enabled: row.enabled,
  }));
}

/**
 * 获取所有监控规则
 */
export async function getAllWatchRules(): Promise<WatchRule[]> {
  const result = await getPool().query(
    'SELECT * FROM watch_rules WHERE enabled = true'
  );
  
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    market: row.market,
    conditions: row.conditions,
    enabled: row.enabled,
  }));
}

/**
 * 获取用户的自选股列表（所有启用的规则）
 */
export async function getUserWatchList(): Promise<Array<{
  userId: string;
  symbol: string;
  market: string;
  conditions: WatchConditions;
}>> {
  const result = await getPool().query(`
    SELECT user_id, symbol, market, conditions 
    FROM watch_rules 
    WHERE enabled = true
  `);
  
  return result.rows.map(row => ({
    userId: row.user_id,
    symbol: row.symbol,
    market: row.market,
    conditions: row.conditions || DEFAULT_CONDITIONS,
  }));
}

/**
 * 添加监控规则
 */
export async function addWatchRule(
  userId: string,
  symbol: string,
  market: string = 'a',
  conditions?: Partial<WatchConditions>
): Promise<number> {
  const mergedConditions = { ...DEFAULT_CONDITIONS, ...conditions };
  
  const result = await getPool().query(`
    INSERT INTO watch_rules (user_id, symbol, market, conditions)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, symbol) 
    DO UPDATE SET conditions = $4, enabled = true, updated_at = NOW()
    RETURNING id
  `, [userId, symbol, market, JSON.stringify(mergedConditions)]);
  
  logger.info(`[Watcher] 添加监控规则: ${userId} - ${symbol}`);
  
  return result.rows[0].id;
}

/**
 * 移除监控规则
 */
export async function removeWatchRule(userId: string, symbol: string): Promise<boolean> {
  const result = await getPool().query(
    'DELETE FROM watch_rules WHERE user_id = $1 AND symbol = $2',
    [userId, symbol]
  );
  
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * 启用/禁用监控规则
 */
export async function toggleWatchRule(
  userId: string,
  symbol: string,
  enabled: boolean
): Promise<boolean> {
  const result = await getPool().query(
    'UPDATE watch_rules SET enabled = $3, updated_at = NOW() WHERE user_id = $1 AND symbol = $2',
    [userId, symbol, enabled]
  );
  
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * 更新监控条件
 */
export async function updateWatchConditions(
  userId: string,
  symbol: string,
  conditions: Partial<WatchConditions>
): Promise<boolean> {
  // 先获取现有条件
  const existing = await getPool().query(
    'SELECT conditions FROM watch_rules WHERE user_id = $1 AND symbol = $2',
    [userId, symbol]
  );
  
  const merged = {
    ...DEFAULT_CONDITIONS,
    ...(existing.rows[0]?.conditions || {}),
    ...conditions,
  };
  
  const result = await getPool().query(
    'UPDATE watch_rules SET conditions = $3, updated_at = NOW() WHERE user_id = $1 AND symbol = $2',
    [userId, symbol, JSON.stringify(merged)]
  );
  
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * 保存告警日志
 */
export async function saveAlertLog(alert: WatchAlert): Promise<number> {
  const result = await getPool().query(`
    INSERT INTO watch_alerts (rule_id, user_id, symbol, condition, trigger_value, message)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    alert.ruleId,
    alert.userId,
    alert.symbol,
    alert.condition,
    alert.triggerValue,
    alert.message,
  ]);
  
  return result.rows[0].id;
}

/**
 * 获取告警历史
 */
export async function getAlertHistory(
  userId: string,
  limit: number = 50
): Promise<WatchAlert[]> {
  const result = await getPool().query(
    `SELECT * FROM watch_alerts 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    ruleId: row.rule_id,
    userId: row.user_id,
    symbol: row.symbol,
    condition: row.condition,
    triggerValue: row.trigger_value,
    message: row.message,
    timestamp: row.created_at,
    quote: null as any, // 历史记录不保存完整行情
  }));
}

/**
 * 获取今日告警统计
 */
export async function getTodayAlertStats(): Promise<{
  total: number;
  byCondition: Record<string, number>;
}> {
  const result = await getPool().query(`
    SELECT condition, COUNT(*) as count 
    FROM watch_alerts 
    WHERE created_at >= CURRENT_DATE
    GROUP BY condition
  `);
  
  const byCondition: Record<string, number> = {};
  let total = 0;
  
  for (const row of result.rows) {
    byCondition[row.condition] = parseInt(row.count);
    total += parseInt(row.count);
  }
  
  return { total, byCondition };
}
