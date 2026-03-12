import { Queue, Worker, Job } from 'bullmq';
import {
  getNewsItem,
  updateNewsItem,
  createSignal,
  getSignal,
  getAllUsers,
  getActiveSignalForSymbol,
} from '../db/queries';
import { analyzeNewsItem, generateSignal, AnalysisResult } from '../services/ai/analyzer';
import { TradingMarket } from '../types/market';
import { logger } from '../utils/logger';
import { config } from '../config';
import { redisClient } from '../db/redis';
import { enqueueSignalDeliveries, enqueueNewsOnlyDeliveries } from './delivery-queue';

function parseRedisConnection(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined };
}

const connection = parseRedisConnection(config.REDIS_URL);

export const newsQueue = new Queue('news-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ─── 幂等入队：1小时内同一 newsItemId 只入队一次 ──────────────────────────────

export async function enqueueNewsItem(newsItemId: string): Promise<void> {
  const lockKey = `news:queued:${newsItemId}`;
  const result = await redisClient.set(lockKey, '1', { NX: true, EX: 3600 });
  if (!result) {
    logger.debug(`News item ${newsItemId} already queued within 1h, skipping`);
    return;
  }
  await newsQueue.add('process-news', { newsItemId });
  logger.info(`Queued news item: ${newsItemId}`);
}

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

    // Skip signal generation for macro news
    if (newsItem.market === 'macro') {
      logger.info(`No signal generated for ${newsItemId} (macro news)`);
      return null;
    }

    // Dedup: reuse existing active signal for same symbol/market
    const symbol = newsItem.symbols?.[0];
    if (symbol) {
      const existing = await getActiveSignalForSymbol(symbol, newsItem.market as TradingMarket);
      if (existing) {
        logger.info(`Active signal ${existing.id} already exists for ${symbol}/${newsItem.market}, skipping`);
        return existing.id;
      }
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
      market: newsItem.market as TradingMarket,
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

// ─── 步骤3：推送信号给所有用户（拆分为独立 delivery job，互不干扰）────────────

export async function processDelivery(signalId: string): Promise<void> {
  try {
    const signal = await getSignal(signalId);
    if (!signal) throw new Error(`Signal ${signalId} not found`);

    const users = await getAllUsers();
    if (!users || users.length === 0) {
      logger.warn('No users found, skipping signal delivery');
      return;
    }

    await enqueueSignalDeliveries(signalId, users.map((u) => u.id));
  } catch (error) {
    logger.error(`processDelivery failed for signalId=${signalId}:`, error);
    throw error;
  }
}

// ─── 步骤4（可选路径）：推送纯资讯解读给所有用户（拆分为独立 delivery job）────

export async function processNewsOnly(
  newsItemId: string,
  analysis: AnalysisResult,
): Promise<void> {
  try {
    const users = await getAllUsers();
    if (!users || users.length === 0) {
      logger.warn('No users found, skipping news-only delivery');
      return;
    }

    await enqueueNewsOnlyDeliveries(newsItemId, users.map((u) => u.id), analysis);
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

// 推送逻辑已迁移到 delivery-queue.ts（每用户独立 job，互不干扰）

newsWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

newsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});
