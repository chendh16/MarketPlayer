import { Queue, Worker, Job } from 'bullmq';
import { getNewsItem, updateNewsItem, createSignal } from '../db/queries';
import { analyzeNewsItem, generateSignal } from '../services/ai/analyzer';
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

export const newsWorker = new Worker<NewsJobData>(
  'news-processing',
  async (job: Job<NewsJobData>) => {
    const { newsItemId } = job.data;
    
    logger.info(`Processing news item: ${newsItemId}`);

    // 获取资讯
    const newsItem = await getNewsItem(newsItemId);

    if (!newsItem) {
      logger.warn(`News item ${newsItemId} not found`);
      return;
    }

    // 步骤1：AI 分析
    const analysis = await analyzeNewsItem(newsItem);

    await updateNewsItem(newsItemId, {
      aiSummary: analysis.summary,
      aiImpactAnalysis: analysis.impact,
      aiProcessed: true,
      aiProcessedAt: new Date(),
    });
    
    logger.info(`News item ${newsItemId} analyzed`);
    
    // 步骤2：生成信号
    const signalResult = await generateSignal(newsItem, analysis);
    
    if (!signalResult) {
      logger.info(`No signal generated for ${newsItemId} (confidence too low)`);
      // TODO: 推送纯资讯解读
      return;
    }
    
    // 步骤3：创建 Signal 记录
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
    
    // 步骤4：推入推送队列
    // TODO: 实现信号推送队列
    
  },
  { connection, concurrency: 3 }
);

newsWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

newsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

