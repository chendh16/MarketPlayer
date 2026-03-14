/**
 * 多模型管理模块
 * 
 * 支持多模型切换和智能选择
 * 兼容现有 AI 服务架构 (src/services/ai/base.ts)
 */

import { logger } from '../utils/logger';
import { AIProvider, AIOptions, AIMessage, AIResponse } from '../services/ai/base';

// ==================== 类型定义 ====================

export type ModelProvider = 'openai' | 'anthropic' | 'local';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  name: string;
  description: string;
  strengths: string[]; // 擅长领域
  contextWindow: number; // 上下文长度
  costPer1KInput: number; // 每1K输入 tokens 成本(美元)
  costPer1KOutput: number; // 每1K输出 tokens 成本(美元)
  enabled: boolean;
}

export interface TaskType {
  type: 'analysis' | 'reasoning' | 'creative' | 'summary' | 'coding';
  description: string;
  preferredModels: string[];
}

// ==================== 模型配置 ====================

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // OpenAI 模型
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    description: '最新多模态模型，能力强速度快',
    strengths: ['analysis', 'reasoning', 'coding'],
    contextWindow: 128000,
    costPer1KInput: 0.005,
    costPer1KOutput: 0.015,
    enabled: true,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: '高性能GPT-4变体',
    strengths: ['analysis', 'reasoning'],
    contextWindow: 128000,
    costPer1KInput: 0.01,
    costPer1KOutput: 0.03,
    enabled: true,
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: '快速低成本，适合简单任务',
    strengths: ['summary', 'simple_analysis'],
    contextWindow: 16385,
    costPer1KInput: 0.0005,
    costPer1KOutput: 0.0015,
    enabled: true,
  },
  
  // Anthropic 模型
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: '性能优秀，编程能力强',
    strengths: ['coding', 'reasoning', 'analysis'],
    contextWindow: 200000,
    costPer1KInput: 0.003,
    costPer1KOutput: 0.015,
    enabled: true,
  },
  'claude-3-opus': {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: '最强大模型，适合复杂推理',
    strengths: ['reasoning', 'complex_analysis', 'creative'],
    contextWindow: 200000,
    costPer1KInput: 0.015,
    costPer1KOutput: 0.075,
    enabled: true,
  },
  'claude-3-haiku': {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: '快速响应，适合简单任务',
    strengths: ['summary', 'simple_analysis'],
    contextWindow: 200000,
    costPer1KInput: 0.00025,
    costPer1KOutput: 0.00125,
    enabled: true,
  },
  
  // 本地/开源模型 (可扩展)
  'qwen-72b': {
    provider: 'local',
    model: 'qwen-72b',
    name: 'Qwen 72B',
    description: '阿里开源大模型，中文能力强',
    strengths: ['analysis', 'chinese'],
    contextWindow: 32768,
    costPer1KInput: 0, // 本地部署无API成本
    costPer1KOutput: 0,
    enabled: false,
  },
  'glm-4': {
    provider: 'local',
    model: 'glm-4',
    name: 'GLM-4',
    description: '智谱AI模型，中文优化',
    strengths: ['chinese', 'analysis'],
    contextWindow: 128000,
    costPer1KInput: 0,
    costPer1KOutput: 0,
    enabled: false,
  },
};

// 任务类型配置
export const TASK_CONFIGS: Record<TaskType['type'], TaskType> = {
  analysis: {
    type: 'analysis',
    description: '金融分析、股票研究',
    preferredModels: ['gpt-4o', 'claude-3-5-sonnet', 'claude-3-opus'],
  },
  reasoning: {
    type: 'reasoning',
    description: '复杂推理、策略制定',
    preferredModels: ['claude-3-opus', 'gpt-4o', 'claude-3-5-sonnet'],
  },
  creative: {
    type: 'creative',
    description: '创意内容、报告撰写',
    preferredModels: ['claude-3-5-sonnet', 'gpt-4o'],
  },
  summary: {
    type: 'summary',
    description: '快速摘要、简短回答',
    preferredModels: ['gpt-3.5-turbo', 'claude-3-haiku', 'gpt-4o'],
  },
  coding: {
    type: 'coding',
    description: '代码生成、技术实现',
    preferredModels: ['claude-3-5-sonnet', 'gpt-4o', 'claude-3-opus'],
  },
};

// ==================== LLM 管理器 ====================

/**
 * LLM 管理器
 * 负责模型选择、成本计算、请求分发
 */
export class LLMManager {
  private providers: Map<ModelProvider, AIProvider>;
  private defaultModel: string;
  private costBudget: number; // 预算(美元)
  private costSpent: number; // 已花费
  
  constructor(config?: {
    defaultModel?: string;
    budget?: number;
  }) {
    this.providers = new Map();
    this.defaultModel = config?.defaultModel || 'gpt-4o';
    this.costBudget = config?.budget || 100; // 默认100美元预算
    this.costSpent = 0;
    
    logger.info(`[LLM] Manager initialized with default model: ${this.defaultModel}`);
  }
  
  /**
   * 注册 AI Provider
   */
  registerProvider(provider: ModelProvider, aiProvider: AIProvider): void {
    this.providers.set(provider, aiProvider);
    logger.info(`[LLM] Registered provider: ${provider}`);
  }
  
  /**
   * 智能选择模型
   */
  selectModel(taskType: TaskType['type'], options?: {
    preferFast?: boolean;
    preferCheap?: boolean;
    preferQuality?: boolean;
  }): string {
    const task = TASK_CONFIGS[taskType];
    const models = task.preferredModels;
    
    // 过滤可用模型
    const available = models.filter(m => MODEL_CONFIGS[m]?.enabled);
    
    if (available.length === 0) {
      logger.warn(`[LLM] No available models for task: ${taskType}, using default`);
      return this.defaultModel;
    }
    
    // 根据选项选择
    if (options?.preferCheap) {
      return this.selectCheapest(available);
    }
    
    if (options?.preferFast) {
      return this.selectFastest(available);
    }
    
    if (options?.preferQuality) {
      return this.selectBest(available);
    }
    
    // 默认：选择第一个可用的高质量模型
    return available[0];
  }
  
  /**
   * 选择最便宜的模型
   */
  private selectCheapest(models: string[]): string {
    return models.reduce((best, current) => {
      const bestCost = MODEL_CONFIGS[best].costPer1KInput;
      const currentCost = MODEL_CONFIGS[current].costPer1KInput;
      return currentCost < bestCost ? current : best;
    }, models[0]);
  }
  
  /**
   * 选择最快的模型
   */
  private selectFastest(models: string[]): string {
    // 简化：选择上下文窗口最小的
    return models.reduce((best, current) => {
      const bestWindow = MODEL_CONFIGS[best].contextWindow;
      const currentWindow = MODEL_CONFIGS[current].contextWindow;
      return currentWindow < bestWindow ? current : best;
    }, models[0]);
  }
  
  /**
   * 选择最好的模型
   */
  private selectBest(models: string[]): string {
    // 简化：选择最贵的
    return models.reduce((best, current) => {
      const bestCost = MODEL_CONFIGS[best].costPer1KInput + MODEL_CONFIGS[best].costPer1KOutput;
      const currentCost = MODEL_CONFIGS[current].costPer1KInput + MODEL_CONFIGS[current].costPer1KOutput;
      return currentCost > bestCost ? current : best;
    }, models[0]);
  }
  
  /**
   * 发送聊天请求
   */
  async chat(
    messages: AIMessage[], 
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      taskType?: TaskType['type'];
    }
  ): Promise<AIResponse> {
    const model = options?.model || this.selectModel(options?.taskType || 'analysis');
    const config = MODEL_CONFIGS[model];
    
    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }
    
    // 检查预算
    if (this.costSpent >= this.costBudget) {
      throw new Error('Cost budget exceeded');
    }
    
    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new Error(`Provider not registered: ${config.provider}`);
    }
    
    logger.info(`[LLM] Using model: ${model} for task type: ${options?.taskType || 'default'}`);
    
    const response = await provider.sendMessage(messages, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    
    // 计算成本
    const cost = this.calculateCost(response.usage.inputTokens, response.usage.outputTokens, model);
    this.costSpent += cost;
    
    logger.info(`[LLM] Cost: $${cost.toFixed(4)}, Total: $${this.costSpent.toFixed(4)}/${this.costBudget}`);
    
    return response;
  }
  
  /**
   * 计算成本
   */
  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const config = MODEL_CONFIGS[model];
    if (!config) return 0;
    
    const inputCost = (inputTokens / 1000) * config.costPer1KInput;
    const outputCost = (outputTokens / 1000) * config.costPer1KOutput;
    
    return inputCost + outputCost;
  }
  
  /**
   * 获取成本状态
   */
  getCostStatus(): {
    budget: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  } {
    return {
      budget: this.costBudget,
      spent: this.costSpent,
      remaining: this.costBudget - this.costSpent,
      percentUsed: (this.costSpent / this.costBudget) * 100,
    };
  }
  
  /**
   * 启用/禁用模型
   */
  setModelEnabled(model: string, enabled: boolean): void {
    if (MODEL_CONFIGS[model]) {
      MODEL_CONFIGS[model].enabled = enabled;
      logger.info(`[LLM] Model ${model} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }
  
  /**
   * 获取可用模型列表
   */
  getAvailableModels(): ModelConfig[] {
    return Object.values(MODEL_CONFIGS).filter(m => m.enabled);
  }
  
  /**
   * 获取模型信息
   */
  getModelInfo(model: string): ModelConfig | undefined {
    return MODEL_CONFIGS[model];
  }
}

// ==================== 单例 ====================

let llmManagerInstance: LLMManager | null = null;

/**
 * 获取 LLM 管理器单例
 */
export function getLLMManager(config?: {
  defaultModel?: string;
  budget?: number;
}): LLMManager {
  if (!llmManagerInstance) {
    llmManagerInstance = new LLMManager(config);
  }
  return llmManagerInstance;
}

/**
 * 快速模型选择（简化版）
 */
export function quickSelectModel(taskType: TaskType['type']): string {
  const manager = getLLMManager();
  return manager.selectModel(taskType);
}
