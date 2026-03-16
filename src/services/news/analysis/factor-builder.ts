/**
 * 因子构建器
 * 将新闻情感和事件转化为可交易的因子
 */

import { NewsItem } from '../../../models/signal';
import { detectEvent, EventType, getEventTimeWindow, getEventWeight } from './event-detector';
import { analyzeWithEvent, SentimentResult } from './sentiment-analyzer';
import { calculateEventStrength, TimeWeightedNews } from './time-decay';

export interface NewsFactor {
  name: string;
  value: number;
  weight: number;
  description: string;
}

export interface FactorBundle {
  symbol: string;
  factors: NewsFactor[];
  compositeScore: number;
  timestamp: Date;
}

/**
 * 情感因子
 * 基于新闻情感得分的因子
 */
export function buildSentimentFactor(
  newsList: NewsItem[],
  period: 'daily' | 'weekly' = 'daily'
): NewsFactor {
  if (newsList.length === 0) {
    return {
      name: 'sentiment_factor',
      value: 0,
      weight: 0.4,
      description: '日均新闻情感得分',
    };
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const periodMs = period === 'daily' ? dayMs : 7 * dayMs;

  // 过滤周期内的新闻
  const recentNews = newsList.filter(
    n => now - new Date(n.publishedAt).getTime() < periodMs
  );

  if (recentNews.length === 0) {
    return {
      name: 'sentiment_factor',
      value: 0,
      weight: 0.4,
      description: '日均新闻情感得分',
    };
  }

  // 计算情感得分
  let sum = 0;
  for (const news of recentNews) {
    const sentiment = analyzeWithEvent(news);
    const ageDays = (now - new Date(news.publishedAt).getTime()) / dayMs;
    const strength = calculateEventStrength(detectEvent(news).type, ageDays);
    sum += sentiment.score * strength;
  }

  const value = sum / recentNews.length;

  return {
    name: 'sentiment_factor',
    value,
    weight: 0.4,
    description: `${period}新闻情感得分（时间加权）`,
  };
}

/**
 * 情感变化因子
 * 今日情感与昨日情感的差值
 */
export function buildSentimentChangeFactor(
  todayNews: NewsItem[],
  yesterdayNews: NewsItem[]
): NewsFactor {
  const todayScore = buildSentimentFactor(todayNews).value;
  const yesterdayScore = buildSentimentFactor(yesterdayNews).value;
  const change = todayScore - yesterdayScore;

  return {
    name: 'sentiment_change_factor',
    value: change,
    weight: 0.2,
    description: '情感变化率（今日-昨日）',
  };
}

/**
 * 热度因子
 * 基于新闻数量的因子
 */
export function buildHeatFactor(
  newsList: NewsItem[],
  period: 'daily' | 'weekly' = 'daily'
): NewsFactor {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const periodMs = period === 'daily' ? dayMs : 7 * dayMs;

  const recentNews = newsList.filter(
    n => now - new Date(n.publishedAt).getTime() < periodMs
  );

  // 归一化：假设日均50条为满分
  const normalizedValue = Math.min(1, recentNews.length / 50);

  return {
    name: 'heat_factor',
    value: normalizedValue,
    weight: 0.2,
    description: `${period}新闻热度（数量归一化）`,
  };
}

/**
 * 关注度因子
 * 基于高置信度事件的比例
 */
export function buildAttentionFactor(
  newsList: NewsItem[]
): NewsFactor {
  if (newsList.length === 0) {
    return {
      name: 'attention_factor',
      value: 0,
      weight: 0.2,
      description: '高置信度事件占比',
    };
  }

  let highConfidenceCount = 0;
  for (const news of newsList) {
    const event = detectEvent(news);
    if (event.confidence >= 0.7) {
      highConfidenceCount++;
    }
  }

  const value = highConfidenceCount / newsList.length;

  return {
    name: 'attention_factor',
    value,
    weight: 0.2,
    description: '高置信度事件占比',
  };
}

/**
 * 累积因子
 * 考虑历史累积效用的因子
 */
export function buildCumulativeFactor(
  newsList: NewsItem[],
  lookbackDays: number = 5
): NewsFactor {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const lookbackMs = lookbackDays * dayMs;

  const recentNews = newsList.filter(
    n => now - new Date(n.publishedAt).getTime() < lookbackMs
  );

  if (recentNews.length === 0) {
    return {
      name: 'cumulative_factor',
      value: 0,
      weight: 0.15,
      description: `${lookbackDays}天累积情感`,
    };
  }

  // 计算累积效应：近期权重更高
  let cumulative = 0;
  let totalWeight = 0;

  for (const news of recentNews) {
    const event = detectEvent(news);
    const sentiment = analyzeWithEvent(news);
    const ageDays = (now - new Date(news.publishedAt).getTime()) / dayMs;
    
    // 累积衰减
    const cumulativeDecay = Math.pow(0.7, ageDays);
    const eventWeight = getEventWeight(event.type);
    
    cumulative += sentiment.score * eventWeight * cumulativeDecay;
    totalWeight += eventWeight * cumulativeDecay;
  }

  const value = totalWeight > 0 ? cumulative / totalWeight : 0;

  return {
    name: 'cumulative_factor',
    value,
    weight: 0.15,
    description: `${lookbackDays}天累积情感（衰减）`,
  };
}

/**
 * 构建完整因子包
 */
export function buildFactorBundle(
  symbol: string,
  newsList: NewsItem[],
  todayNews: NewsItem[] = [],
  yesterdayNews: NewsItem[] = []
): FactorBundle {
  const factors: NewsFactor[] = [];

  // 1. 情感因子
  factors.push(buildSentimentFactor(newsList));

  // 2. 情感变化因子
  if (todayNews.length > 0 && yesterdayNews.length > 0) {
    factors.push(buildSentimentChangeFactor(todayNews, yesterdayNews));
  }

  // 3. 热度因子
  factors.push(buildHeatFactor(newsList));

  // 4. 关注度因子
  factors.push(buildAttentionFactor(newsList));

  // 5. 累积因子
  factors.push(buildCumulativeFactor(newsList));

  // 计算综合得分
  let weightedSum = 0;
  let weightSum = 0;
  for (const factor of factors) {
    weightedSum += factor.value * factor.weight;
    weightSum += factor.weight;
  }
  const compositeScore = weightSum > 0 ? weightedSum / weightSum : 0;

  return {
    symbol,
    factors,
    compositeScore,
    timestamp: new Date(),
  };
}

/**
 * 批量构建因子（多股票）
 */
export function buildMultiSymbolFactors(
  newsBySymbol: Map<string, NewsItem[]>
): FactorBundle[] {
  const bundles: FactorBundle[] = [];

  for (const entry of Array.from(newsBySymbol.entries())) {
    const symbol = entry[0];
    const newsList = entry[1];
    bundles.push(buildFactorBundle(symbol, newsList));
  }

  return bundles;
}
