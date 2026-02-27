import { Queue, Worker, Job } from 'bullmq';
import {
  getDelivery,
  getSignal,
  getUserById,
  getManualPositions,
  createOrder,
  updateDeliveryStatus,
  updateOrderStatus
} from '../db/queries';
import { logger } from '../utils/logger';
import {
  markOrderTokenProcessing,
  markOrderTokenProcessed,
  acquireDistributedLock,
  releaseDistributedLock
} from '../utils/idempotency';
import { getAccountSnapshotForOrder, invalidatePositionCache } from '../services/futu/position';
import { checkRisk } from '../services/risk/engine';

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
          // TODO: 通知用户
          return;
        }
        
        // Step 6: 计算下单数量
        const positionPct = delivery.adjustedPositionPct ?? signal.suggestedPositionPct;
        const orderValue = liveSnapshot.totalAssets * (positionPct / 100);
        const quantity = Math.floor(orderValue / 100); // 简化计算

        // Step 7: 创建订单记录
        const order = await createOrder({
          deliveryId,
          userId: user.id,
          broker: 'futu',
          symbol: signal.symbol,
          market: signal.market,
          direction: signal.direction === 'long' ? 'buy' : 'sell',
          quantity,
          referencePrice: 100, // TODO: 获取实时价格
          preOrderRiskCheck,
        });

        logger.info(`Order created: ${order.id}`);

        // Step 8: 执行下单（TODO: 实现富途API对接）
        // const result = await executeFutuOrder(user, order);

        // 模拟成功
        await updateOrderStatus(order.id, 'filled');
        await updateDeliveryStatus(deliveryId, 'completed');
        
        // 清除持仓缓存
        await invalidatePositionCache(user.id, 'futu');
        
        logger.info(`Order completed: ${order.id}`);
        
      } finally {
        await releaseDistributedLock(lockKey);
      }
      
    } finally {
      await markOrderTokenProcessed(orderToken);
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

