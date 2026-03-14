/**
 * 舆情分析 MCP 工具
 * 
 * 基于现有 news.ts 扩展，提供情感分析和舆情监控
 * 兼容现有架构
 */

import { logger } from '../../utils/logger';

// ==================== 类型定义 ====================

export interface NewsItem {
  title: string;
  content?: string;
  source?: string;
  pubDate?: string;
  symbols?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  score?: number; // -100 到 +100
}

export interface SentimentResult {
  stockCode: string;
  overall: {
    score: number;      // 综合情感得分 (-100 ~ +100)
    sentiment: 'positive' | 'negative' | 'neutral';
    total: number;
    positive: number;
    negative: number;
    neutral: number;
  };
  keyNews: Array<{
    title: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    impact: 'high' | 'medium' | 'low';
  }>;
  riskAlerts: string[];
  opportunities: string[];
  timestamp: Date;
}

// ==================== 情感分析函数 ====================

/**
 * 简单情感分析（基于关键词）
 * 后续可接入大模型进行深度分析
 */
export function analyzeSentiment(text: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -100 到 +100
  keywords: string[];
} {
  const positiveWords = [
    '上涨', '涨停', '突破', '增长', '盈利', '利好', '增持', '买入', '推荐', '超预期',
    '突破', '创新', '高增长', '业绩', '订单', '合同', '中标', '合作', '扩产', '提价',
    '景气', '复苏', '拐点', '估值修复', '龙头', '竞争优势', '护城河', '市场份额'
  ];
  
  const negativeWords = [
    '下跌', '跌停', '破位', '亏损', '利空', '减持', '卖出', '风险', '不及预期',
    '风险', '违约', '诉讼', '处罚', '造假', '亏损', '业绩下滑', '库存积压', '成本上升',
    '竞争加剧', '需求萎缩', '政策利空', '估值过高', '减持', '解禁', '商誉减值'
  ];
  
  const positiveWordsFound: string[] = [];
  const negativeWordsFound: string[] = [];
  
  for (const word of positiveWords) {
    if (text.includes(word)) positiveWordsFound.push(word);
  }
  
  for (const word of negativeWords) {
    if (text.includes(word)) negativeWordsFound.push(word);
  }
  
  const score = Math.round(
    ((positiveWordsFound.length * 10) - (negativeWordsFound.length * 10)) 
    / Math.max(1, (positiveWordsFound.length + negativeWordsFound.length) / 2)
  );
  
  // 限制在 -100 到 +100
  const normalizedScore = Math.max(-100, Math.min(100, score));
  
  let sentiment: 'positive' | 'negative' | 'neutral';
  if (normalizedScore > 10) sentiment = 'positive';
  else if (normalizedScore < -10) sentiment = 'negative';
  else sentiment = 'neutral';
  
  return {
    sentiment,
    score: normalizedScore,
    keywords: [...positiveWordsFound, ...negativeWordsFound],
  };
}

/**
 * 判断新闻影响程度
 */
export function assessImpact(title: string, content: string): 'high' | 'medium' | 'low' {
  const highImpactKeywords = [
    '业绩', '年报', '季报', '营收', '利润', '涨停', '跌停', '重组', '并购',
    '上市', '退市', 'ST', '*ST', '处罚', '诉讼', '中标', '订单', '合同',
    '定增', '配股', '分红', '送转', '减持', '增持', '回购', '退市'
  ];
  
  const mediumImpactKeywords = [
    '研报', '评级', '目标价', '调研', '会议', '扩产', '开工', '投产',
    '合作', '协议', '专利', '产品', '技术', '突破'
  ];
  
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  for (const keyword of highImpactKeywords) {
    if (text.includes(keyword)) return 'high';
  }
  
  for (const keyword of mediumImpactKeywords) {
    if (text.includes(keyword)) return 'medium';
  }
  
  return 'low';
}

// ==================== 主工具函数 ====================

/**
 * 分析单只股票的舆情
 * 兼容现有 MCP 工具接口
 */
export async function analyze_stock_sentiment(params: {
  stockCode: string;
  stockName?: string;
  days?: number; // 分析最近几天的新闻
}): Promise<SentimentResult> {
  const { stockCode, stockName, days = 7 } = params;
  
  logger.info(`[Sentiment] Analyzing ${stockCode} for last ${days} days`);
  
  // 模拟新闻数据（实际应该调用现有 news 接口）
  const mockNews = generateMockNews(stockCode);
  
  // 分析每条新闻
  const analyzedNews = mockNews.map(news => {
    const text = news.title + ' ' + (news.content || '');
    const { sentiment, score, keywords } = analyzeSentiment(text);
    const impact = assessImpact(news.title, news.content || '');
    
    return {
      ...news,
      sentiment,
      score,
      keywords,
      impact,
    };
  });
  
  // 统计
  const positive = analyzedNews.filter(n => n.sentiment === 'positive').length;
  const negative = analyzedNews.filter(n => n.sentiment === 'negative').length;
  const neutral = analyzedNews.filter(n => n.sentiment === 'neutral').length;
  
  const totalScore = analyzedNews.reduce((sum, n) => sum + n.score, 0);
  const avgScore = Math.round(totalScore / Math.max(1, analyzedNews.length));
  
  // 识别关键新闻（高影响 + 高情感得分）
  const keyNews = analyzedNews
    .filter(n => n.impact === 'high' || Math.abs(n.score) > 30)
    .slice(0, 5)
    .map(n => ({
      title: n.title,
      sentiment: n.sentiment!,
      score: n.score,
      impact: n.impact,
    }));
  
  // 风险提醒
  const riskAlerts = analyzedNews
    .filter(n => n.sentiment === 'negative' && n.impact === 'high')
    .map(n => n.title);
  
  // 机会提示
  const opportunities = analyzedNews
    .filter(n => n.sentiment === 'positive' && n.impact === 'high')
    .map(n => n.title);
  
  return {
    stockCode,
    overall: {
      score: avgScore,
      sentiment: avgScore > 10 ? 'positive' : avgScore < -10 ? 'negative' : 'neutral',
      total: analyzedNews.length,
      positive,
      negative,
      neutral,
    },
    keyNews,
    riskAlerts,
    opportunities,
    timestamp: new Date(),
  };
}

/**
 * 批量分析多只股票的舆情
 */
export async function analyze_batch_sentiment(params: {
  stockCodes: string[];
}): Promise<{
  results: Array<{
    stockCode: string;
    score: number;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  timestamp: Date;
}> {
  const { stockCodes } = params;
  
  const results = await Promise.all(
    stockCodes.map(async (code) => {
      const result = await analyze_stock_sentiment({ stockCode: code });
      return {
        stockCode: code,
        score: result.overall.score,
        sentiment: result.overall.sentiment,
      };
    })
  );
  
  return {
    results,
    timestamp: new Date(),
  };
}

/**
 * 舆情监控预警
 */
export async function get_sentiment_alert(params: {
  stockCodes: string[];
  threshold?: number; // 阈值，超过则预警
}): Promise<{
  alerts: Array<{
    stockCode: string;
    type: 'risk' | 'opportunity';
    message: string;
    score: number;
  }>;
  timestamp: Date;
}> {
  const { stockCodes, threshold = 30 } = params;
  
  const alerts: Array<{
    stockCode: string;
    type: 'risk' | 'opportunity';
    message: string;
    score: number;
  }> = [];
  
  for (const code of stockCodes) {
    const result = await analyze_stock_sentiment({ stockCode: code });
    
    // 负面预警
    if (result.overall.score < -threshold) {
      alerts.push({
        stockCode: code,
        type: 'risk',
        message: `舆情负面，得分${result.overall.score}，${result.riskAlerts[0] || ''}`,
        score: result.overall.score,
      });
    }
    
    // 正面机会
    if (result.overall.score > threshold) {
      alerts.push({
        stockCode: code,
        type: 'opportunity',
        message: `舆情正面，得分${result.overall.score}，${result.opportunities[0] || ''}`,
        score: result.overall.score,
      });
    }
  }
  
  return {
    alerts,
    timestamp: new Date(),
  };
}

// ==================== 模拟数据 ====================

function generateMockNews(stockCode: string): NewsItem[] {
  // 实际项目中应调用现有 news.ts 的 fetch_news
  const templates = [
    { title: '{code}发布年报，净利润同比增长25%', sentiment: 'positive' as const },
    { title: '{code}获得重大订单，合同金额超10亿', sentiment: 'positive' as const },
    { title: '券商上调{cod}评级至买入', sentiment: 'positive' as const },
    { title: '{code}遭遇利空消息，股价承压', sentiment: 'negative' as const },
    { title: '{code}召开业绩说明会', sentiment: 'neutral' as const },
    { title: '机构调研{cod}，关注产能扩张', sentiment: 'neutral' as const },
    { title: '{code}产品价格上涨', sentiment: 'positive' as const },
    { title: '{code}面临诉讼风险', sentiment: 'negative' as const },
  ];
  
  return templates.map((t, i) => ({
    ...t,
    title: t.title.replace('{code}', stockCode),
    source: '东方财富',
    pubDate: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}
