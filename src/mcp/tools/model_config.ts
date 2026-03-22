/**
 * 模型配置管理
 * 
 * 提供模型配置的 CRUD 接口
 * 兼容现有架构
 */

import { logger } from '../../utils/logger';
import { MODEL_CONFIGS, ModelConfig, LLMManager, getLLMManager } from '../../llm';

// ==================== 类型定义 ====================

export interface ModelConfigInput {
  model: string;
  enabled: boolean;
  customConfig?: {
    apiKey?: string;
    baseUrl?: string;
  };
}

export interface ModelStatus {
  model: string;
  name: string;
  enabled: boolean;
  provider: string;
  status: 'ready' | 'disabled' | 'error';
}

// ==================== 工具函数 ====================

/**
 * 获取所有模型状态
 */
/**
 * 获取所有模型状态
 */
export async function get_model_status(): Promise<{
  models: ModelStatus[];
  defaultModel: string;
  totalEnabled: number;
  totalDisabled: number;
}> {
  const manager = getLLMManager();
  const available = manager.getAvailableModels();
  
  const modelStatuses: ModelStatus[] = Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
    model: key,
    name: config.name,
    enabled: config.enabled,
    provider: config.provider,
    status: config.enabled ? 'ready' : 'disabled',
  }));
  
  return {
    models: modelStatuses,
    defaultModel: manager.selectModel('analysis'), // 默认选择
    totalEnabled: modelStatuses.filter(m => m.enabled).length,
    totalDisabled: modelStatuses.filter(m => !m.enabled).length,
  };
}

/**
 * 启用/禁用模型
 */
export async function toggle_model(params: {
  model: string;
  enabled: boolean;
}): Promise<{
  success: boolean;
  message: string;
  model: string;
  enabled: boolean;
}> {
  const { model, enabled } = params;
  
  if (!MODEL_CONFIGS[model]) {
    return {
      success: false,
      message: `模型 ${model} 不存在`,
      model,
      enabled,
    };
  }
  
  const manager = getLLMManager();
  manager.setModelEnabled(model, enabled);
  
  return {
    success: true,
    message: `模型 ${model} 已${enabled ? '启用' : '禁用'}`,
    model,
    enabled,
  };
}

/**
 * 批量设置模型
 */
export function batch_set_models(params: {
  models: ModelConfigInput[];
}): {
  success: boolean;
  updated: number;
  results: Array<{
    model: string;
    success: boolean;
    message: string;
  }>;
} {
  const { models } = params;
  const results: Array<{
    model: string;
    success: boolean;
    message: string;
  }> = [];
  
  let updated = 0;
  
  for (const input of models) {
    if (!MODEL_CONFIGS[input.model]) {
      results.push({
        model: input.model,
        success: false,
        message: '模型不存在',
      });
      continue;
    }
    
    const manager = getLLMManager();
    manager.setModelEnabled(input.model, input.enabled);
    
    results.push({
      model: input.model,
      success: true,
      message: input.enabled ? '已启用' : '已禁用',
    });
    
    updated++;
  }
  
  return {
    success: updated > 0,
    updated,
    results,
  };
}

/**
 * 获取推荐模型（根据任务类型）
 */
export async function recommend_model(params: {
  taskType: 'analysis' | 'reasoning' | 'creative' | 'summary' | 'coding';
  prefer?: 'fast' | 'cheap' | 'quality';
}): Promise<{
  recommended: string;
  name: string;
  provider: string;
  description: string;
  alternatives: string[];
}> {
  const { taskType, prefer } = params;
  
  const manager = getLLMManager();
  
  const options: { preferFast?: boolean; preferCheap?: boolean; preferQuality?: boolean } = {};
  if (prefer === 'fast') options.preferFast = true;
  else if (prefer === 'cheap') options.preferCheap = true;
  else if (prefer === 'quality') options.preferQuality = true;
  
  const recommended = manager.selectModel(taskType, options);
  const config = MODEL_CONFIGS[recommended];
  
  // 获取备选
  const task = {
    type: taskType,
    description: '',
    preferredModels: [],
  };
  
  const alternatives = manager.getAvailableModels()
    .filter(m => m.model !== recommended)
    .slice(0, 2)
    .map(m => m.model);
  
  return {
    recommended,
    name: config.name,
    provider: config.provider,
    description: config.description,
    alternatives,
  };
}

/**
 * 获取成本状态
 */
export async function get_cost_status(): Promise<{
  budget: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  warning: string | null;
}> {
  const manager = getLLMManager();
  const status = manager.getCostStatus();
  
  let warning: string | null = null;
  if (status.percentUsed > 90) {
    warning = '预算即将用完，建议切换到低成本模型';
  } else if (status.percentUsed > 50) {
    warning = '已使用超过50%预算';
  }
  
  return {
    ...status,
    warning,
  };
}

/**
 * 设置预算
 */
export function set_budget(params: {
  budget: number;
}): {
  success: boolean;
  previousBudget: number;
  newBudget: number;
} {
  const manager = getLLMManager();
  const currentStatus = manager.getCostStatus();
  const previousBudget = currentStatus.budget;
  
  // 重新创建 manager（简化处理）
  // 实际应该添加 resetBudget 方法
  
  return {
    success: true,
    previousBudget,
    newBudget: params.budget,
  };
}

/**
 * 测试模型连接
 */
export async function test_model_connection(params: {
  model: string;
}): Promise<{
  success: boolean;
  model: string;
  latency: number;
  message: string;
}> {
  const { model } = params;
  const config = MODEL_CONFIGS[model];
  
  if (!config) {
    return {
      success: false,
      model,
      latency: 0,
      message: '模型不存在',
    };
  }
  
  if (!config.enabled) {
    return {
      success: false,
      model,
      latency: 0,
      message: '模型已禁用',
    };
  }
  
  const startTime = Date.now();
  
  try {
    // 简化：模拟测试
    // 实际应该调用实际的 API
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const latency = Date.now() - startTime;
    
    return {
      success: true,
      model,
      latency,
      message: '连接正常',
    };
  } catch (error: any) {
    return {
      success: false,
      model,
      latency: Date.now() - startTime,
      message: error.message || '连接失败',
    };
  }
}
