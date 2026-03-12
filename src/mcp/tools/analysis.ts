import { analyzeNewsItem, generateSignal } from '../../services/ai/analyzer';
import { getNewsItem, updateNewsItem, createSignal } from '../../db/queries';
import { logger } from '../../utils/logger';
import { TradingMarket } from '../../types/market';

/**
 * analyze_news — 对已入库的资讯执行 AI 分析，结果写库并返回
 */
export async function analyze_news(params: { newsItemId: string }) {
  const { newsItemId } = params;
  logger.info(`[MCP] analyze_news newsItemId=${newsItemId}`);

  const item = await getNewsItem(newsItemId);
  if (!item) throw new Error(`NewsItem not found: ${newsItemId}`);

  const result = await analyzeNewsItem(item);

  await updateNewsItem(newsItemId, {
    aiSummary: result.summary,
    aiImpactAnalysis: result.impact,
    aiProcessed: true,
    aiProcessedAt: new Date(),
  });

  return { newsItemId, ...result };
}

/**
 * generate_signal — 基于已分析资讯生成交易信号并写库
 * 调用前需先完成 analyze_news
 */
export async function generate_signal(params: { newsItemId: string }) {
  const { newsItemId } = params;
  logger.info(`[MCP] generate_signal newsItemId=${newsItemId}`);

  const item = await getNewsItem(newsItemId);
  if (!item) throw new Error(`NewsItem not found: ${newsItemId}`);
  if (!item.aiProcessed) throw new Error(`NewsItem ${newsItemId} not yet analyzed. Call analyze_news first.`);

  // Skip signal generation for macro news
  if (item.market === 'macro') {
    return { generated: false, reason: 'Macro news does not generate trading signals' };
  }

  const analysis = {
    summary: item.aiSummary ?? '',
    impact: item.aiImpactAnalysis ?? '',
    sentiment: 'neutral' as const,
    importance: 'medium' as const,
  };

  const signalResult = await generateSignal(item, analysis);
  if (!signalResult) {
    return { generated: false, reason: 'Confidence too low or shouldGenerate=false' };
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const signal = await createSignal({
    newsItemId,
    symbol: item.symbols?.[0] ?? '',
    market: item.market as TradingMarket,
    direction: signalResult.direction,
    confidence: signalResult.confidence,
    suggestedPositionPct: signalResult.suggestedPositionPct,
    reasoning: `${signalResult.reasoning} | Risk: ${signalResult.keyRisk}`,
    expiresAt,
  });

  return { generated: true, signalId: signal.id, ...signalResult };
}
