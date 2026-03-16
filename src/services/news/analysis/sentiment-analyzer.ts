/**
 * 情感分析模块
 * 基于金融领域词典的情感分析
 */

import { NewsItem } from '../../../models/signal';
import { detectEvent, DetectedEvent } from './event-detector';

// 金融领域正面词汇（基于 Loughran-McDonald 词典优化）
const POSITIVE_WORDS = new Set([
  '增长', '上升', '上涨', '盈利', '利润', '突破', '创新', '领先', '优质',
  '推荐', '买入', '增持', '看好', '机会', '利好', '成功', '完成', '获批',
  '签约', '中标', '订单', '合作', '扩张', '提升', '提高', '改善', '强劲',
  '超预期', '符合预期', '大幅', '显著', '明显', '持续', '稳定', '增长',
  '提速', '加速', '爆发', '拐点', '景气', '复苏', '回暖', '向好', '价值',
  '上调', '提价', '涨价', '出厂价', '新品', '上市', '获批', '融资', '并购',
  '回购', '分红', '业绩预增', '扭亏', '摘帽', '扶持', '补贴', '减免', '放松',
]);

// 金融领域负面词汇
const NEGATIVE_WORDS = new Set([
  '下跌', '下降', '下滑', '亏损', '风险', '警示', '退市', 'ST', '违规',
  '处罚', '调查', '诉讼', '仲裁', '判决', '罚款', '赔偿', '损失', '减少',
  '下降', '下滑', '减持', '卖出', '看空', '利空', '失败', '推迟', '终止',
  '取消', '下调', '低于', '不及', '恶化', '承压', '受挫', '跳水', '崩盘',
  '恐慌', '踩雷', '爆雷', '违约', '破产', '清盘', '资不抵债', '负面',
]);

// 中性/否定前缀词
const NEGATION_WORDS = new Set([
  '不', '没', '无', '非', '未', '否', '禁止', '停止', '取消',
]);

export interface SentimentResult {
  score: number;          // -1 ~ 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;      // 0 ~ 1
  positiveWords: string[];
  negativeWords: string[];
  wordCount: number;
}

/**
 * 基础情感分析（基于词典）
 */
export function analyzeSentiment(news: NewsItem | Partial<NewsItem> | string): SentimentResult {
  const text = typeof news === 'string' ? news : `${news.title || ''} ${news.content || ''}`;
  const words = segmentChinese(text);
  
  let positiveCount = 0;
  let negativeCount = 0;
  const positiveWords: string[] = [];
  const negativeWords: string[] = [];
  let negate = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // 检测否定词
    if (NEGATION_WORDS.has(word)) {
      negate = true;
      continue;
    }

    // 检测正面词
    if (POSITIVE_WORDS.has(word)) {
      if (negate) {
        // 否定正面词 = 负面
        negativeCount++;
        negativeWords.push(word);
      } else {
        positiveCount++;
        positiveWords.push(word);
      }
      negate = false;
      continue;
    }

    // 检测负面词
    if (NEGATIVE_WORDS.has(word)) {
      if (negate) {
        // 否定负面词 = 正面
        positiveCount++;
        positiveWords.push(word);
      } else {
        negativeCount++;
        negativeWords.push(word);
      }
      negate = false;
      continue;
    }

    // 重置否定状态
    if (!NEGATION_WORDS.has(word) && word.length > 1) {
      negate = false;
    }
  }

  // 计算情感得分
  const total = positiveCount + negativeCount;
  let score = 0;
  if (total > 0) {
    score = (positiveCount - negativeCount) / Math.max(total, 3);
  }

  // 置信度：词数越多越可靠
  const confidence = Math.min(1, total / 5) * 0.5 + 0.3;

  let label: 'positive' | 'negative' | 'neutral';
  if (score > 0.1) label = 'positive';
  else if (score < -0.1) label = 'negative';
  else label = 'neutral';

  return {
    score: Math.max(-1, Math.min(1, score)),
    label,
    confidence,
    positiveWords,
    negativeWords,
    wordCount: words.length,
  };
}

/**
 * 结合事件检测的情感分析
 */
export function analyzeWithEvent(news: NewsItem | Partial<NewsItem>): SentimentResult {
  const text = `${news.title || ''} ${news.content || ''}`;
  
  // 1. 词典情感分析
  const dictionarySentiment = analyzeSentiment(text);
  
  // 2. 事件情感分析
  const event = detectEvent(news);
  const eventSentiment = event.sentiment;
  
  // 3. 加权融合
  // 事件检测权重更高（因为基于关键词匹配）
  const combinedScore = dictionarySentiment.score * 0.3 + eventSentiment * 0.7;
  
  // 4. 综合置信度
  const combinedConfidence = Math.min(1, 
    dictionarySentiment.confidence * 0.4 + event.confidence * 0.6
  );

  let label: 'positive' | 'negative' | 'neutral';
  if (combinedScore > 0.15) label = 'positive';
  else if (combinedScore < -0.15) label = 'negative';
  else label = 'neutral';

  return {
    score: Math.max(-1, Math.min(1, combinedScore)),
    label,
    confidence: combinedConfidence,
    positiveWords: [...dictionarySentiment.positiveWords],
    negativeWords: [...dictionarySentiment.negativeWords],
    wordCount: dictionarySentiment.wordCount,
  };
}

/**
 * 批量情感分析
 */
export function analyzeSentimentBatch(
  newsList: (NewsItem | Partial<NewsItem>)[]
): SentimentResult[] {
  return newsList.map(news => analyzeWithEvent(news));
}

/**
 * 简单中文分词（基于字符级 + 常见词组）
 */
function segmentChinese(text: string): string[] {
  // 转换为小写并清理
  const cleaned = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ');
  
  // 简单处理：按空格分割，保留有意义的词
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  return tokens;
}

/**
 * 计算新闻情感的时间加权
 * 越新的新闻权重越高
 */
export function calculateTimeWeightedSentiment(
  newsWithScores: Array<{ news: NewsItem; sentiment: SentimentResult }>
): number {
  if (newsWithScores.length === 0) return 0;

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  let weightedSum = 0;
  let weightSum = 0;

  for (const { news, sentiment } of newsWithScores) {
    const ageDays = (now - new Date(news.publishedAt).getTime()) / DAY_MS;
    // 指数衰减：每天权重减半
    const weight = Math.pow(0.5, ageDays);
    
    weightedSum += sentiment.score * weight * sentiment.confidence;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}
