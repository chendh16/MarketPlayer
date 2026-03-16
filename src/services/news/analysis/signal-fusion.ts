/**
 * 信号融合层
 * 将事件信号和因子信号融合为最终交易决策
 */

import { NewsItem, Signal } from '../../../models/signal';
import { TradingMarket } from '../../../types/market';
import { GeneratedSignal, generateSignal } from './signal-generator';
import { FactorBundle, buildFactorBundle } from './factor-builder';

export interface FusionConfig {
  eventWeight: number;      // 事件信号权重
  factorWeight: number;     // 因子信号权重
  eventConfidenceThreshold: number;  // 事件信号最低置信度
  factorConfidenceThreshold: number; // 因子信号最低置信度
}

const DEFAULT_FUSION_CONFIG: FusionConfig = {
  eventWeight: 0.6,
  factorWeight:0.4,
  eventConfidenceThreshold: 0.5,
  factorConfidenceThreshold: 0.3,
};

export interface FusionResult {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  positionPct: number;
  finalScore: number;
  eventSignal: GeneratedSignal | null;
  factorScore: number;
  reasoning: string;
}

/**
 * 融合事件信号和因子信号
 */
export function fuseSignals(
  eventSignal: GeneratedSignal | null,
  factorBundle: FactorBundle | null,
  config: Partial<FusionConfig> = {}
): FusionResult {
  const cfg = { ...DEFAULT_FUSION_CONFIG, ...config };

  // 1. 处理事件信号
  let eventScore = 0;
  let eventConfidence = 0;
  let hasEventSignal = false;

  if (eventSignal && eventSignal.event.confidence >= cfg.eventConfidenceThreshold) {
    eventScore = eventSignal.finalScore;
    eventConfidence = eventSignal.event.confidence;
    hasEventSignal = true;
  }

  // 2. 处理因子信号
  let factorScore = 0;
  let hasFactorSignal = false;

  if (factorBundle && Math.abs(factorBundle.compositeScore) >= cfg.factorConfidenceThreshold) {
    factorScore = factorBundle.compositeScore;
    hasFactorSignal = true;
  }

  // 3. 融合得分
  let finalScore = 0;
  let totalWeight = 0;

  if (hasEventSignal) {
    finalScore += eventScore * cfg.eventWeight * eventConfidence;
    totalWeight += cfg.eventWeight * eventConfidence;
  }

  if (hasFactorSignal) {
    finalScore += factorScore * cfg.factorWeight;
    totalWeight += cfg.factorWeight;
  }

  if (totalWeight > 0) {
    finalScore = finalScore / totalWeight;
  }

  // 4. 计算置信度
  let confidence = 0;
  let weightCount = 0;
  if (hasEventSignal) {
    confidence += eventConfidence;
    weightCount++;
  }
  if (hasFactorSignal) {
    confidence += Math.abs(factorScore);
    weightCount++;
  }
  confidence = weightCount > 0 ? confidence / weightCount : 0;

  // 5. 判断动作
  const action = determineAction(finalScore, 0.2);

  // 6. 计算仓位
  const positionPct = calculatePosition(finalScore, confidence, 30);

  // 7. 生成理由
  const reasoning = buildFusionReasoning(
    hasEventSignal,
    eventScore,
    eventConfidence,
    hasFactorSignal,
    factorScore,
    finalScore,
    action
  );

  return {
    action,
    confidence,
    positionPct,
    finalScore,
    eventSignal,
    factorScore,
    reasoning,
  };
}

/**
 * 判断交易动作
 */
function determineAction(score: number, threshold: number): 'buy' | 'sell' | 'hold' {
  if (score > threshold) return 'buy';
  if (score < -threshold) return 'sell';
  return 'hold';
}

/**
 * 计算仓位
 */
function calculatePosition(score: number, confidence: number, maxPct: number): number {
  const absScore = Math.abs(score);
  const confidenceAdjust = 0.5 + confidence * 0.5;
  const position = Math.round(maxPct * Math.pow(absScore, 0.6) * confidenceAdjust);
  return Math.max(5, Math.min(maxPct, position));
}

/**
 * 构建融合理由
 */
function buildFusionReasoning(
  hasEventSignal: boolean,
  eventScore: number,
  eventConfidence: number,
  hasFactorSignal: boolean,
  factorScore: number,
  finalScore: number,
  action: 'buy' | 'sell' | 'hold'
): string {
  const parts: string[] = [];

  if (hasEventSignal) {
    parts.push(`事件信号: ${eventScore.toFixed(2)} (置信度: ${(eventConfidence * 100).toFixed(0)}%)`);
  }

  if (hasFactorSignal) {
    parts.push(`因子信号: ${factorScore.toFixed(2)}`);
  }

  if (parts.length === 0) {
    return '无有效信号，保持观望';
  }

  parts.push(`融合得分: ${finalScore.toFixed(2)}`);
  parts.push(`最终建议: ${action === 'buy' ? '买入' : action === 'sell' ? '卖出' : '观望'}`);

  return parts.join(' | ');
}

/**
 * 批量融合信号
 */
export function fuseMultipleSignals(
  items: Array<{
    news: NewsItem;
    factorBundle?: FactorBundle;
  }>,
  config?: Partial<FusionConfig>
): FusionResult[] {
  const results: FusionResult[] = [];

  for (const item of items) {
    const eventSignal = generateSignal(item.news);
    const fusionResult = fuseSignals(eventSignal, item.factorBundle || null, config);
    results.push(fusionResult);
  }

  return results;
}

/**
 * 选择最佳信号
 * 从多个融合结果中选择最强信号
 */
export function selectBestSignal(
  results: FusionResult[],
  maxSignals: number = 3
): FusionResult[] {
  // 按得分绝对值排序
  const sorted = results
    .filter(r => r.action !== 'hold')
    .sort((a, b) => Math.abs(b.finalScore) - Math.abs(a.finalScore));

  return sorted.slice(0, maxSignals);
}

/**
 * 生成最终 Signal 对象
 */
export function createFinalSignal(
  fusionResult: FusionResult,
  news: NewsItem,
  symbol: string
): Partial<Signal> {
  const market: TradingMarket = news.market === 'macro' ? 'a' : news.market;
  
  return {
    newsItemId: news.id,
    symbol,
    market,
    direction: fusionResult.action === 'buy' ? 'long' : 'short',
    confidence: Math.round(fusionResult.confidence * 100),
    suggestedPositionPct: fusionResult.positionPct,
    reasoning: fusionResult.reasoning,
    status: 'generated',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 默认3天
  };
}
