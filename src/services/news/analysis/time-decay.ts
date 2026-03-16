/**
 * 时间衰减器
 * 实现不同事件类型的时间衰减曲线
 */

import { EventType } from './event-detector';

// 不同事件类型的半衰期配置（天）
const HALF_LIFE_CONFIG: Record<EventType, number> = {
  earnings_increase: 3,
  earnings_decrease: 3,
  risk_alert: 1,
  policy_benefit: 7,
  policy_harm: 7,
  merger_acquisition: 14,
  product_breakthrough: 14,
  management_change: 5,
  lawsuit_penalty: 7,
  normal: 1,
};

// 不同事件类型的初始强度衰减
const INITIAL_DECAY_CONFIG: Record<EventType, number> = {
  earnings_increase: 1.0,
  earnings_decrease: 1.0,
  risk_alert: 1.2,    // 风险事件初始更强
  policy_benefit: 0.9,
  policy_harm: 1.1,
  merger_acquisition: 0.8,
  product_breakthrough: 0.9,
  management_change: 0.6,
  lawsuit_penalty: 0.9,
  normal: 0.5,
};

export interface DecayConfig {
  halfLife: number;      // 半衰期（天）
  initialDecay: number;  // 初始衰减系数
}

/**
 * 获取事件类型的衰减配置
 */
export function getDecayConfig(type: EventType): DecayConfig {
  return {
    halfLife: HALF_LIFE_CONFIG[type],
    initialDecay: INITIAL_DECAY_CONFIG[type],
  };
}

/**
 * 计算指数衰减
 * @param ageDays 事件年龄（天）
 * @param halfLife 半衰期（天）
 */
export function calculateDecay(ageDays: number, halfLife: number): number {
  if (halfLife <= 0) return 0;
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * 计算带初始衰减的事件强度
 */
export function calculateEventStrength(
  eventType: EventType,
  ageDays: number
): number {
  const config = getDecayConfig(eventType);
  const decay = calculateDecay(ageDays, config.halfLife);
  return config.initialDecay * decay;
}

/**
 * 时间加权因子计算
 * 用于因子构建时对新闻进行时间加权
 */
export interface TimeWeightedNews {
  newsId: string;
  eventType: EventType;
  sentiment: number;
  strength: number;
  ageDays: number;
}

/**
 * 计算多新闻的时间加权得分
 */
export function calculateTimeWeightedScore(
  newsList: TimeWeightedNews[]
): number {
  if (newsList.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (const news of newsList) {
    const strength = calculateEventStrength(news.eventType, news.ageDays);
    weightedSum += news.sentiment * strength;
    weightSum += strength;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * 获取事件剩余有效期（天）
 * 当强度低于阈值时认为事件失效
 */
export function getEventExpiryDays(eventType: EventType, threshold: number = 0.1): number {
  const config = getDecayConfig(eventType);
  // 当 decay * initialDecay < threshold 时的天数
  const maxDays = -Math.log(threshold / config.initialDecay) * config.halfLife / Math.LN2;
  return Math.max(0, Math.min(maxDays, config.halfLife * 10)); // 最多10个半衰期
}

/**
 * 批量计算新闻衰减
 */
export function decayNewsList(
  newsWithAge: Array<{ eventType: EventType; ageDays: number }>
): number[] {
  return newsWithAge.map(({ eventType, ageDays }) => 
    calculateEventStrength(eventType, ageDays)
  );
}
