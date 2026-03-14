/**
 * 止损止盈 MCP 工具
 */

import { logger } from '../../utils/logger';
import { 
  setStopConfig, 
  getStopConfig, 
  getAllStopConfigs,
  checkStop,
  removeStopConfig,
  StopConfig 
} from '../../services/risk/stop-loss';

/**
 * 设置止损止盈
 */
export async function set_stop_config(params: {
  symbol: string;
  market: 'a' | 'us' | 'hk';
  entryPrice: number;
  quantity: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStop?: number;
  enabled?: boolean;
}): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info(`[MCP] set_stop_config ${params.symbol}`);
  
  const config: StopConfig = {
    symbol: params.symbol,
    market: params.market,
    entryPrice: params.entryPrice,
    quantity: params.quantity,
    stopLossPercent: params.stopLossPercent,
    takeProfitPercent: params.takeProfitPercent,
    trailingStop: params.trailingStop,
    enabled: params.enabled ?? true,
  };
  
  setStopConfig(config);
  
  return {
    success: true,
    message: `已设置 ${params.symbol} 止损${params.stopLossPercent}% 止盈${params.takeProfitPercent}%`,
  };
}

/**
 * 获取止损止盈配置
 */
export async function get_stop_config(params: {
  symbol: string;
  market: 'a' | 'us' | 'hk';
}): Promise<{
  success: boolean;
  config?: StopConfig;
}> {
  const { symbol, market } = params;
  const config = getStopConfig(symbol, market);
  
  return {
    success: true,
    config,
  };
}

/**
 * 获取所有止损止盈配置
 */
export async function get_all_stop_configs(): Promise<{
  success: boolean;
  configs: StopConfig[];
}> {
  return {
    success: true,
    configs: getAllStopConfigs(),
  };
}

/**
 * 移除止损止盈
 */
export async function remove_stop_config(params: {
  symbol: string;
  market: 'a' | 'us' | 'hk';
}): Promise<{
  success: boolean;
  message: string;
}> {
  const { symbol, market } = params;
  const removed = removeStopConfig(symbol, market);
  
  return {
    success: removed,
    message: removed ? `已移除 ${symbol}` : '配置不存在',
  };
}

/**
 * 检查是否触发
 */
export async function check_stop_triggered(params: {
  symbol: string;
  market: 'a' | 'us' | 'hk';
  currentPrice: number;
}): Promise<{
  success: boolean;
  triggered: boolean;
  type?: string;
  message?: string;
  profit?: number;
  profitPercent?: number;
}> {
  const { symbol, market, currentPrice } = params;
  
  const result = await checkStop(symbol, market, currentPrice);
  
  return {
    success: true,
    triggered: result.triggered,
    type: result.type ?? undefined,
    message: result.message,
    profit: result.profit,
    profitPercent: result.profitPercent,
  };
}
