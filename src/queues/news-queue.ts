import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  getNewsItem,
  updateNewsItem,
  createSignal,
  getSignal,
  getAllUsers,
  getUserById,
  getManualPositions,
  createSignalDelivery,
  updateSignalDelivery,
} from '../db/queries';
import { analyzeNewsItem, generateSignal, AnalysisResult } from '../services/ai/analyzer';
import { sendSignalToUser } from '../services/discord/bot';
import {
  buildNormalSignalMessage,
  buildWarningSignalMessage,
  buildNewsOnlyMessage,
} from '../services/discord/formatter';
import { checkRisk } from '../services/risk/engine';
import { getAccountSnapshot } from '../services/futu/position';
import { Signal, NewsItem } from '../models/signal';
import { logger } from '../utils/logger';

const connection = {
  host: 'localhost',
  port: 6379,
};

export const newsQueue = new Queue('news-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

interface NewsJobData {
  newsItemId: string;
}

// ─── 步骤1：AI 分析并写库 ───────────────────────────────────────────────────────

export async function processAnalysis(newsItemId: string): Promise<AnalysisResult> {
  try {
    const newsItem = await getNewsItem(newsItemId);

    if (!newsItem) {
      throw new Error(`News item ${newsItemId} not found`);
    }

    const analysis = await analyzeNewsItem(newsItem);

    await updateNewsItem(newsItemId, {
      aiSummary: analysis.summary,
      aiImpactAnalysis: analysis.impact,
      aiProcessed: true,
      aiProcessedAt: new Date(),
    });

    logger.info(`News item ${newsItemId} analyzed`);
    return analysis;
  } catch (error) {
    logger.error(`processAnalysis failed for newsItemId=${newsItemId}:`, error);
    throw error;
  }
}

// ─── 步骤2：生成信号并写库，返回 signalId 或 null ────────────────────────────────

export async function processSignal(
  newsItemId: string,
  analysis: AnalysisResult,
): Promise<string | null> {
  try {
    const newsItem = await getNewsItem(newsItemId);

    if (!newsItem) {
      throw new Error(`News item ${newsItemId} not found`);
    }

    const signalResult = await generateSignal(newsItem, analysis);

    if (!signalResult) {
      logger.info(
        `No signal generated for ${newsItemId} (confidence too low)`,
      );
      return null;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15分钟后
    const signal = await createSignal({
      newsItemId,
      symbol: newsItem.symbols?.[0],
      market: newsItem.market,
      direction: signalResult.direction,
      confidence: signalResult.confidence,
      suggestedPositionPct: signalResult.suggestedPositionPct,
      reasoning: signalResult.reasoning,
      expiresAt,
    });

    logger.info(`Signal created: ${signal.id}`);
    return signal.id;
  } catch (error) {
    logger.error(`processSignal failed for newsItemId=${newsItemId}:`, error);
    throw error;
  }
}

// ─── 步骤3：推送信号给所有用户 ──────────────────────────────────────────────────

export async function processDelivery(signalId: string): Promise<void> {
  try {
    const signal = await getSignal(signalId);

    if (!signal) {
      throw new Error(`Signal ${signalId} not found`);
    }

    await pushSignalToUsers(signal);
  } catch (error) {
    logger.error(`processDelivery failed for signalId=${signalId}:`, error);
    throw error;
  }
}

// ─── 步骤4（可选路径）：推送纯资讯解读给所有用户 ────────────────────────────────

export async function processNewsOnly(
  newsItemId: string,
  analysis: AnalysisResult,
): Promise<void> {
  try {
    const newsItem = await getNewsItem(newsItemId);

    if (!newsItem) {
      throw new Error(`News item ${newsItemId} not found`);
    }

    await pushNewsOnlyToUsers(newsItem, analysis);
  } catch (error) {
    logger.error(`processNewsOnly failed for newsItemId=${newsItemId}:`, error);
    throw error;
  }
}

// ─── BullMQ Worker（薄层调度，不含业务逻辑）──────────────────────────────────────

export const newsWorker = new Worker<NewsJobData>(
  'news-processing',
  async (job: Job<NewsJobData>) => {
    const { newsItemId } = job.data;

    logger.info(`Processing news item: ${newsItemId}`);

    // 步骤1：AI 分析
    const analysis = await processAnalysis(newsItemId);

    // 步骤2：生成信号
    const signalId = await processSignal(newsItemId, analysis);

    if (!signalId) {
      // 置信度不足，推送纯资讯解读
      await processNewsOnly(newsItemId, analysis);
      return;
    }

    // 步骤3：推送给所有用户
    await processDelivery(signalId);
  },
  { connection, concurrency: 3 },
);

// ─── 内部辅助：推送信号给用户（供 processDelivery 调用）────────────────────────

async function pushSignalToUsers(signal: Signal): Promise<void> {
  const users = await getAllUsers();

  if (!users || users.length === 0) {
    logger.warn('No users found, skipping signal push');
    return;
  }

  logger.info(`Pushing signal ${signal.id} to ${users.length} users`);

  for (const user of users) {
    try {
      const fullUser = await getUserById(user.id);
      if (!fullUser) continue;

      const accountSnapshot = await getAccountSnapshot(user.id, 'futu');
      const manualPositions = await getManualPositions(user.id);

      const riskCheck = await checkRisk({
        user: fullUser,
        symbol: signal.symbol,
        market: signal.market,
        suggestedPositionPct: signal.suggestedPositionPct,
        accountSnapshot,
        manualPositions,
      });

      // blocked → 直接跳过，不推送
      if (riskCheck.status === 'blocked') {
        logger.warn(
          `Signal ${signal.id} blocked by risk check for user ${user.id}, skipping`,
        );
        continue;
      }

      const orderToken = uuidv4();

      const delivery = await createSignalDelivery({
        signalId: signal.id,
        userId: user.id,
        orderToken,
        sentAt: new Date(),
      });

      if (!delivery) {
        logger.error(`Failed to create delivery for user ${user.id}`);
        continue;
      }

      // 根据风控结果选择消息模板
      let message: ReturnType<typeof buildNormalSignalMessage> | ReturnType<typeof buildWarningSignalMessage>;
      if (riskCheck.status === 'warning') {
        message = buildWarningSignalMessage(signal, delivery, riskCheck);
      } else {
        // pass
        message = buildNormalSignalMessage(signal, delivery, riskCheck, accountSnapshot);
      }

      const sent = await sendSignalToUser(user.discordUserId, message);

      if (sent) {
        await updateSignalDelivery(delivery.id, {
          discordMessageId: sent.messageId,
          discordChannelId: sent.channelId,
          status: 'pending',
        });
        logger.info(`Signal ${signal.id} sent to user ${user.id}`);
      } else {
        logger.error(`Failed to send signal ${signal.id} to user ${user.id}`);
      }
    } catch (error) {
      logger.error(`Error pushing signal to user ${user.id}:`, error);
    }
  }
}

// ─── 内部辅助：推送纯资讯解读（供 processNewsOnly 调用）────────────────────────

async function pushNewsOnlyToUsers(newsItem: NewsItem, analysis: AnalysisResult): Promise<void> {
  const users = await getAllUsers();
  if (!users || users.length === 0) {
    logger.warn(`pushNewsOnlyToUsers: no users found, skipping news-only push for item ${newsItem.id}`);
    return;
  }

  const message = buildNewsOnlyMessage(newsItem, analysis);

  for (const user of users) {
    try {
      await sendSignalToUser(user.discordUserId, message);
    } catch (error) {
      logger.error(`Error sending news-only to user ${user.id}:`, error);
    }
  }

  logger.info(`News-only message sent to ${users.length} users for item ${newsItem.id}`);
}

newsWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

newsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});
