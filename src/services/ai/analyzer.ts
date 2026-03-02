import { config } from '../../config';
import { logger } from '../../utils/logger';
import { redisClient } from '../../db/redis';
import { query } from '../../db/postgres';
import { AIProviderFactory, AIProvider } from './base';
import { renderPrompt } from './prompts';

// 初始化 AI 提供商
let aiProvider: AIProvider;

function getAIProvider(): AIProvider {
  if (!aiProvider) {
    // 优先使用新配置
    const apiKey = config.AI_API_KEY || config.ANTHROPIC_API_KEY || '';
    const provider = config.AI_PROVIDER || 'anthropic';
    const baseUrl = config.AI_API_BASE_URL;
    const model = config.AI_MODEL;

    aiProvider = AIProviderFactory.create(provider, apiKey, baseUrl, model);
    logger.info(`AI Provider initialized: ${aiProvider.getProviderName()}`);
  }
  return aiProvider;
}

export interface AnalysisResult {
  summary: string;
  impact: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  importance: 'high' | 'medium' | 'low';
}

export interface SignalResult {
  shouldGenerate: boolean;
  direction: 'long' | 'short';
  confidence: number;
  suggestedPositionPct: number;
  reasoning: string;
  keyRisk: string;
}

// 检查并增加成本计数器
async function checkAndIncrementCostCounter(_callType: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `ai:daily:calls:${today}`;
  
  const count = await redisClient.get(key);
  const currentCount = count ? parseInt(count) : 0;
  
  if (currentCount >= config.AI_DAILY_CALL_LIMIT) {
    throw new Error('Daily AI call limit reached');
  }
  
  await redisClient.incr(key);
  await redisClient.expire(key, 86400); // 24小时过期
}

// 记录AI成本
async function logAICost(params: {
  callType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  newsItemId?: string;
  userId?: string;
}): Promise<void> {
  // Claude Sonnet 4 定价（示例）
  const inputCostPer1M = 3.0;  // $3 per 1M input tokens
  const outputCostPer1M = 15.0; // $15 per 1M output tokens
  
  const estimatedCost = 
    (params.inputTokens / 1000000) * inputCostPer1M +
    (params.outputTokens / 1000000) * outputCostPer1M;
  
  await query(`
    INSERT INTO ai_cost_logs (
      call_type, model, input_tokens, output_tokens, 
      estimated_cost_usd, news_item_id, user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    params.callType,
    params.model,
    params.inputTokens,
    params.outputTokens,
    estimatedCost,
    params.newsItemId || null,
    params.userId || null,
  ]);
  
  logger.info(`AI cost logged: ${params.callType}, $${estimatedCost.toFixed(4)}`);
}

// 调用1：摘要 + 影响分析
export async function analyzeNewsItem(newsItem: any): Promise<AnalysisResult> {
  await checkAndIncrementCostCounter('analysis');

  const provider = getAIProvider();

  const response = await provider.sendMessage([{
    role: 'user',
    content: renderPrompt('analyze_news', {
      title: newsItem.title ?? '',
      content: newsItem.content ?? '',
      market: newsItem.market ?? '',
      symbols: newsItem.symbols?.join(', ') ?? '',
    }),
  }], {
    maxTokens: 800,
    temperature: 0.7,
  });

  // 去除 AI 返回的 markdown 代码块包装（```json ... ```）
  const rawContent = response.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const result = JSON.parse(rawContent);

  await logAICost({
    callType: 'analysis',
    model: response.model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    newsItemId: newsItem.id,
  });

  return result;
}

// 调用2：交易参考 + 置信度
export async function generateSignal(
  newsItem: any,
  analysis: AnalysisResult
): Promise<SignalResult | null> {
  await checkAndIncrementCostCounter('signal');

  const provider = getAIProvider();

  const response = await provider.sendMessage([{
    role: 'user',
    content: renderPrompt('generate_signal', {
      summary: analysis.summary ?? '',
      impact: analysis.impact ?? '',
      sentiment: analysis.sentiment ?? '',
      symbols: newsItem.symbols?.join(', ') ?? '',
    }),
  }], {
    maxTokens: 500,
    temperature: 0.7,
  });

  const rawContent2 = response.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const result = JSON.parse(rawContent2);

  await logAICost({
    callType: 'signal',
    model: response.model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    newsItemId: newsItem.id,
  });

  if (!result.should_generate || result.confidence < 25) {
    return null;
  }

  return {
    shouldGenerate: result.should_generate,
    direction: result.direction,
    confidence: result.confidence,
    suggestedPositionPct: result.suggested_position_pct,
    reasoning: result.reasoning,
    keyRisk: result.key_risk,
  };
}

