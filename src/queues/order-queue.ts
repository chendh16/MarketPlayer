import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { config } from '../config';

function parseRedisConnection(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined };
}
import {
  markOrderTokenProcessing,
  markOrderTokenProcessed,
  resetOrderTokenProcessing,
  acquireDistributedLock,
  releaseDistributedLock
} from '../utils/idempotency';
import { stepValidateDelivery } from './steps/order-validate';
import { stepPreOrderRisk } from './steps/order-risk';
import { stepExecuteOrder } from './steps/order-execute';

const connection = parseRedisConnection(config.REDIS_URL);

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

    let finalizeOrderToken = true;
    try {
      // Step 2: 验证 delivery / signal / user
      const { delivery, signal, user } = await stepValidateDelivery(deliveryId);

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
        // Step 4-5: 风控验证（已含持仓拉取）
        const { liveSnapshot, riskCheck } = await stepPreOrderRisk(user, signal, delivery);

        // Step 6-11: 下单执行（含重试、通知、状态更新）
        await stepExecuteOrder(user, signal, delivery, liveSnapshot, riskCheck);

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

export { stepValidateDelivery } from './steps/order-validate';
export { stepPreOrderRisk, RiskStepResult } from './steps/order-risk';
export { stepExecuteOrder, notifyOrderRetry, notifyOrderSucceeded, notifyOrderFailed } from './steps/order-execute';
export {
  stepConfirmOrder, stepIgnoreDelivery, stepAbandonDelivery,
  stepAdjustAndConfirm, stepGetCopyTradeInfo,
  type ConfirmOrderResult, type IgnoreDeliveryResult, type AbandonDeliveryResult,
  type AdjustAndConfirmResult, type CopyTradeResult, type CopyTradePayload,
} from './steps/order-interact';
