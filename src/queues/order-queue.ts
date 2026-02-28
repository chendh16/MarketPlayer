import { Queue, Worker, Job } from 'bullmq';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SignalDelivery } from '../models/signal';
import {
  getDelivery,
  getSignal,
  getUserById,
  getManualPositions,
  createOrder,
  updateDeliveryStatus,
  updateOrderStatus,
  updateOrderRetryCount
} from '../db/queries';
import { logger } from '../utils/logger';
import {
  markOrderTokenProcessing,
  markOrderTokenProcessed,
  resetOrderTokenProcessing,
  acquireDistributedLock,
  releaseDistributedLock
} from '../utils/idempotency';
import { getAccountSnapshotForOrder, invalidatePositionCache } from '../services/futu/position';
import { checkRisk } from '../services/risk/engine';
import { executeFutuOrder } from '../services/futu/order';
import { editMessage } from '../services/discord/bot';

const connection = {
  host: 'localhost',
  port: 6379,
};

export const orderQueue = new Queue('order-placement', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

interface OrderJobData {
  deliveryId: string;
  orderToken: string;
}

const MAX_RETRYABLE_ATTEMPTS = 3;

export const orderWorker = new Worker<OrderJobData>(
  'order-placement',
  async (job: Job<OrderJobData>) => {
    const { deliveryId, orderToken } = job.data;
    
    logger.info(`Processing order: delivery=${deliveryId}, token=${orderToken}`);
    
    // Step 1: 幂等性检查
    const canProcess = await markOrderTokenProcessing(orderToken);
    if (!canProcess) {
      logger.info(`OrderToken ${orderToken} already processed, skipping`);
      return;
    }
    
    let finalizeOrderToken = true;
    try {
      // Step 2: 获取 delivery 信息
      const delivery = await getDelivery(deliveryId);

      if (!delivery || delivery.status !== 'confirmed') {
        logger.warn(`Delivery ${deliveryId} is not in confirmed status`);
        return;
      }

      const signal = await getSignal(delivery.signalId);
      const user = await getUserById(delivery.userId);
      
      if (!signal || !user) {
        logger.error(`Signal or user not found for delivery ${deliveryId}`);
        return;
      }
      
      // Step 3: 分布式锁（用户维度）
      const lockKey = `lock:order:${delivery.userId}`;
      const lockAcquired = await acquireDistributedLock(lockKey, 10);

      if (!lockAcquired) {
        logger.info(`Lock not acquired for user ${delivery.userId}, retrying...`);
        finalizeOrderToken = false;
        await resetOrderTokenProcessing(orderToken);
        await orderQueue.add('place-order', job.data, { delay: 3000 });
        return;
      }
      
      try {
        // Step 4: 下单前二次实时拉取持仓
        const liveSnapshot = await getAccountSnapshotForOrder(user.id, 'futu');
        
        // Step 5: 二次风控验证
        const manualPositions = await getManualPositions(user.id);
        
        const preOrderRiskCheck = await checkRisk({
          user,
          symbol: signal.symbol,
          market: signal.market,
          suggestedPositionPct: delivery.adjustedPositionPct ?? signal.suggestedPositionPct,
          accountSnapshot: liveSnapshot,
          manualPositions,
        });

        // 二次验证不通过
        if (preOrderRiskCheck.status === 'blocked') {
          await updateDeliveryStatus(deliveryId, 'order_failed');
          logger.warn(`Order blocked by pre-order risk check: ${deliveryId}`);

          const ref = getDeliveryMessageRef(delivery);
          if (ref) {
            const reasons = preOrderRiskCheck.blockReasons.length > 0
              ? preOrderRiskCheck.blockReasons.map(r => `• ${r}`).join('\n')
              : '持仓已超过风控限额';
            await editMessage(ref.channelId, ref.messageId, {
              content: `🚫 **下单已被风控阻止**\n${reasons}\n\n请调整持仓后再试，或联系管理员。`,
              components: [],
            });
          }
          return;
        }
        
        // Step 6: 计算下单数量
        const positionPct = delivery.adjustedPositionPct ?? signal.suggestedPositionPct;
        const orderValue = liveSnapshot.totalAssets * (positionPct / 100);
        const quantity = Math.floor(orderValue / 100); // 简化计算

        // Step 7: 获取实时参考价格并创建订单记录
        const referencePrice = await fetchReferencePrice(signal.symbol, signal.market);
        const order = await createOrder({
          deliveryId,
          userId: user.id,
          broker: 'futu',
          symbol: signal.symbol,
          market: signal.market,
          direction: signal.direction === 'long' ? 'buy' : 'sell',
          quantity,
          referencePrice,
          preOrderRiskCheck,
        });

        logger.info(`Order created: ${order.id}`);

        // Step 8: 执行下单（按 FUTU_ORDER_MODE 路由），可重试错误自动重试
        let result = await executeFutuOrder(user, order);
        let retryCount = 0;

        while (!result.success && result.failureType === 'retryable' && retryCount < MAX_RETRYABLE_ATTEMPTS) {
          retryCount += 1;
          await updateOrderRetryCount(order.id, retryCount);
          await notifyOrderRetry(delivery, order.id, retryCount, MAX_RETRYABLE_ATTEMPTS, result.failureMessage);

          const delayMs = Math.pow(2, retryCount) * 1000;
          await sleep(delayMs);
          result = await executeFutuOrder(user, order);
        }

        if (!result.success) {
          await updateOrderStatus(order.id, 'failed', {
            failureType: result.failureType,
            failureMessage: result.failureMessage,
          });
          await updateDeliveryStatus(deliveryId, 'order_failed');
          await notifyOrderFailed(delivery, order.id, result.failureType, result.failureMessage);
          logger.warn(`Order failed: ${order.id}, reason=${result.failureMessage}`);
          return;
        }

        const status = result.orderStatus ?? 'submitted';
        await updateOrderStatus(order.id, status, {
          executedPrice: result.executedPrice,
          brokerOrderId: result.brokerOrderId,
          failureMessage: result.deepLink ? `deep_link=${result.deepLink}` : undefined,
        });
        if (status === 'filled' || status === 'partial_filled') {
          await updateDeliveryStatus(deliveryId, 'completed');
        } else {
          await updateDeliveryStatus(deliveryId, 'order_placed');
        }

        // 自动下单成交后清除缓存；手动模式无需刷新仓位缓存
        if (result.mode === 'A' && (status === 'filled' || status === 'partial_filled')) {
          await invalidatePositionCache(user.id, 'futu');
        }

        await notifyOrderSucceeded(delivery, order.id, status, result.executedPrice, result.deepLink);
        logger.info(`Order completed: ${order.id}, mode=${result.mode}, status=${status}`);
        
      } finally {
        await releaseDistributedLock(lockKey);
      }
      
    } finally {
      if (finalizeOrderToken) {
        await markOrderTokenProcessed(orderToken);
      }
    }
  },
  { connection, concurrency: 5 }
);

orderWorker.on('completed', (job) => {
  logger.info(`Order job ${job.id} completed`);
});

orderWorker.on('failed', (job, err) => {
  logger.error(`Order job ${job?.id} failed:`, err);
});

async function fetchReferencePrice(symbol: string, market: string): Promise<number> {
  try {
    switch (market) {
      case 'us': {
        const { getUSStockPrice } = await import('../services/news/sources/us-stock');
        const price = await getUSStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'hk': {
        const { getHKStockPrice } = await import('../services/news/sources/hk-stock');
        const price = await getHKStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'a': {
        const { getAStockPrice } = await import('../services/news/sources/a-stock');
        const price = await getAStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'btc': {
        const { getBTCPrice } = await import('../services/news/sources/btc');
        const price = await getBTCPrice();
        if (price && price > 0) return price;
        break;
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch reference price for ${symbol} (${market}): ${msg}`);
  }
  logger.warn(`Falling back to 0 for reference price of ${symbol}, Futu will use market price`);
  return 0;
}

async function notifyOrderRetry(
  delivery: SignalDelivery,
  orderId: string,
  retryCount: number,
  maxRetries: number,
  reason?: string
): Promise<void> {
  const ref = getDeliveryMessageRef(delivery);
  if (!ref) return;

  await editMessage(ref.channelId, ref.messageId, {
    content: `⏳ 订单正在自动重试（${retryCount}/${maxRetries}）\n订单ID: ${orderId}\n原因: ${reason ?? '网络或服务暂时不可用'}`,
    components: [],
  });
}

async function notifyOrderSucceeded(
  delivery: SignalDelivery,
  orderId: string,
  status: string,
  executedPrice?: number,
  deepLink?: string
): Promise<void> {
  const ref = getDeliveryMessageRef(delivery);
  if (!ref) return;

  const detail = deepLink
    ? `请通过以下链接完成下单：\n${deepLink}`
    : `状态: ${status}${executedPrice !== undefined ? `\n成交均价: ${executedPrice}` : ''}`;

  await editMessage(ref.channelId, ref.messageId, {
    content: `✅ 订单处理成功\n订单ID: ${orderId}\n${detail}`,
    components: [],
  });
}

async function notifyOrderFailed(
  delivery: SignalDelivery,
  orderId: string,
  failureType?: string,
  reason?: string
): Promise<void> {
  const ref = getDeliveryMessageRef(delivery);
  if (!ref) return;

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`retry_order:${delivery.id}:${delivery.orderToken}`)
      .setLabel('🔁 重试下单')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`abandon:${delivery.id}:${delivery.orderToken}`)
      .setLabel('❌ 放弃')
      .setStyle(ButtonStyle.Secondary),
  );

  if (failureType === 'price_deviation') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:${delivery.id}:${delivery.orderToken}`)
        .setLabel('✅ 按市价再试')
        .setStyle(ButtonStyle.Success),
    );
  }

  if (failureType === 'insufficient_funds') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`adjust:${delivery.id}:${delivery.orderToken}`)
        .setLabel('✏️ 调整仓位后确认')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  await editMessage(ref.channelId, ref.messageId, {
    content: `❌ 订单处理失败\n订单ID: ${orderId}\n类型: ${failureType ?? 'system_error'}\n原因: ${reason ?? '未知错误'}\n请选择补救操作：`,
    components: [row],
  });
}

function getDeliveryMessageRef(
  delivery: SignalDelivery & { discord_channel_id?: string; discord_message_id?: string }
): { channelId: string; messageId: string } | null {
  const channelId = String(delivery.discordChannelId ?? delivery.discord_channel_id ?? '');
  const messageId = String(delivery.discordMessageId ?? delivery.discord_message_id ?? '');
  if (!channelId || !messageId) return null;
  return { channelId, messageId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
