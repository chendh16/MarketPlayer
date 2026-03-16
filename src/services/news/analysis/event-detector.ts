/**
 * 事件检测引擎
 * 根据关键词匹配新闻事件类型
 */

import { NewsItem } from '../../../models/signal';

export type EventType = 
  | 'earnings_increase'   // 业绩预增
  | 'earnings_decrease'   // 业绩预减
  | 'policy_benefit'      // 政策利好
  | 'policy_harm'         // 政策利空
  | 'merger_acquisition'  // 并购重组
  | 'risk_alert'          // 风险警示
  | 'management_change'   // 高管变动
  | 'lawsuit_penalty'    // 诉讼处罚
  | 'product_breakthrough' // 产品突破
  | 'normal';             // 普通新闻

export interface DetectedEvent {
  type: EventType;
  sentiment: number;      // -1 ~ 1
  confidence: number;     // 0 ~ 1
  keywords: string[];
  description: string;
}

// 事件模式配置
const EVENT_PATTERNS: Record<EventType, {
  keywords: string[];
  sentiment: number;
  weight: number;
  exclude?: string[];
}> = {
  earnings_increase: {
    keywords: ['预增', '预计增长', '盈利提升', '净利润.*增长', '同比增长', '业绩.*增长', '扭亏为盈', '大幅上升', '上调', '提价', '涨价'],
    sentiment: 0.8,
    weight: 1.0,
  },
  earnings_decrease: {
    keywords: ['预减', '预计下降', '盈利下滑', '净利润.*下降', '同比下降', '业绩.*下滑', '亏损', '大幅下跌'],
    sentiment: -0.8,
    weight: 1.0,
  },
  policy_benefit: {
    keywords: ['政策支持', '政策利好', '补贴', '鼓励', '扶持', '出台.*政策', '获批', '批准.*上市'],
    sentiment: 0.6,
    weight: 0.8,
  },
  policy_harm: {
    keywords: ['政策利空', '监管', '处罚', '整改', '叫停', '限制', '禁止', '严控'],
    sentiment: -0.6,
    weight: 0.8,
  },
  merger_acquisition: {
    keywords: ['并购', '收购', '重组', '资产注入', '定增', '募资', '发行.*购买'],
    sentiment: 0.3,
    weight: 0.7,
  },
  risk_alert: {
    keywords: ['风险警示', '退市风险', '\\bST\\b', '\\*ST', '违规', '调查', '立案', '涉嫌'],
    sentiment: -0.9,
    weight: 1.2,
  },
  management_change: {
    keywords: ['辞职', '离职', '上任', '任命', '董事长.*变动', '高管.*变动', '换届'],
    sentiment: 0,
    weight: 0.5,
  },
  lawsuit_penalty: {
    keywords: ['诉讼', '仲裁', '判决', '罚款', '处罚', '赔偿', '纠纷'],
    sentiment: -0.5,
    weight: 0.8,
  },
  product_breakthrough: {
    keywords: ['突破', '创新', '获批.*临床', '新药.*上市', '技术.*领先', '独家', '专利'],
    sentiment: 0.7,
    weight: 0.7,
  },
  normal: {
    keywords: [],
    sentiment: 0,
    weight: 0.1,
  }
};

/**
 * 检测新闻中的事件类型
 */
export function detectEvent(news: NewsItem | Partial<NewsItem>): DetectedEvent {
  const title = news.title || '';
  const content = news.content || '';
  const text = `${title} ${content}`.toLowerCase();

  // 按优先级检测事件
  const eventTypes: EventType[] = [
    'earnings_increase',
    'earnings_decrease', 
    'risk_alert',
    'policy_benefit',
    'policy_harm',
    'merger_acquisition',
    'product_breakthrough',
    'management_change',
    'lawsuit_penalty',
  ];

  for (const eventType of eventTypes) {
    const config = EVENT_PATTERNS[eventType];
    const matchedKeywords: string[] = [];
    
    for (const keyword of config.keywords) {
      const regex = new RegExp(keyword, 'i');
      if (regex.test(text)) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      // 计算置信度：匹配的关键词越多，置信度越高
      const confidence = Math.min(1, 0.5 + matchedKeywords.length * 0.15);
      
      return {
        type: eventType,
        sentiment: config.sentiment,
        confidence,
        keywords: matchedKeywords,
        description: getEventDescription(eventType, matchedKeywords),
      };
    }
  }

  // 默认返回普通新闻
  return {
    type: 'normal',
    sentiment: 0,
    confidence: 0.1,
    keywords: [],
    description: '普通新闻',
  };
}

/**
 * 获取事件描述
 */
function getEventDescription(type: EventType, keywords: string[]): string {
  const descriptions: Record<EventType, string> = {
    earnings_increase: `检测到业绩预增信号: ${keywords.join(', ')}`,
    earnings_decrease: `检测到业绩预减信号: ${keywords.join(', ')}`,
    policy_benefit: `检测到政策利好: ${keywords.join(', ')}`,
    policy_harm: `检测到政策利空: ${keywords.join(', ')}`,
    merger_acquisition: `检测到并购重组: ${keywords.join(', ')}`,
    risk_alert: `检测到风险警示: ${keywords.join(', ')}`,
    management_change: `检测到高管变动: ${keywords.join(', ')}`,
    lawsuit_penalty: `检测到诉讼处罚: ${keywords.join(', ')}`,
    product_breakthrough: `检测到产品突破: ${keywords.join(', ')}`,
    normal: '普通新闻，无明显事件特征',
  };
  return descriptions[type];
}

/**
 * 批量检测新闻事件
 */
export function detectEvents(newsList: (NewsItem | Partial<NewsItem>)[]): DetectedEvent[] {
  return newsList.map(news => detectEvent(news));
}

/**
 * 获取事件的时间窗口（天）
 */
export function getEventTimeWindow(type: EventType): number {
  const timeWindows: Record<EventType, number> = {
    earnings_increase: 3,
    earnings_decrease: 3,
    risk_alert: 1,
    policy_benefit: 14,
    policy_harm: 7,
    merger_acquisition: 14,
    product_breakthrough: 21,
    management_change: 5,
    lawsuit_penalty: 7,
    normal: 1,
  };
  return timeWindows[type];
}

/**
 * 获取事件的权重
 */
export function getEventWeight(type: EventType): number {
  return EVENT_PATTERNS[type].weight;
}
