// v13 兼容：移除按钮相关
import { SignalDelivery, Signal, RiskCheckResult } from '../../models/signal';
import { User } from '../../models/user';
import { AccountSnapshot } from '../../models/position';
import { createOrder, updateDeliveryStatus, updateOrderStatus, updateOrderRetryCount } from '../../db/queries';
import { invalidatePositionCache } from '../../services/futu/position';
import { executeFutuOrder } from '../../services/futu/order';
import { executeLongbridgeOrder } from '../../services/longbridge/order';
import { invalidateLongbridgeCache } from '../../services/longbridge/position';
import { config } from '../../config';
import { editMessage } from '../../services/discord/bot';
import { getUSStockPrice } from '../../services/news/sources/us-stock';
import { getHKStockPrice } from '../../services/news/sources/hk-stock';
import { getAStockPrice } from '../../services/news/sources/a-stock';
import { getBTCPrice } from '../../services/news/sources/btc';
import { logger } from '../../utils/logger';

const MAX_RETRYABLE_ATTEMPTS = 3;

// ==================== 主函数 ====================

/**
 * Steps 6-11: 计算下单数量、获取参考价格、创建订单记录、执行下单（含重试）、
 * 处理成功/失败状态，并向 Discord 发送通知。
 *
 * 调用方必须已完成风控验证（Steps 1-5），并保证 riskCheck.status !== 'blocked'。
 */
export async function stepExecuteOrder(
  user: User,
  signal: Signal,
  delivery: SignalDelivery,
  liveSnapshot: AccountSnapshot,
  riskCheck: RiskCheckResult
): Promise<void> {
  // Step 6: 计算下单数量
  const positionPct = delivery.adjustedPositionPct ?? signal.suggestedPositionPct;
  const quantity = Math.floor(liveSnapshot.totalAssets * (positionPct / 100) / 100);

  // Step 7: 获取实时参考价格并创建订单记录
  const referencePrice = await fetchReferencePrice(signal.symbol, signal.market);
  const order = await createOrder({
    deliveryId: delivery.id,
    userId: user.id,
    broker: config.PREFERRED_BROKER,
    symbol: signal.symbol,
    market: signal.market,
    direction: signal.direction === 'long' ? 'buy' : 'sell',
    quantity,
    referencePrice,
    preOrderRiskCheck: riskCheck,
  });

  logger.info(`Order created: ${order.id}`);

  // Step 8: 执行下单（按 PREFERRED_BROKER 路由），可重试错误自动重试
  const executeBrokerOrder = (o: typeof order) =>
    config.PREFERRED_BROKER === 'longbridge'
      ? executeLongbridgeOrder(user, o)
      : executeFutuOrder(user, o);

  let result = await executeBrokerOrder(order);
  let retryCount = 0;

  while (
    !result.success &&
    result.failureType === 'retryable' &&
    retryCount < MAX_RETRYABLE_ATTEMPTS
  ) {
    retryCount += 1;
    await updateOrderRetryCount(order.id, retryCount);
    await notifyOrderRetry(delivery, order.id, retryCount, MAX_RETRYABLE_ATTEMPTS, result.failureMessage);

    const delayMs = Math.pow(2, retryCount) * 1000;
    await sleep(delayMs);
    result = await executeBrokerOrder(order);
  }

  // Step 9: 失败处理
  if (!result.success) {
    await updateOrderStatus(order.id, 'failed', {
      failureType: result.failureType,
      failureMessage: result.failureMessage,
    });
    await updateDeliveryStatus(delivery.id, 'order_failed');
    await notifyOrderFailed(delivery, order.id, result.failureType, result.failureMessage);
    logger.warn(`Order failed: ${order.id}, reason=${result.failureMessage}`);
    throw new Error(`Order ${order.id} failed: ${result.failureMessage ?? 'unknown'}`);
  }

  // Step 10: 成功处理
  const status = result.orderStatus ?? 'submitted';
  await updateOrderStatus(order.id, status, {
    executedPrice: result.executedPrice,
    brokerOrderId: result.brokerOrderId,
    failureMessage: result.deepLink ? `deep_link=${result.deepLink}` : undefined,
  });

  if (status === 'filled' || status === 'partial_filled') {
    await updateDeliveryStatus(delivery.id, 'completed');
  } else {
    await updateDeliveryStatus(delivery.id, 'order_placed');
  }

  // Step 11: 自动下单成交后清除缓存；手动模式无需刷新仓位缓存
  if (result.mode === 'A' && (status === 'filled' || status === 'partial_filled')) {
    if (config.PREFERRED_BROKER === 'longbridge') {
      await invalidateLongbridgeCache(user.id);
    } else {
      await invalidatePositionCache(user.id, 'futu');
    }
  }

  await notifyOrderSucceeded(delivery, order.id, status, result.executedPrice, result.deepLink);
  logger.info(`Order completed: ${order.id}, mode=${result.mode}, status=${status}`);
}

// ==================== 导出的通知函数 ====================

export async function notifyOrderRetry(
  delivery: SignalDelivery,
  orderId: string,
  retryCount: number,
  maxRetries: number,
  reason?: string
): Promise<void> {
  try {
    const ref = getDeliveryMessageRef(delivery);
    if (!ref) return;

    await editMessage(ref.channelId, ref.messageId, {
      content: `⏳ 订单正在自动重试（${retryCount}/${maxRetries}）\n订单ID: ${orderId}\n原因: ${reason ?? '网络或服务暂时不可用'}`,
      components: [],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`notifyOrderRetry failed for order ${orderId}: ${msg}`);
  }
}

export async function notifyOrderSucceeded(
  delivery: SignalDelivery,
  orderId: string,
  status: string,
  executedPrice?: number,
  deepLink?: string
): Promise<void> {
  try {
    const ref = getDeliveryMessageRef(delivery);
    if (!ref) return;

    const detail = deepLink
      ? `请通过以下链接完成下单：\n${deepLink}`
      : `状态: ${status}${executedPrice !== undefined ? `\n成交均价: ${executedPrice}` : ''}`;

    await editMessage(ref.channelId, ref.messageId, {
      content: `✅ 订单处理成功\n订单ID: ${orderId}\n${detail}`,
      components: [],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`notifyOrderSucceeded failed for order ${orderId}: ${msg}`);
  }
}

export async function notifyOrderFailed(
  delivery: SignalDelivery,
  orderId: string,
  failureType?: string,
  reason?: string
): Promise<void> {
  try {
    const ref = getDeliveryMessageRef(delivery);
    if (!ref) return;

    // v13 兼容：移除按钮，简化消息
    await editMessage(ref.channelId, ref.messageId, {
      content: `❌ 订单处理失败\n订单ID: ${orderId}\n类型: ${failureType ?? 'system_error'}\n原因: ${reason ?? '未知错误'}\n请回复补救操作`,
      components: [],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`notifyOrderFailed failed for order ${orderId}: ${msg}`);
  }
}

// ==================== 内部辅助函数 ====================

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

async function fetchReferencePrice(symbol: string, market: string): Promise<number> {
  try {
    switch (market) {
      case 'us': {
        const price = await getUSStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'hk': {
        const price = await getHKStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'a': {
        const price = await getAStockPrice(symbol);
        if (price && price > 0) return price;
        break;
      }
      case 'btc': {
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
