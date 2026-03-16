/**
 * 新闻信号生成器
 * 基于事件检测和情感分析生成交易信号
 */

import { NewsItem, Signal } from '../../../models/signal';
import { detectEvent, DetectedEvent, getEventTimeWindow, getEventWeight, EventType } from './event-detector';
import { analyzeWithEvent, SentimentResult } from './sentiment-analyzer';

export interface SignalGeneratorConfig {
  minConfidence: number;      // 最低置信度
  minSentiment: number;       // 最小情感阈值
  maxPositionPct: number;     // 最大仓位
  eventWeight: number;        // 事件权重
  sentimentWeight: number;     // 情感权重
}

const DEFAULT_CONFIG: SignalGeneratorConfig = {
  minConfidence: 0.5,
  minSentiment: 0.3,
  maxPositionPct: 30,
  eventWeight: 0.6,
  sentimentWeight: 0.4,
};

export interface GeneratedSignal {
  signal: Partial<Signal>;
  event: DetectedEvent;
  sentiment: SentimentResult;
  finalScore: number;
  action: 'buy' | 'sell' | 'hold';
  positionPct: number;
  reasoning: string;
}

/**
 * 生成交易信号
 */
export function generateSignal(
  news: NewsItem,
  config: Partial<SignalGeneratorConfig> = {}
): GeneratedSignal | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. 事件检测
  const event = detectEvent(news);

  // 2. 情感分析
  const sentiment = analyzeWithEvent(news);

  // 3. 计算综合得分
  const finalScore = calculateFinalScore(event, sentiment, cfg);

  // 4. 判断动作
  const action = determineAction(finalScore, cfg.minSentiment);

  // 5. 生成信号
  if (action === 'hold') {
    return null; // 不生成信号
  }

  // 6. 计算仓位
  const positionPct = calculatePosition(finalScore, cfg.maxPositionPct);

  // 7. 构建信号
  const signal: Partial<Signal> = {
    newsItemId: news.id,
    direction: action === 'buy' ? 'long' : 'short',
    confidence: Math.round(event.confidence * sentiment.confidence * 100),
    suggestedPositionPct: positionPct,
    reasoning: buildReasoning(news, event, sentiment, action),
    status: 'generated',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + getEventTimeWindow(event.type) * 24 * 60 * 60 * 1000),
  };

  return {
    signal,
    event,
    sentiment,
    finalScore,
    action,
    positionPct,
    reasoning: signal.reasoning || '',
  };
}

/**
 * 计算综合得分
 */
function calculateFinalScore(
  event: DetectedEvent,
  sentiment: SentimentResult,
  config: SignalGeneratorConfig
): number {
  // 事件得分
  const eventScore = event.sentiment * event.confidence * getEventWeight(event.type);
  
  // 情感得分
  const sentimentScore = sentiment.score * sentiment.confidence;
  
  // 加权融合
  const finalScore = 
    eventScore * config.eventWeight + 
    sentimentScore * config.sentimentWeight;

  return Math.max(-1, Math.min(1, finalScore));
}

/**
 * 判断交易动作
 */
function determineAction(score: number, minSentiment: number): 'buy' | 'sell' | 'hold' {
  if (score > minSentiment) return 'buy';
  if (score < -minSentiment) return 'sell';
  return 'hold';
}

/**
 * 计算建议仓位
 */
function calculatePosition(score: number, maxPct: number): number {
  const absScore = Math.abs(score);
  // 非线性映射：得分越高仓位越高
  const position = Math.round(maxPct * Math.pow(absScore, 0.7));
  return Math.max(5, Math.min(maxPct, position));
}

/**
 * 构建信号理由
 */
function buildReasoning(
  news: NewsItem,
  event: DetectedEvent,
  sentiment: SentimentResult,
  action: 'buy' | 'sell'
): string {
  const title = news.title?.substring(0, 30) || '未知';
  const eventDesc = event.description;
  const sentimentLabel = sentiment.label;
  const confidence = Math.round(event.confidence * sentiment.confidence * 100);
  
  return `[${event.type}] ${title}... | 事件:${eventDesc} | 情感:${sentimentLabel} | 置信度:${confidence}% | 建议:${action === 'buy' ? '买入' : '卖出'}`;
}

/**
 * 批量生成信号
 */
export function generateSignals(
  newsList: NewsItem[],
  config?: Partial<SignalGeneratorConfig>
): GeneratedSignal[] {
  const signals: GeneratedSignal[] = [];
  
  for (const news of newsList) {
    const signal = generateSignal(news, config);
    if (signal) {
      signals.push(signal);
    }
  }
  
  return signals;
}

/**
 * 信号过滤：去除重复/冲突信号
 */
export function filterSignals(signals: GeneratedSignal[]): GeneratedSignal[] {
  // 按股票分组
  const bySymbol = new Map<string, GeneratedSignal[]>();
  
  for (const sig of signals) {
    const news = sig.signal.newsItemId; // 实际应该从 news 取 symbols
    const key = 'default'; // TODO: 完善股票关联
    if (!bySymbol.has(key)) {
      bySymbol.set(key, []);
    }
    bySymbol.get(key)!.push(sig);
  }

  // 每个股票只保留最强信号
  const filtered: GeneratedSignal[] = [];
  for (const entry of Array.from(bySymbol.entries())) {
    const sigs = entry[1];
    if (sigs.length === 0) continue;
    
    // 按得分绝对值排序
    sigs.sort((a, b) => Math.abs(b.finalScore) - Math.abs(a.finalScore));
    filtered.push(sigs[0]);
  }

  return filtered;
}

/**
 * 获取事件类型的交易方向
 */
export function getEventDirection(type: EventType): 'long' | 'short' | 'neutral' {
  const directions: Record<EventType, 'long' | 'short' | 'neutral'> = {
    earnings_increase: 'long',
    earnings_decrease: 'short',
    policy_benefit: 'long',
    policy_harm: 'short',
    merger_acquisition: 'long',
    risk_alert: 'short',
    management_change: 'neutral',
    lawsuit_penalty: 'short',
    product_breakthrough: 'long',
    normal: 'neutral',
  };
  return directions[type];
}

/**
 * 导出配置建议
 */
export function getConfigForEventType(type: EventType): Partial<SignalGeneratorConfig> {
  const base = { ...DEFAULT_CONFIG };
  
  switch (type) {
    case 'risk_alert':
    case 'earnings_decrease':
      // 高风险事件，降低仓位
      return { ...base, maxPositionPct: 15, minSentiment: 0.2 };
    case 'earnings_increase':
    case 'product_breakthrough':
      // 利好事件，可以提高仓位
      return { ...base, maxPositionPct: 40, minSentiment: 0.25 };
    default:
      return base;
  }
}
