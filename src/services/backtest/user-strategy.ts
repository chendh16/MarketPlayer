/**
 * 用户策略配置服务
 * 支持自然语言描述策略，转换为策略参数
 */

import { Strategy } from './engine';
import { createStrategy, BuiltInStrategies } from './strategies';

export interface UserStrategyConfig {
  id?: string;
  name: string;
  description: string;  // 自然语言描述
  type: string;         // 策略类型
  params: Record<string, any>;  // 策略参数
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 自然语言策略解析器
 * 将用户的中文描述转换为策略参数
 */
export class NaturalLanguageStrategyParser {
  /**
   * 解析自然语言策略描述
   */
  parse(description: string): { type: string; params: Record<string, any> } {
    const desc = description.toLowerCase();
    
    // 均线交叉策略
    if (desc.includes('均线') || desc.includes('ma') || desc.includes('金叉') || desc.includes('死叉')) {
      const shortPeriod = this.extractNumber(desc, [5, 10, 15, 20], 5);
      const longPeriod = this.extractNumber(desc, [10, 20, 30, 50, 60], 20);
      return {
        type: BuiltInStrategies.MA_CROSSOVER,
        params: { shortPeriod, longPeriod },
      };
    }
    
    // RSI 策略
    if (desc.includes('rsi')) {
      const period = this.extractNumber(desc, [7, 14, 21], 14);
      const oversold = this.extractNumber(desc, [20, 25, 30, 35], 30, true);
      const overbought = this.extractNumber(desc, [65, 70, 75, 80], 70, true);
      return {
        type: BuiltInStrategies.RSI,
        params: { period, oversold, overbought },
      };
    }
    
    // 布林带策略
    if (desc.includes('布林') || desc.includes('bollinger') || desc.includes('bb')) {
      const period = this.extractNumber(desc, [10, 15, 20, 30], 20);
      const stdDev = this.extractNumber(desc, [1.5, 2, 2.5, 3], 2);
      return {
        type: BuiltInStrategies.BOLLINGER,
        params: { period, stdDev },
      };
    }
    
    // 动量策略
    if (desc.includes('动量') || desc.includes('momentum')) {
      const period = this.extractNumber(desc, [5, 10, 15, 20], 10);
      const threshold = this.extractNumber(desc, [0.01, 0.02, 0.03, 0.05], 0.02, true) / 100;
      return {
        type: BuiltInStrategies.MOMENTUM,
        params: { period, threshold },
      };
    }
    
    // 默认返回均线策略
    return {
      type: BuiltInStrategies.MA_CROSSOVER,
      params: { shortPeriod: 5, longPeriod: 20 },
    };
  }
  
  /**
   * 从描述中提取数字
   */
  private extractNumber(
    desc: string, 
    candidates: number[], 
    defaultValue: number,
    allowDecimal = false
  ): number {
    for (const num of candidates) {
      if (desc.includes(String(num))) {
        return num;
      }
    }
    return defaultValue;
  }
}

/**
 * 用户策略服务
 */
export class UserStrategyService {
  private strategies: Map<string, UserStrategyConfig> = new Map();
  
  /**
   * 创建用户策略
   */
  async createStrategy(config: UserStrategyConfig): Promise<Strategy> {
    // 解析自然语言描述
    const parser = new NaturalLanguageStrategyParser();
    const parsed = parser.parse(config.description);
    
    // 合并参数
    const params = { ...parsed.params, ...config.params };
    
    // 创建策略实例
    const strategy = createStrategy(parsed.type, params);
    
    // 保存配置
    const strategyConfig: UserStrategyConfig = {
      ...config,
      type: parsed.type,
      params,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const id = config.id || `strategy_${Date.now()}`;
    this.strategies.set(id, strategyConfig);
    
    return strategy;
  }
  
  /**
   * 获取用户策略列表
   */
  getStrategies(): UserStrategyConfig[] {
    return Array.from(this.strategies.values());
  }
  
  /**
   * 获取策略实例
   */
  getStrategy(id: string): Strategy | null {
    const config = this.strategies.get(id);
    if (!config) return null;
    return createStrategy(config.type, config.params);
  }
  
  /**
   * 更新策略
   */
  async updateStrategy(id: string, updates: Partial<UserStrategyConfig>): Promise<Strategy | null> {
    const existing = this.strategies.get(id);
    if (!existing) return null;
    
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.strategies.set(id, updated);
    
    return createStrategy(updated.type, updated.params);
  }
  
  /**
   * 删除策略
   */
  deleteStrategy(id: string): boolean {
    return this.strategies.delete(id);
  }
}

// 导出单例
export const userStrategyService = new UserStrategyService();
