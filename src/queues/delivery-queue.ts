/**
 * DeliveryQueue — 每个用户推送作为独立 BullMQ job，互不干扰。
 *
 * 改进自 news-queue.ts 中的 pushSignalToUsers()：
 * 原来：串行 for 循环，某用户失败会导致后续用户跳过重试次数的机会。
 * 现在：每用户一个 job，独立 attempts=3 + 指数退避，失败隔离。
 *
 * 兼容性保证：
 * - 不修改 signal_deliveries.status 的更新逻辑（confirm/ignore 路径不变）
 * - confirm_order MCP 工具通过 orderQueue 执行，不受此队列影响
 */
import { Queue, Worker, Job } from 'bullmq';
import {
  getSignal,
  getUserById,
  getManualPositions,
  createSignalDelivery,
  updateSignalDelivery,
} from '../db/queries';
import { pushSignalToUser, pushNewsOnlyToUser } from '../services/notification/pusher';
import { checkRisk } from '../services/risk/engine';
import { getAccountSnapshot } from '../services/futu/position';
import { AnalysisResult } from '../services/ai/analyzer';
import { getNewsItem } from '../db/queries';
import { logger } from '../utils/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

function parseRedisConnection(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined };
}

const connection = parseRedisConnection(config.REDIS_URL);

// ─── 推送任务数据结构 ──────────────────────────────────────────────────────────

interface SignalDeliveryJobData {
  type: 'signal';
  signalId: string;
  userId: string;
}

interface NewsOnlyDeliveryJobData {
  type: 'news-only';
  newsItemId: string;
  userId: string;
  analysis: AnalysisResult;
}

type DeliveryJobData = SignalDeliveryJobData | NewsOnlyDeliveryJobData;

// ─── 队列定义 ──────────────────────────────────────────────────────────────────

export const deliveryQueue = new Queue<DeliveryJobData>('signal-delivery', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

// ─── 辅助：将信号推送拆分为每用户独立 job ─────────────────────────────────────

export async function enqueueSignalDeliveries(signalId: string, userIds: string[]): Promise<void> {
  const jobs = userIds.map((userId) => ({
    name: 'push',
    data: { type: 'signal' as const, signalId, userId },
  }));
  if (jobs.length > 0) {
    await deliveryQueue.addBulk(jobs);
    logger.info(`Enqueued ${jobs.length} signal delivery jobs for signal ${signalId}`);
  }
}

export async function enqueueNewsOnlyDeliveries(
  newsItemId: string,
  userIds: string[],
  analysis: AnalysisResult,
): Promise<void> {
  const jobs = userIds.map((userId) => ({
    name: 'push',
    data: { type: 'news-only' as const, newsItemId, userId, analysis },
  }));
  if (jobs.length > 0) {
    await deliveryQueue.addBulk(jobs);
    logger.info(`Enqueued ${jobs.length} news-only delivery jobs for news ${newsItemId}`);
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const deliveryWorker = new Worker<DeliveryJobData>(
  'signal-delivery',
  async (job: Job<DeliveryJobData>) => {
    const { type, userId } = job.data;

    const fullUser = await getUserById(userId);
    if (!fullUser) {
      logger.warn(`deliveryQueue: user ${userId} not found, skipping`);
      return;
    }

    if (type === 'signal') {
      const { signalId } = job.data as SignalDeliveryJobData;
      const signal = await getSignal(signalId);
      if (!signal) throw new Error(`Signal ${signalId} not found`);

      const accountSnapshot = await getAccountSnapshot(userId, config.PREFERRED_BROKER);
      const manualPositions = await getManualPositions(userId);

      const riskCheck = await checkRisk({
        user: fullUser,
        symbol: signal.symbol,
        market: signal.market,
        suggestedPositionPct: signal.suggestedPositionPct,
        accountSnapshot,
        manualPositions,
      });

      if (riskCheck.status === 'blocked') {
        logger.warn(`Signal ${signalId} blocked by risk check for user ${userId}`);
        return;
      }

      const orderToken = uuidv4();
      const delivery = await createSignalDelivery({
        signalId: signal.id,
        userId,
        orderToken,
        riskCheckResult: riskCheck,
        sentAt: new Date(),
      });

      if (!delivery) {
        throw new Error(`Failed to create delivery for user ${userId}`);
      }

      const pushResult = await pushSignalToUser(fullUser, signal, delivery, riskCheck, accountSnapshot);

      const updateData: Record<string, unknown> = { status: 'pending' };
      if (pushResult.discord) {
        updateData.discordMessageId = pushResult.discord.messageId;
        updateData.discordChannelId = pushResult.discord.channelId;
      }
      if (pushResult.feishu) {
        updateData.feishuMessageId = pushResult.feishu.messageId;
      }

      if (pushResult.discord || pushResult.feishu) {
        await updateSignalDelivery(delivery.id, updateData);
        logger.info(`Signal ${signalId} delivered to user ${userId}`);
      } else {
        throw new Error(`Push failed for signal ${signalId} user ${userId} on all channels`);
      }

    } else if (type === 'news-only') {
      const { newsItemId, analysis } = job.data as NewsOnlyDeliveryJobData;
      const newsItem = await getNewsItem(newsItemId);
      if (!newsItem) throw new Error(`NewsItem ${newsItemId} not found`);
      await pushNewsOnlyToUser(fullUser, newsItem, analysis);
      logger.info(`News-only delivered to user ${userId} for item ${newsItemId}`);
    }
  },
  { connection, concurrency: 5 },
);

deliveryWorker.on('completed', (job) => {
  logger.info(`Delivery job ${job.id} completed`);
});

deliveryWorker.on('failed', (job, err) => {
  logger.error(`Delivery job ${job?.id} failed:`, err);
});
