/**
 * RAG 知识库模块
 * 
 * 提供投资知识检索、个股档案、历史信号查询
 * 兼容现有架构，可后续接入向量数据库
 */

import { logger } from '../utils/logger';

// ==================== 类型定义 ====================

export interface Document {
  id: string;
  type: 'knowledge' | 'stock_profile' | 'signal_history' | 'research';
  title: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  content: string;
  score: number; // 相关度得分 0-1
  metadata: Record<string, any>;
}

export interface RAGResponse {
  query: string;
  results: SearchResult[];
  total: number;
  context: string; // 合并的上下文
  timestamp: Date;
}

// ==================== 知识库内容 ====================

// 投资知识库
const KNOWLEDGE_BASE: any[] = [
  {
    id: 'kb001',
    type: 'knowledge',
    title: '如何阅读财务报表',
    content: `
财务报表主要包括资产负债表、利润表、现金流量表。

资产负债表反映企业在特定时点的财务状况。
- 资产：流动资产（现金、应收账款、存货）和非流动资产（固定资产、无形资产）
- 负债：流动负债（应付账款、短期借款）和非流动负债（长期借款）
- 所有者权益：实收资本、资本公积、留存收益

利润表反映企业经营成果。
- 营业收入：销售商品或提供劳务的收入
- 营业成本：生产商品或提供劳务的成本
- 毛利：营业收入减营业成本
- 净利润：毛利减各项费用后的最终利润

现金流量表反映企业现金流入流出情况。
- 经营活动现金流：日常业务产生的现金流
- 投资活动现金流：固定资产投资产生的现金流
- 筹资活动现金流：融资活动产生的现金流
    `,
    metadata: { keywords: ['财务报表', '资产负债表', '利润表', '现金流量表', '财务分析'] },
  },
  {
    id: 'kb002',
    type: 'knowledge',
    title: '估值方法详解',
    content: `
常用的估值方法包括：

1. 市盈率（PE）
- 计算公式：股价 / 每股收益
- 适用范围：盈利稳定的成熟企业
- 优点：简单直观
- 缺点：不适用于亏损企业

2. 市净率（PB）
- 计算公式：股价 / 每股净资产
- 适用范围：银行、保险等重资产企业
- 优点：适用于亏损企业
- 缺点：受会计政策影响大

3. DCF现金流折现
- 预测未来现金流并折现到现值
- 适用范围：适用于所有企业
- 优点：理论基础扎实
- 缺点：参数估计主观性强

4. 股息折现模型
- 适用于高分红企业
- 公式：股票价值 = 股息 / (必要收益率 - 增长率)
    `,
    keywords: ['估值', 'PE', 'PB', 'DCF', '股息折现'],
  },
  {
    id: 'kb003',
    type: 'knowledge',
    title: '技术分析基础',
    content: `
技术分析的三大假设：
1. 价格反映一切信息
2. 价格呈趋势运动
3. 历史会重演

常用技术指标：

移动平均线（MA）
- 5日均线：短期趋势
- 20日均线：中期趋势
- 60日均线：长期趋势
- 金叉：短期上穿长期，买入信号
- 死叉：短期下穿长期，卖出信号

MACD
- DIF线：短期EMA减长期EMA
- DEA线：DIF的EMA
- 金叉：DIF上穿DEA
- 死叉：DIF下穿DEA

RSI相对强弱指标
- 0-100之间波动
- 超买：RSI>70
- 超卖：RSI<30
- 背离：价格创新高但RSI没有创新高，可能反转
    `,
    keywords: ['技术分析', '均线', 'MACD', 'RSI', 'KDJ'],
  },
  {
    id: 'kb004',
    type: 'knowledge',
    title: '风险管理原则',
    content: `
投资风险管理的核心原则：

1. 仓位管理
- 单只股票不超过总仓位的10%
- 同一行业不超过总仓位的30%
- 预留足够现金应对突发情况

2. 止损纪律
- 设定止损点位，一般8-10%
- 严格执行，不犹豫
- 止损后复盘，避免重复犯错

3. 分散投资
- 不同行业分散
- 不同资产类别分散
- 不同市值风格分散

4. 风险控制指标
- 最大回撤：历史最大亏损幅度
- 夏普比率：风险调整后收益
- VaR：特定置信度下的最大损失
    `,
    keywords: ['风险管理', '仓位', '止损', '分散投资', '夏普比率'],
  },
];

// ==================== RAG 引擎 ====================

/**
 * 简单的关键词匹配检索（可后续接入向量数据库）
 */
export class RAGEngine {
  private documents: Document[];
  
  constructor() {
    this.documents = KNOWLEDGE_BASE.map(kb => ({
      ...kb,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    
    logger.info(`[RAG] Initialized with ${this.documents.length} documents`);
  }
  
  /**
   * 添加文档
   */
  addDocument(doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.documents.push({
      ...doc,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    logger.info(`[RAG] Added document: ${id}`);
    return id;
  }
  
  /**
   * 检索知识
   */
  async search(query: string, options?: {
    type?: string;
    limit?: number;
    minScore?: number;
  }): Promise<RAGResponse> {
    const { type, limit = 5, minScore = 0.1 } = options || {};
    
    logger.info(`[RAG] Searching for: ${query}`);
    
    // 简单关键词匹配（可后续换成向量检索）
    const results = this.documents
      .filter(doc => !type || doc.type === type)
      .map(doc => ({
        ...doc,
        score: this.calculateScore(query, doc),
      }))
      .filter(doc => doc.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    // 构建上下文
    const context = results
      .map(r => `【${r.title}】\n${r.content}`)
      .join('\n\n---\n\n');
    
    return {
      query,
      results: results.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content.substring(0, 200) + '...',
        score: r.score,
        metadata: r.metadata,
      })),
      total: results.length,
      context,
      timestamp: new Date(),
    };
  }
  
  /**
   * 计算相关性得分
   */
  private calculateScore(query: string, doc: Document): number {
    const queryLower = query.toLowerCase();
    const contentLower = (doc.content + ' ' + doc.title).toLowerCase();
    
    // 关键词匹配
    const keywords = doc.metadata?.keywords || [];
    let score = 0;
    
    // 标题匹配
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }
    
    // 关键词匹配
    for (const kw of keywords) {
      if (queryLower.includes(kw.toLowerCase())) {
        score += 0.3;
      }
    }
    
    // 内容包含
    if (contentLower.includes(queryLower)) {
      score += 0.2;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * 获取知识库统计
   */
  getStats(): {
    totalDocuments: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    
    for (const doc of this.documents) {
      byType[doc.type] = (byType[doc.type] || 0) + 1;
    }
    
    return {
      totalDocuments: this.documents.length,
      byType,
    };
  }
}

// ==================== 工具函数 ====================

let ragEngineInstance: RAGEngine | null = null;

/**
 * 获取 RAG 引擎单例
 */
export function getRAGEngine(): RAGEngine {
  if (!ragEngineInstance) {
    ragEngineInstance = new RAGEngine();
  }
  return ragEngineInstance;
}

/**
 * 搜索知识库
 */
export async function search_knowledge(params: {
  query: string;
  type?: 'knowledge' | 'stock_profile' | 'signal_history' | 'research';
  limit?: number;
}): Promise<RAGResponse> {
  const engine = getRAGEngine();
  return engine.search(params.query, {
    type: params.type,
    limit: params.limit,
  });
}

/**
 * 获取投资知识
 */
export async function get_investment_knowledge(params: {
  topic: string;
}): Promise<{
  topics: string[];
  content: string;
}> {
  const engine = getRAGEngine();
  const result = await engine.search(params.topic, {
    type: 'knowledge',
    limit: 1,
  });
  
  const topics = engine.getStats().byType.knowledge 
    ? ['财务报表', '估值方法', '技术分析', '风险管理']
    : [];
  
  return {
    topics,
    content: result.context || '未找到相关内容',
  };
}

/**
 * 搜索个股档案
 */
export async function search_stock_profile(params: {
  stockCode: string;
}): Promise<{
  stockCode: string;
  profile?: {
    id: string;
    summary: string;
    lastUpdated: string;
  };
  relatedKnowledge: SearchResult[];
}> {
  const engine = getRAGEngine();
  
  // 搜索相关知识
  const related = await engine.search(params.stockCode, {
    type: 'knowledge',
    limit: 3,
  });
  
  // 简化：返回模拟档案
  return {
    stockCode: params.stockCode,
    profile: {
      id: `profile_${params.stockCode}`,
      summary: `${params.stockCode} 的投资档案`,
      lastUpdated: new Date().toISOString(),
    },
    relatedKnowledge: related.results,
  };
}

/**
 * 添加个股档案
 */
export async function add_stock_profile(params: {
  stockCode: string;
  stockName: string;
  content: string;
  metadata?: Record<string, any>;
}): Promise<{
  success: boolean;
  id: string;
}> {
  const engine = getRAGEngine();
  
  const id = engine.addDocument({
    type: 'stock_profile',
    title: `${params.stockName}(${params.stockCode}) 档案`,
    content: params.content,
    metadata: {
      stockCode: params.stockCode,
      stockName: params.stockName,
      ...params.metadata,
    },
  });
  
  return {
    success: true,
    id,
  };
}

/**
 * 获取知识库统计
 */
export function get_knowledge_stats(): {
  totalDocuments: number;
  byType: Record<string, number>;
} {
  const engine = getRAGEngine();
  return engine.getStats();
}
