# 06 — 下单执行层

---

## 核心原则

1. **人工确认永不可绕过** — 只有 `delivery.status === 'confirmed'` 才执行下单
2. **幂等性** — 同一 `orderToken` 只处理一次，用 Redis 去重
3. **下单前二次风控** — 实时拉取最新持仓，重新检查，不用缓存
4. **分布式锁** — 同一用户同一时刻只允许一个下单请求进行

---

## 下单队列 Worker

```typescript
// src/queues/order-queue.ts
import { Worker } from 'bullmq';

export const orderWorker = new Worker('order-placement', async (job) => {
  const { deliveryId, orderToken } = job.data;

  // ── Step 1: 幂等性检查 ──
  const tokenKey = `order:token:${orderToken}`;
  const alreadyProcessed = await redis.get(tokenKey);
  if (alreadyProcessed) {
    console.log(`OrderToken ${orderToken} already processed, skipping`);
    return;
  }
  // 标记为处理中（3分钟过期防死锁）
  await redis.setEx(tokenKey, 180, 'processing');

  // ── Step 2: 获取 delivery 信息 ──
  const delivery = await getDelivery(deliveryId);
  if (!delivery || delivery.status !== 'confirmed') {
    console.warn(`Delivery ${deliveryId} is not in confirmed status`);
    return;
  }

  const signal = await getSignal(delivery.signalId);
  const user = await getUser(delivery.userId);

  // ── Step 3: 分布式锁（用户维度，防并发重复下单） ──
  const lockKey = `lock:order:${delivery.userId}`;
  const lockAcquired = await redis.set(lockKey, '1', { NX: true, EX: 10 });
  if (!lockAcquired) {
    // 等待后重试
    await orderQueue.add('place-order', job.data, { delay: 3000 });
    return;
  }

  try {
    // ── Step 4: 下单前二次实时拉取持仓 ──
    const liveSnapshot = await getAccountSnapshotForOrder(user.id, 'futu');

    // ── Step 5: 二次风控验证 ──
    const manualPositions = await getManualPositions(user.id);
    const preOrderRiskCheck = await checkRisk({
      user,
      symbol: signal.symbol,
      market: signal.market,
      suggestedPositionPct: delivery.adjustedPositionPct ?? signal.suggestedPositionPct,
      accountSnapshot: liveSnapshot,
      manualPositions,
    });

    // 二次验证不通过 → 通知用户，不执行下单
    if (preOrderRiskCheck.status === 'blocked') {
      await updateDeliveryStatus(deliveryId, 'order_failed');
      await notifyUser(delivery, `🚫 下单前风控再次拦截：${preOrderRiskCheck.blockReasons.join('；')}`);
      return;
    }

    // ── Step 6: 计算下单数量 ──
    const positionPct = delivery.adjustedPositionPct ?? signal.suggestedPositionPct;
    const orderValue = liveSnapshot.totalAssets * (positionPct / 100);
    const quantity = await calculateQuantity(signal.symbol, signal.market, orderValue);

    // ── Step 7: 执行下单 ──
    const orderRecord = await createOrder({
      deliveryId,
      userId: user.id,
      broker: 'futu',
      symbol: signal.symbol,
      market: signal.market,
      direction: signal.direction === 'long' ? 'buy' : 'sell',
      quantity,
      referencePrice: await getCurrentPrice(signal.symbol, signal.market),
      preOrderRiskCheck,
    });

    const result = await executeFutuOrder(user, orderRecord);

    // ── Step 8: 处理结果 ──
    if (result.success) {
      await updateOrderStatus(orderRecord.id, 'filled', {
        executedPrice: result.executedPrice,
        brokerOrderId: result.brokerOrderId,
      });
      await updateDeliveryStatus(deliveryId, 'completed');
      await invalidatePositionCache(user.id, 'futu'); // 立即清缓存
      await notifyOrderSuccess(delivery, result);
    } else {
      await handleOrderFailure(orderRecord, result, delivery);
    }

  } finally {
    // 释放分布式锁
    await redis.del(lockKey);
    // 标记 token 为已完成
    await redis.setEx(tokenKey, 86400, 'processed');
  }

}, { connection: redisConnection, concurrency: 5 });
```

---

## 富途下单执行

```typescript
// src/services/futu/order.ts

export interface FutuOrderResult {
  success: boolean;
  brokerOrderId?: string;
  executedPrice?: number;
  executedQty?: number;
  failureType?: 'retryable' | 'price_deviation' | 'insufficient_funds' | 'system_error';
  failureMessage?: string;
}

// 方案A：全自动下单（需要富途交易级API权限）
export async function executeFutuOrderPlanA(
  user: User,
  order: Order
): Promise<FutuOrderResult> {
  const futuConn = await getFutuConnection(user.id);

  try {
    // 使用限价单，参考价上下 1% 浮动
    const price = order.referencePrice! * (order.direction === 'buy' ? 1.01 : 0.99);

    const result = await futuConn.placeOrder({
      code: order.symbol,
      market: mapMarket(order.market),
      trdSide: order.direction === 'buy' ? 'BUY' : 'SELL',
      orderType: 'LIMIT',
      qty: order.quantity,
      price: roundPrice(price, order.symbol),
    });

    return {
      success: true,
      brokerOrderId: String(result.orderId),
      executedPrice: result.price,
    };

  } catch (err: any) {
    return classifyFutuError(err);
  }
}

// 方案B：生成富途深链接（MVP 默认方案）
export async function executeFutuOrderPlanB(
  order: Order
): Promise<{ deepLink: string }> {
  // 生成富途 App 深链接，跳转到预填写的下单页面
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

// 下单失败分类
function classifyFutuError(err: any): FutuOrderResult {
  const message = err.message ?? '';

  if (message.includes('network') || message.includes('timeout')) {
    return { success: false, failureType: 'retryable', failureMessage: message };
  }
  if (message.includes('price') || message.includes('deviation')) {
    return { success: false, failureType: 'price_deviation', failureMessage: message };
  }
  if (message.includes('cash') || message.includes('funds') || message.includes('balance')) {
    return { success: false, failureType: 'insufficient_funds', failureMessage: message };
  }
  return { success: false, failureType: 'system_error', failureMessage: message };
}
```

---

## 下单失败处理

```typescript
// src/services/order/failure-handler.ts

export async function handleOrderFailure(
  order: Order,
  result: FutuOrderResult,
  delivery: SignalDelivery
) {
  const failureType = result.failureType ?? 'system_error';

  await updateOrderStatus(order.id, 'failed', {
    failureType,
    failureMessage: result.failureMessage,
    retryCount: order.retryCount,
  });

  switch (failureType) {

    case 'retryable':
      if (order.retryCount < 3) {
        // 自动重试，指数退避
        await orderQueue.add('place-order',
          { deliveryId: delivery.id, orderToken: delivery.orderToken },
          { delay: Math.pow(2, order.retryCount) * 2000 }
        );
        await updateOrderRetryCount(order.id, order.retryCount + 1);
        await notifyUser(delivery, `⏳ 下单网络超时，正在自动重试（第${order.retryCount + 1}次）...`);
      } else {
        // 3次后通知用户手动重试
        await updateDeliveryStatus(delivery.id, 'order_failed');
        await sendOrderFailedMessage(delivery, order, failureType);
      }
      break;

    case 'price_deviation':
      const currentPrice = await getCurrentPrice(order.symbol, order.market);
      await updateDeliveryStatus(delivery.id, 'order_failed');
      await sendOrderFailedMessage(delivery, order, failureType, currentPrice);
      break;

    case 'insufficient_funds':
      await updateDeliveryStatus(delivery.id, 'order_failed');
      await sendOrderFailedMessage(delivery, order, failureType);
      break;

    case 'system_error':
    default:
      await updateDeliveryStatus(delivery.id, 'order_failed');
      await sendSystemErrorMessage(delivery, order);
      break;
  }
}

async function sendOrderFailedMessage(
  delivery: SignalDelivery,
  order: Order,
  failureType: string,
  currentPrice?: number
) {
  const message = buildOrderFailedMessage(order, failureType, currentPrice);

  if (delivery.discordChannelId && delivery.discordMessageId) {
    await editMessage(delivery.discordChannelId, delivery.discordMessageId, message);
  }
}
```

---

## 多平台路由

```typescript
// src/services/order/router.ts

export async function routeOrder(
  user: User,
  signal: Signal
): Promise<{ broker: string; reason: string }> {
  const accounts = await getBrokerAccounts(user.id);
  const futu = accounts.find(a => a.broker === 'futu' && a.isActive);
  const longbridge = accounts.find(a => a.broker === 'longbridge' && a.isActive);

  // 只绑定一个平台
  if (futu && !longbridge) return { broker: 'futu', reason: 'only_broker' };
  if (!futu && longbridge) return { broker: 'longbridge', reason: 'only_broker' };
  if (!futu && !longbridge) throw new Error('No active broker account');

  // 同时绑定两个平台 — 查看标的在哪个平台持有
  const [futuPositions, lbPositions] = await Promise.all([
    getAccountSnapshot(user.id, 'futu'),
    getAccountSnapshot(user.id, 'longbridge'),
  ]);

  const inFutu = futuPositions.positions.some(p => p.symbol === signal.symbol);
  const inLB = lbPositions.positions.some(p => p.symbol === signal.symbol);

  if (inFutu && !inLB) return { broker: 'futu', reason: 'position_exists' };
  if (!inFutu && inLB) return { broker: 'longbridge', reason: 'position_exists' };

  // 都有或都没有 → 选可用资金更多的
  if (futuPositions.availableCash >= lbPositions.availableCash) {
    return { broker: 'futu', reason: 'more_cash' };
  }
  return { broker: 'longbridge', reason: 'more_cash' };
}
```

---

## 富途长连接管理

```typescript
// src/services/futu/connection.ts

// 每个用户对应一个独立的富途连接实例
const connectionPool = new Map<string, FutuConnection>();

export async function getFutuConnection(userId: string): Promise<FutuConnection> {
  if (connectionPool.has(userId)) {
    const conn = connectionPool.get(userId)!;
    if (conn.isConnected()) return conn;
    // 已断线，重连
    await conn.reconnect();
    return conn;
  }

  // 新建连接
  const account = await getBrokerAccount(userId, 'futu');
  const credentials = decrypt(account.encryptedCredentials);

  const conn = new FutuConnection(credentials);
  await conn.connect();

  // 断线自动重连
  conn.on('disconnect', async () => {
    console.warn(`Futu connection lost for user ${userId}, reconnecting...`);
    try {
      await conn.reconnect();
    } catch (err) {
      console.error(`Futu reconnect failed for user ${userId}`, err);
      // 通知用户降级到方案B
      await notifyFutuConnectionFailed(userId);
    }
  });

  connectionPool.set(userId, conn);
  return conn;
}

export async function initAllFutuConnections() {
  const activeUsers = await getActiveUsersWithFutu();
  for (const user of activeUsers) {
    try {
      await getFutuConnection(user.id);
    } catch (err) {
      console.error(`Failed to init Futu connection for user ${user.id}:`, err);
    }
  }
}
```
