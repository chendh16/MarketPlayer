/**
 * 止损止盈服务
 * 
 * 支持虚拟盘和实盘的止损止盈管理
 */

import { logger } from '../../utils/logger';

export interface StopConfig {
  symbol: string;
  market: 'a' | 'us' | 'hk';
  entryPrice: number;    // 入场价格
  quantity: number;      // 持仓数量
  stopLossPercent: number;  // 止损比例 (如 3%)
  takeProfitPercent: number; // 止盈比例 (如 10%)
  trailingStop?: number;   // 追踪止损比例
  enabled: boolean;
}

export interface StopResult {
  triggered: boolean;
  type: 'stop_loss' | 'take_profit' | 'trailing_stop' | null;
  currentPrice: number;
  exitPrice: number;
  profit: number;
  profitPercent: number;
  message: string;
}

// 存储配置
const stopConfigs: Map<string, StopConfig> = new Map();

/**
 * 设置止损止盈
 */
export function setStopConfig(config: StopConfig): void {
  const key = `${config.market}-${config.symbol}`;
  stopConfigs.set(key, config);
  logger.info(`[Stop] 设置止损止盈: ${config.symbol} 止损${config.stopLossPercent}% 止盈${config.takeProfitPercent}%`);
}

/**
 * 获取配置
 */
export function getStopConfig(symbol: string, market: string): StopConfig | undefined {
  return stopConfigs.get(`${market}-${symbol}`);
}

/**
 * 移除配置
 */
export function removeStopConfig(symbol: string, market: string): boolean {
  return stopConfigs.delete(`${market}-${symbol}`);
}

/**
 * 获取所有配置
 */
export function getAllStopConfigs(): StopConfig[] {
  return Array.from(stopConfigs.values());
}

/**
 * 检查是否触发止损止盈
 */
export async function checkStop(
  symbol: string,
  market: string,
  currentPrice: number
): Promise<StopResult> {
  const config = getStopConfig(symbol, market);
  
  if (!config || !config.enabled) {
    return {
      triggered: false,
      type: null,
      currentPrice,
      exitPrice: 0,
      profit: 0,
      profitPercent: 0,
      message: '未设置止损止盈',
    };
  }
  
  const { entryPrice, quantity, stopLossPercent, takeProfitPercent, trailingStop } = config;
  
  // 计算盈亏
  const profit = (currentPrice - entryPrice) * quantity;
  const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  
  // 1. 检查止盈
  if (profitPercent >= takeProfitPercent) {
    const exitPrice = entryPrice * (1 + takeProfitPercent / 100);
    
    logger.info(`[Stop] ${symbol} 触发止盈! 价格: ${currentPrice}, 止盈点: ${exitPrice}`);
    
    return {
      triggered: true,
      type: 'take_profit',
      currentPrice,
      exitPrice,
      profit: (exitPrice - entryPrice) * quantity,
      profitPercent: takeProfitPercent,
      message: `触发止盈 ${takeProfitPercent}%`,
    };
  }
  
  // 2. 检查止损
  if (profitPercent <= -stopLossPercent) {
    const exitPrice = entryPrice * (1 - stopLossPercent / 100);
    
    logger.info(`[Stop] ${symbol} 触发止损! 价格: ${currentPrice}, 止损点: ${exitPrice}`);
    
    return {
      triggered: true,
      type: 'stop_loss',
      currentPrice,
      exitPrice,
      profit: (exitPrice - entryPrice) * quantity,
      profitPercent: -stopLossPercent,
      message: `触发止损 -${stopLossPercent}%`,
    };
  }
  
  // 3. 追踪止损 (简化版: 价格上涨后，回撤超过比例)
  if (trailingStop && currentPrice > entryPrice) {
    const highWaterMark = currentPrice; // 简化: 假设当前为最高
    const drawdown = ((highWaterMark - currentPrice) / highWaterMark) * 100;
    
    if (drawdown >= trailingStop) {
      logger.info(`[Stop] ${symbol} 触发追踪止损! 回撤: ${drawdown}%`);
      
      return {
        triggered: true,
        type: 'trailing_stop',
        currentPrice,
        exitPrice: currentPrice,
        profit: profit,
        profitPercent,
        message: `触发追踪止损 -${trailingStop}%`,
      };
    }
  }
  
  return {
    triggered: false,
    type: null,
    currentPrice,
    exitPrice: 0,
    profit,
    profitPercent,
    message: `未触发 (当前${profitPercent.toFixed(2)}%)`,
  };
}

/**
 * 批量检查
 */
export async function checkAllStops(
  prices: Map<string, number>
): Promise<StopResult[]> {
  const results: StopResult[] = [];
  
  for (const [key, price] of prices) {
    const [market, symbol] = key.split('-');
    const result = await checkStop(symbol, market, price);
    if (result.triggered) {
      results.push(result);
    }
  }
  
  return results;
}
