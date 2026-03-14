/**
 * Agent 协作层
 * 
 * 借鉴 FinRobot 的多 Agent 架构设计
 * 支持市场分析、基本面分析、技术分析、风控等多 Agent 协作
 */

import { logger } from '../utils/logger';
import { renderCoTPrompt, AnalysisType, AnalysisContext, validateContext } from '../ai/cot';

// ==================== 类型定义 ====================

export type AgentRole = 
  | 'coordinator'   // 协调器
  | 'market_analyst' // 市场分析师
  | 'fundamental_analyst' // 基本面分析师
  | 'technical_analyst'  // 技术分析师
  | 'risk_manager'      // 风控经理
  | 'research_writer';  // 研报撰写

export interface AgentConfig {
  name: string;
  role: AgentRole;
  description: string;
  tools: string[];
  prompt: string;
  llmConfig?: LLMConfig;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentResult {
  role: AgentRole;
  content: string;
  data?: Record<string, any>;
  confidence: number;
  suggestions?: string[];
  risks?: string[];
}

export interface CoordinatedResult {
  summary: string;
  recommendation: 'BUY' | 'HOLD' | 'SELL';
  confidence: number;
  agents: AgentResult[];
  timestamp: Date;
}

// ==================== Agent 定义 ====================

export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  coordinator: {
    name: '投资顾问协调器',
    role: 'coordinator',
    description: '协调各个专业 Agent，综合分析结果',
    tools: [],
    prompt: `你是一位投资顾问协调员，负责整合多位专业分析师的观点，给出最终投资建议。

你需要：
1. 收集市场分析师、基本面分析师、技术分析师、风控经理的分析结果
2. 综合评估各维度观点
3. 给出明确的投资建议（买入/持有/卖出）
4. 说明主要理由和风险提示`,
  },

  market_analyst: {
    name: '市场分析师',
    role: 'market_analyst',
    description: '分析市场整体走势、资金流向、板块轮动',
    tools: ['fetch_realtime_quote', 'fetch_kline', 'get_market_flow'],
    prompt: `你是一位资深的市场分析师，专注于：
- 大盘走势判断
- 板块轮动分析
- 资金流向追踪
- 市场情绪评估

请基于数据给出专业的市场分析。`,
  },

  fundamental_analyst: {
    name: '基本面分析师',
    role: 'fundamental_analyst',
    description: '分析公司财务数据、盈利能力、成长性',
    tools: ['get_financials', 'get_fina_indicator', 'get_announcements'],
    prompt: `你是一位资深的A股基本面分析师，专注于：
- 营收和利润分析
- 盈利能力评估（ROE、毛利率、净利率）
- 成长性判断
- 估值水平（PE、PB）
- 现金流分析

请基于财务数据给出专业的基本面分析。`,
  },

  technical_analyst: {
    name: '技术分析师',
    role: 'technical_analyst',
    description: '分析股票走势形态、技术指标、买卖点',
    tools: ['fetch_kline', 'calculate_ma', 'calculate_macd', 'calculate_rsi'],
    prompt: `你是一位专业的技术分析师，专注于：
- 趋势判断（均线）
- 形态识别（支撑/阻力）
- 动能指标（MACD、RSI、KDJ）
- 成交量分析
- 买卖点建议

请基于K线和技术指标给出专业的技术分析。`,
  },

  risk_manager: {
    name: '风控经理',
    role: 'risk_manager',
    description: '评估投资风险、设置止损策略',
    tools: ['calculate_risk', 'get_position_risk'],
    prompt: `你是一位严谨的风控经理，专注于：
- 市场风险评估
- 流动性风险
- 财务风险
- 仓位管理建议
- 止损策略

请从风险角度给出专业的评估和建议。`,
  },

  research_writer: {
    name: '研报撰写员',
    role: 'research_writer',
    description: '整合各方观点，撰写综合研报',
    tools: ['generate_report'],
    prompt: `你是一位专业的研报撰写员，擅长：
- 整合多维度分析
- 结构化输出
- 专业且易读的写作风格

请将分析结果整理成专业的研究报告。`,
  },
};

// ==================== Agent 实现 ====================

/**
 * 单个 Agent 执行器
 */
class BaseAgent {
  protected config: AgentConfig;
  protected llmClient?: LLMClient;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async execute(input: string, context?: Record<string, any>): Promise<AgentResult> {
    logger.info(`[Agent] Executing ${this.config.name}`);
    
    try {
      // 1. 构建提示词
      const prompt = this.buildPrompt(input, context);
      
      // 2. 调用 LLM（这里简化处理，实际需要接入 LLM 服务）
      const response = await this.callLLM(prompt);
      
      // 3. 解析结果
      const result = this.parseResponse(response);
      
      logger.info(`[Agent] ${this.config.name} completed`);
      
      return {
        role: this.config.role,
        content: result.content,
        data: result.data,
        confidence: result.confidence,
        suggestions: result.suggestions,
        risks: result.risks,
      };
    } catch (error) {
      logger.error(`[Agent] ${this.config.name} error:`, error);
      throw error;
    }
  }

  protected buildPrompt(input: string, context?: Record<string, any>): string {
    let prompt = this.config.prompt;
    
    if (context) {
      // 替换上下文变量
      for (const [key, value] of Object.entries(context)) {
        prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), String(value));
      }
    }
    
    prompt += `\n\n## 分析任务\n${input}`;
    
    return prompt;
  }

  protected async callLLM(prompt: string): Promise<string> {
    // TODO: 接入实际的 LLM 服务
    // 这里模拟返回
    logger.debug(`[Agent] Calling LLM with prompt length: ${prompt.length}`);
    
    // 实际实现需要调用 OpenAI/Claude/本地模型
    throw new Error('LLM client not implemented');
  }

  protected parseResponse(response: string): {
    content: string;
    data?: Record<string, any>;
    confidence: number;
    suggestions?: string[];
    risks?: string[];
  } {
    // 简单解析，实际需要更复杂的 JSON 解析
    return {
      content: response,
      confidence: 75,
    };
  }
}

/**
 * LLM 客户端抽象
 */
interface LLMClient {
  chat(prompt: string, config?: LLMConfig): Promise<string>;
}

/**
 * 市场分析师 Agent
 */
class MarketAnalystAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.market_analyst);
  }

  async analyze(stockCode: string): Promise<AgentResult> {
    return this.execute(`分析 ${stockCode} 的市场表现`, { stock_code: stockCode });
  }
}

/**
 * 基本面分析师 Agent
 */
class FundamentalAnalystAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.fundamental_analyst);
  }

  async analyze(stockCode: string): Promise<AgentResult> {
    return this.execute(`分析 ${stockCode} 的基本面情况`, { stock_code: stockCode });
  }
}

/**
 * 技术分析师 Agent
 */
class TechnicalAnalystAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.technical_analyst);
  }

  async analyze(stockCode: string): Promise<AgentResult> {
    return this.execute(`分析 ${stockCode} 的技术走势`, { stock_code: stockCode });
  }
}

/**
 * 风控经理 Agent
 */
class RiskManagerAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.risk_manager);
  }

  async analyze(stockCode: string, position?: number): Promise<AgentResult> {
    const context = position ? { stock_code: stockCode, position } : { stock_code: stockCode };
    return this.execute(`评估 ${stockCode} 的风险`, context);
  }
}

// ==================== Agent 协调器 ====================

/**
 * Agent 协调器
 * 负责协调多个 Agent 的协作
 */
export class AgentCoordinator {
  private agents: Map<AgentRole, BaseAgent>;
  private mode: 'parallel' | 'sequential';

  constructor(mode: 'parallel' | 'sequential' = 'parallel') {
    this.mode = mode;
    this.agents = new Map();
    
    // 初始化各专业 Agent
    this.agents.set('market_analyst', new MarketAnalystAgent());
    this.agents.set('fundamental_analyst', new FundamentalAnalystAgent());
    this.agents.set('technical_analyst', new TechnicalAnalystAgent());
    this.agents.set('risk_manager', new RiskManagerAgent());
  }

  /**
   * 综合分析股票
   */
  async analyzeComprehensive(stockCode: string, stockName?: string): Promise<CoordinatedResult> {
    logger.info(`[Coordinator] Starting comprehensive analysis for ${stockCode}`);
    
    const context = { stock_code: stockCode, stock_name: stockName || stockCode };
    const results: AgentResult[] = [];
    
    if (this.mode === 'parallel') {
      // 并行执行所有 Agent
      const promises = [
        this.agents.get('market_analyst')!.execute('进行市场分析', context),
        this.agents.get('fundamental_analyst')!.execute('进行基本面分析', context),
        this.agents.get('technical_analyst')!.execute('进行技术分析', context),
        this.agents.get('risk_manager')!.execute('进行风险评估', context),
      ];
      
      const settled = await Promise.allSettled(promises);
      
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.warn(`[Coordinator] Agent ${index} failed:`, result.reason);
        }
      });
    } else {
      // 串行执行
      for (const [role, agent] of this.agents) {
        try {
          const result = await agent.execute(`进行${AGENT_CONFIGS[role].name}分析`, context);
          results.push(result);
        } catch (error) {
          logger.warn(`[Coordinator] Agent ${role} failed:`, error);
        }
      }
    }
    
    // 综合结论
    const summary = this.generateSummary(results);
    const recommendation = this.deriveRecommendation(results);
    const confidence = this.calculateConfidence(results);
    
    return {
      summary,
      recommendation,
      confidence,
      agents: results,
      timestamp: new Date(),
    };
  }

  /**
   * 快速分析（仅技术面）
   */
  async analyzeQuick(stockCode: string): Promise<AgentResult> {
    return this.agents.get('technical_analyst')!.execute('快速技术分析', { stock_code: stockCode });
  }

  /**
   * 深度分析（基本面 + 风险）
   */
  async analyzeDeep(stockCode: string): Promise<AgentResult[]> {
    const context = { stock_code: stockCode };
    
    const results = await Promise.all([
      this.agents.get('fundamental_analyst')!.execute('深度基本面分析', context),
      this.agents.get('risk_manager')!.execute('深度风险评估', context),
    ]);
    
    return results;
  }

  /**
   * 生成综合摘要
   */
  private generateSummary(results: AgentResult[]): string {
    // 简化实现：拼接各 Agent 结论
    const summaries = results.map(r => r.content.split('\n')[0]).filter(Boolean);
    return summaries.join('；');
  }

  /**
   * 推导投资建议
   */
  private deriveRecommendation(results: AgentResult[]): 'BUY' | 'HOLD' | 'SELL' {
    const scores = results.map(r => {
      const content = r.content.toLowerCase();
      if (content.includes('买入') || content.includes('buy') || content.includes('看涨')) return 1;
      if (content.includes('卖出') || content.includes('sell') || content.includes('看跌')) return -1;
      return 0;
    });
    
    const total = scores.reduce<number>((a, b) => a + b, 0);
    
    if (total > 0) return 'BUY';
    if (total < 0) return 'SELL';
    return 'HOLD';
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(results: AgentResult[]): number {
    const confidences = results.map(r => r.confidence);
    if (confidences.length === 0) return 0;
    
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    return Math.round(avg);
  }

  /**
   * 注册自定义 Agent
   */
  registerAgent(role: AgentRole, agent: BaseAgent): void {
    this.agents.set(role, agent);
    logger.info(`[Coordinator] Registered agent: ${role}`);
  }

  /**
   * 获取指定 Agent
   */
  getAgent(role: AgentRole): BaseAgent | undefined {
    return this.agents.get(role);
  }
}

// ==================== 导出 ====================

export function createCoordinator(mode?: 'parallel' | 'sequential'): AgentCoordinator {
  return new AgentCoordinator(mode);
}

export { BaseAgent };
