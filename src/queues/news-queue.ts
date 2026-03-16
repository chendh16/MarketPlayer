import { Queue, Worker, Job } from 'bullmq';
import {
  getNewsItem,
  updateNewsItem,
  createSignal,
  getSignal,
  getAllUsers,
  getActiveSignalForSymbol,
} from '../db/queries';
import { analyzeNewsItem, generateSignal as aiGenerateSignal, AnalysisResult } from '../services/ai/analyzer';
import { hybridAnalyze, HybridResult } from '../services/news/hybrid-engine';
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

// ─── 步骤1：AI + 规则混合分析并写库 ─────────────────────────────────────

export async function processAnalysis(newsItemId: string): Promise<HybridResult> {
  try {
    const newsItem = await getNewsItem(newsItemId);

    if (!newsItem) {
      throw new Error(`News item ${newsItemId} not found`);
    }

    // 使用混合引擎分析 (规则 + AI)
    const result = await hybridAnalyze(newsItem, {
      useAI: true,
      aiThreshold: 0.6,  // 置信度低于0.6才调用AI
      useIndustryChain: true,
    });

    // 更新数据库
    const industryInfo = result.industryResult?.detectedIndustries
      .map(i => `${i.industry.name}(${i.matchedKeywords.join(',')})`)
      .join('; ') || '';

    await updateNewsItem(newsItemId, {
      aiSummary: result.finalSignal.reasoning,
      aiImpactAnalysis: industryInfo,
      aiProcessed: true,
      aiProcessedAt: new Date(),
    });

    logger.info(`News item ${newsItemId} analyzed (source: ${result.finalSignal.source}, usedAI: ${result.usedAI}, time: ${result.processingTime}ms)`);
    return result;
  } catch (error) {
    logger.error(`processAnalysis failed for newsItemId=${newsItemId}:`, error);
    throw error;
  }
}

// ─── 步骤2：基于混合结果生成信号 ─────────────────────────────────────────

export async function processSignal(
  newsItemId: string,
  hybridResult: HybridResult,
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

    // 使用混合引擎的结果
    const { finalSignal, industryResult } = hybridResult;

    // 置信度不足，跳过
    if (finalSignal.action === 'hold' || finalSignal.confidence < 30) {
      logger.info(`No signal generated for ${newsItemId} (confidence too low: ${finalSignal.confidence}%)`);
      return null;
    }

    // Dedup: reuse existing active signal for same symbol/market
    const symbol = newsItem.symbols?.[0];
    
    // 如果没有股票代码，跳过信号生成
    if (!symbol) {
      logger.info(`No symbol found for news ${newsItemId}, skipping signal generation`);
      return null;
    }

    const existing = await getActiveSignalForSymbol(symbol, newsItem.market as TradingMarket);
    if (existing) {
      logger.info(`Active signal ${existing.id} already exists for ${symbol}/${newsItem.market}, skipping`);
      return existing.id;
    }

    // 构建信号理由
    let reasoning = finalSignal.reasoning;
    if (industryResult && industryResult.chainStocks.length > 0) {
      const topStocks = industryResult.chainStocks.slice(0, 3)
        .map(s => `${s.code}(${s.level[0]})`)
        .join(', ');
      reasoning += ` | 产业链: ${topStocks}`;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15分钟后
    const signal = await createSignal({
      newsItemId,
      symbol: newsItem.symbols?.[0],
      market: newsItem.market as TradingMarket,
      direction: finalSignal.action === 'buy' ? 'long' : 'short',
      confidence: finalSignal.confidence,
      suggestedPositionPct: finalSignal.positionPct,
      reasoning,
      expiresAt,
    });

    logger.info(`Signal created: ${signal.id} (${finalSignal.action}, conf:${finalSignal.confidence}%, source:${finalSignal.source})`);
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

    // 步骤1：混合引擎分析 (规则+AI)
    const hybridResult = await processAnalysis(newsItemId);

    // 步骤2：生成信号
    const signalId = await processSignal(newsItemId, hybridResult);

    if (!signalId) {
      // 置信度不足，推送纯资讯解读
      await processNewsOnly(newsItemId, { summary: hybridResult.finalSignal.reasoning, impact: '', sentiment: 'neutral', importance: 'low' } as AnalysisResult);
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
