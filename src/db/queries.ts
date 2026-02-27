import { query, queryOne } from '../db/postgres';
import { User, BrokerAccount, ManualPosition } from '../models/user';
import { Signal, SignalDelivery, NewsItem } from '../models/signal';
import { Order } from '../models/order';

// ==================== 用户相关 ====================

export async function getUserByDiscordId(discordUserId: string): Promise<User | null> {
  return queryOne<User>(`
    SELECT * FROM users WHERE discord_user_id = $1
  `, [discordUserId]);
}

export async function getUserById(userId: string): Promise<User | null> {
  return queryOne<User>(`
    SELECT * FROM users WHERE id = $1
  `, [userId]);
}

export async function createUser(data: {
  discordUserId: string;
  discordUsername: string;
  riskPreference?: string;
}): Promise<User> {
  const result = await queryOne<User>(`
    INSERT INTO users (discord_user_id, discord_username, risk_preference)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [data.discordUserId, data.discordUsername, data.riskPreference || 'balanced']);
  if (!result) throw new Error('Failed to create user');
  return result;
}

export async function getActiveUsersWithFutu(): Promise<User[]> {
  return query<User>(`
    SELECT DISTINCT u.* FROM users u
    JOIN broker_accounts ba ON u.id = ba.user_id
    WHERE u.is_active = true 
      AND ba.broker = 'futu' 
      AND ba.is_active = true
  `);
}

// ==================== 券商账户相关 ====================

export async function getBrokerAccount(userId: string, broker: string): Promise<BrokerAccount | null> {
  return queryOne<BrokerAccount>(`
    SELECT * FROM broker_accounts 
    WHERE user_id = $1 AND broker = $2 AND is_active = true
  `, [userId, broker]);
}

export async function getBrokerAccounts(userId: string): Promise<BrokerAccount[]> {
  return query<BrokerAccount>(`
    SELECT * FROM broker_accounts 
    WHERE user_id = $1 AND is_active = true
  `, [userId]);
}

// ==================== 手动持仓相关 ====================

export async function getManualPositions(userId: string): Promise<ManualPosition[]> {
  return query<ManualPosition>(`
    SELECT * FROM manual_positions WHERE user_id = $1
  `, [userId]);
}

// ==================== 资讯相关 ====================

export async function createNewsItem(data: Partial<NewsItem>): Promise<NewsItem | null> {
  return queryOne<NewsItem>(`
    INSERT INTO news_items (
      source, external_id, title, content, url,
      market, symbols, trigger_type, published_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (source, external_id) DO NOTHING
    RETURNING *
  `, [
    data.source,
    data.externalId,
    data.title,
    data.content,
    data.url,
    data.market,
    data.symbols,
    data.triggerType,
    data.publishedAt,
  ]);
}

export async function getNewsItem(newsItemId: string): Promise<NewsItem | null> {
  return queryOne<NewsItem>(`
    SELECT * FROM news_items WHERE id = $1
  `, [newsItemId]);
}

export async function updateNewsItem(newsItemId: string, data: Partial<NewsItem>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.aiSummary !== undefined) {
    fields.push(`ai_summary = $${paramIndex++}`);
    values.push(data.aiSummary);
  }
  if (data.aiImpactAnalysis !== undefined) {
    fields.push(`ai_impact_analysis = $${paramIndex++}`);
    values.push(data.aiImpactAnalysis);
  }
  if (data.aiProcessed !== undefined) {
    fields.push(`ai_processed = $${paramIndex++}`);
    values.push(data.aiProcessed);
  }
  if (data.aiProcessedAt !== undefined) {
    fields.push(`ai_processed_at = $${paramIndex++}`);
    values.push(data.aiProcessedAt);
  }

  if (fields.length === 0) return;

  values.push(newsItemId);
  await query(`
    UPDATE news_items SET ${fields.join(', ')} WHERE id = $${paramIndex}
  `, values);
}

// ==================== 信号相关 ====================

export async function createSignal(data: Partial<Signal>): Promise<Signal> {
  const result = await queryOne<Signal>(`
    INSERT INTO signals (
      news_item_id, symbol, market, direction,
      confidence, suggested_position_pct, reasoning, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    data.newsItemId,
    data.symbol,
    data.market,
    data.direction,
    data.confidence,
    data.suggestedPositionPct,
    data.reasoning,
    data.expiresAt,
  ]);
  if (!result) throw new Error('Failed to create signal');
  return result;
}

export async function getSignal(signalId: string): Promise<Signal | null> {
  return queryOne<Signal>(`
    SELECT * FROM signals WHERE id = $1
  `, [signalId]);
}

export async function updateSignalStatus(signalId: string, status: string): Promise<void> {
  await query(`
    UPDATE signals SET status = $1 WHERE id = $2
  `, [status, signalId]);
}

// ==================== 信号推送相关 ====================

export async function createDelivery(data: Partial<SignalDelivery>): Promise<SignalDelivery> {
  const result = await queryOne<SignalDelivery>(`
    INSERT INTO signal_deliveries (
      signal_id, user_id, discord_message_id, discord_channel_id,
      risk_check_result, status
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    data.signalId,
    data.userId,
    data.discordMessageId,
    data.discordChannelId,
    JSON.stringify(data.riskCheckResult),
    data.status || 'pending',
  ]);
  if (!result) throw new Error('Failed to create delivery');
  return result;
}

export async function getDelivery(deliveryId: string): Promise<SignalDelivery | null> {
  return queryOne<SignalDelivery>(`
    SELECT * FROM signal_deliveries WHERE id = $1
  `, [deliveryId]);
}

export async function updateDeliveryStatus(
  deliveryId: string,
  status: string,
  extra?: any
): Promise<void> {
  const fields = ['status = $1'];
  const values: any[] = [status];
  let paramIndex = 2;

  if (extra?.confirmedAt) {
    fields.push(`confirmed_at = $${paramIndex++}`);
    values.push(extra.confirmedAt);
  }
  if (extra?.ignoredAt) {
    fields.push(`ignored_at = $${paramIndex++}`);
    values.push(extra.ignoredAt);
  }
  if (extra?.expiredAt) {
    fields.push(`expired_at = $${paramIndex++}`);
    values.push(extra.expiredAt);
  }
  if (extra?.overrideRiskWarning !== undefined) {
    fields.push(`override_risk_warning = $${paramIndex++}`);
    values.push(extra.overrideRiskWarning);
  }
  if (extra?.overrideRiskWarningAt) {
    fields.push(`override_risk_warning_at = $${paramIndex++}`);
    values.push(extra.overrideRiskWarningAt);
  }

  values.push(deliveryId);
  await query(`
    UPDATE signal_deliveries SET ${fields.join(', ')} WHERE id = $${paramIndex}
  `, values);
}

// ==================== 订单相关 ====================

export async function createOrder(data: Partial<Order>): Promise<Order> {
  const result = await queryOne<Order>(`
    INSERT INTO orders (
      delivery_id, user_id, broker, symbol, market, direction,
      quantity, reference_price, pre_order_risk_check
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    data.deliveryId,
    data.userId,
    data.broker,
    data.symbol,
    data.market,
    data.direction,
    data.quantity,
    data.referencePrice,
    data.preOrderRiskCheck ? JSON.stringify(data.preOrderRiskCheck) : null,
  ]);
  if (!result) throw new Error('Failed to create order');
  return result;
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  extra?: any
): Promise<void> {
  const fields = ['status = $1', 'updated_at = NOW()'];
  const values: any[] = [status];
  let paramIndex = 2;

  if (extra?.executedPrice !== undefined) {
    fields.push(`executed_price = $${paramIndex++}`);
    values.push(extra.executedPrice);
  }
  if (extra?.brokerOrderId) {
    fields.push(`broker_order_id = $${paramIndex++}`);
    values.push(extra.brokerOrderId);
  }
  if (extra?.failureType) {
    fields.push(`failure_type = $${paramIndex++}`);
    values.push(extra.failureType);
  }
  if (extra?.failureMessage) {
    fields.push(`failure_message = $${paramIndex++}`);
    values.push(extra.failureMessage);
  }

  values.push(orderId);
  await query(`
    UPDATE orders SET ${fields.join(', ')} WHERE id = $${paramIndex}
  `, values);
}

export async function updateOrderRetryCount(orderId: string, retryCount: number): Promise<void> {
  await query(`
    UPDATE orders SET retry_count = $1, updated_at = NOW() WHERE id = $2
  `, [retryCount, orderId]);
}

// ==================== 风控日志相关 ====================

export async function logRiskOverride(data: {
  userId: string;
  deliveryId: string;
  overrideType: string;
  originalRiskStatus?: string;
  riskSnapshot: any;
}): Promise<void> {
  await query(`
    INSERT INTO risk_override_logs (
      user_id, delivery_id, override_type, original_risk_status, risk_snapshot
    ) VALUES ($1, $2, $3, $4, $5)
  `, [
    data.userId,
    data.deliveryId,
    data.overrideType,
    data.originalRiskStatus,
    JSON.stringify(data.riskSnapshot),
  ]);
}

