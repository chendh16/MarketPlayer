# 09 — 建议生命周期状态机

---

## 状态转换图

```
[generated]
    ↓ 推送给用户
[pending]
    ├── 超时15分钟 ──────────────────→ [expired]
    ├── 用户点击忽略 ───────────────→ [ignored]
    └── 用户点击确认
            ↓
       [confirmed]
            ↓ 进入下单队列
       [order_placing] ← 内部状态
            ├── 下单失败
            │       ├── 可重试（< 3次）→ 重试 → [order_placing]
            │       └── 不可恢复 ──────→ [order_failed]
            └── 下单成功
                    ↓
              [completed]
```

---

## 状态机实现

```typescript
// src/state/signal-machine.ts

export type DeliveryStatus =
  | 'pending'        // 已推送，等待用户操作
  | 'confirmed'      // 用户已确认，等待下单
  | 'ignored'        // 用户忽略
  | 'expired'        // 超过15分钟未确认
  | 'order_placing'  // 下单进行中
  | 'order_failed'   // 下单失败（无法恢复）
  | 'completed';     // 下单成功完成

// 合法的状态转换表
const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending:        ['confirmed', 'ignored', 'expired'],
  confirmed:      ['order_placing'],
  ignored:        [],                    // 终态
  expired:        [],                    // 终态
  order_placing:  ['order_failed', 'completed', 'order_placing'], // placing→placing = 重试
  order_failed:   [],                    // 终态
  completed:      [],                    // 终态
};

export async function transitionDeliveryStatus(
  deliveryId: string,
  newStatus: DeliveryStatus,
  metadata?: Record<string, any>
): Promise<void> {
  const delivery = await getDelivery(deliveryId);

  if (!delivery) throw new Error(`Delivery ${deliveryId} not found`);

  // 验证状态转换合法性
  const allowed = VALID_TRANSITIONS[delivery.status as DeliveryStatus];
  if (!allowed.includes(newStatus)) {
    throw new InvalidTransitionError(
      `Cannot transition from ${delivery.status} to ${newStatus}`
    );
  }

  // 构建更新字段
  const updates: Record<string, any> = {
    status: newStatus,
    updated_at: new Date(),
    ...metadata,
  };

  // 为特定状态设置时间戳
  if (newStatus === 'confirmed') updates.confirmed_at = new Date();
  if (newStatus === 'ignored') updates.ignored_at = new Date();
  if (newStatus === 'expired') updates.expired_at = new Date();

  // 持久化到 PostgreSQL（不存内存）
  await db.query(
    `UPDATE signal_deliveries SET ${buildSetClause(updates)} WHERE id = $1`,
    [...Object.values(updates), deliveryId]
  );

  // 记录转换日志（审计）
  console.log(`Delivery ${deliveryId}: ${delivery.status} → ${newStatus}`, metadata);
}

// 快捷方法
export const updateDeliveryStatus = transitionDeliveryStatus;
```

---

## 有效期检查

```typescript
// src/state/signal-machine.ts（续）

const DELIVERY_TTL_MS = 15 * 60 * 1000; // 15分钟

export function isExpired(delivery: SignalDelivery): boolean {
  if (delivery.status !== 'pending') return false;
  return Date.now() - delivery.sentAt.getTime() > DELIVERY_TTL_MS;
}

export function getRemainingSeconds(delivery: SignalDelivery): number {
  const elapsed = Date.now() - delivery.sentAt.getTime();
  return Math.max(0, Math.floor((DELIVERY_TTL_MS - elapsed) / 1000));
}
```

---

## 服务重启恢复

```typescript
// 服务重启时，从 PostgreSQL 恢复进行中的状态
// 这是状态必须持久化到数据库的核心原因

export async function recoverInFlightDeliveries(): Promise<void> {
  console.log('Recovering in-flight deliveries after restart...');

  // 1. 找出所有 confirmed 但还没进入下单流程的
  const stuckConfirmed = await db.query<SignalDelivery>(`
    SELECT sd.* FROM signal_deliveries sd
    WHERE sd.status = 'confirmed'
      AND sd.confirmed_at < NOW() - INTERVAL '30 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.delivery_id = sd.id
      )
  `);

  for (const delivery of stuckConfirmed) {
    console.log(`Re-queuing stuck delivery: ${delivery.id}`);
    await orderQueue.add('place-order', {
      deliveryId: delivery.id,
      orderToken: delivery.orderToken,
    });
  }

  // 2. 找出所有 pending 且已过期的（服务宕机期间过期）
  const expiredPending = await db.query<SignalDelivery>(`
    SELECT * FROM signal_deliveries
    WHERE status = 'pending'
      AND sent_at < NOW() - INTERVAL '15 minutes'
  `);

  for (const delivery of expiredPending) {
    await transitionDeliveryStatus(delivery.id, 'expired', { expiredAt: new Date() });
    // 编辑 Discord 消息为失效状态
    if (delivery.discordMessageId && delivery.discordChannelId) {
      await editMessage(
        delivery.discordChannelId,
        delivery.discordMessageId,
        buildExpiredMessage()
      );
    }
  }

  console.log(`Recovery complete: ${stuckConfirmed.length} re-queued, ${expiredPending.length} expired`);
}
```

---

## 完整业务流程代码

```typescript
// src/services/signal-delivery.ts
// 将所有层整合为一个完整的信号推送流程

export async function deliverSignalToUser(
  signal: Signal,
  userId: string
): Promise<void> {

  // Step 1: 检查用户日推送上限
  try {
    await checkUserDailyLimit(userId);
  } catch (e) {
    console.log(`User ${userId} daily limit reached, skipping`);
    return;
  }

  // Step 2: 获取持仓快照（缓存）
  const accountSnapshot = await getAccountSnapshot(userId, 'futu');
  const manualPositions = await getManualPositions(userId);
  const user = await getUser(userId);

  // Step 3: 风控检查
  const riskCheck = await checkRisk({
    user, symbol: signal.symbol, market: signal.market,
    suggestedPositionPct: signal.suggestedPositionPct,
    accountSnapshot, manualPositions,
  });

  // Step 4: 创建 delivery 记录（持久化）
  const delivery = await createDelivery({
    signalId: signal.id,
    userId,
    orderToken: generateUUID(),
    riskCheckResult: riskCheck,
    status: 'pending',
    sentAt: new Date(),
  });

  // Step 5: 根据风控结果和市场状态选择消息类型
  const isOpen = isMarketOpen(signal.market as any);
  let message: any;

  if (!isOpen) {
    // 非交易时段：仅推资讯解读
    const newsItem = await getNewsItem(signal.newsItemId!);
    const analysis = { summary: newsItem.aiSummary!, impact: newsItem.aiImpactAnalysis! };
    message = buildClosedMarketMessage(newsItem, analysis as any);
  } else if (riskCheck.status === 'blocked') {
    message = buildBlockedSignalMessage(signal, delivery, riskCheck);
  } else if (riskCheck.status === 'warning') {
    message = buildWarningSignalMessage(signal, delivery, riskCheck);
  } else if (signal.market === 'a') {
    message = buildAStockSignalMessage(signal, delivery, riskCheck);
  } else {
    message = buildNormalSignalMessage(signal, delivery, riskCheck, accountSnapshot);
  }

  // Step 6: 推送到 Discord
  const discordUser = await getUserDiscordId(userId);
  const messageId = await sendSignalToUser(discordUser, message);

  // Step 7: 保存消息 ID（用于后续编辑消息状态）
  if (messageId) {
    await updateDelivery(delivery.id, {
      discordMessageId: messageId,
      discordChannelId: await getDMChannelId(discordUser),
    });
  }
}
```
