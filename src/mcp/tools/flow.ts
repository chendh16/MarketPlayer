/**
 * 资金流向 MCP 工具
 */

import { logger } from '../../utils/logger';
import { getStockFlow, getNorthBoundData, getBatchFlow, FlowData, NorthBoundData } from '../../services/market/flow-service';

/**
 * 获取个股资金流向
 */
export async function get_stock_flow(params: {
  symbol: string;
  market: 'a' | 'hk';
}): Promise<{
  success: boolean;
  data?: FlowData;
  error?: string;
}> {
  const { symbol, market } = params;
  logger.info(`[MCP] get_stock_flow ${symbol} ${market}`);
  
  try {
    const data = await getStockFlow(symbol, market);
    
    if (!data) {
      return { success: false, error: '无法获取资金流向数据' };
    }
    
    return { success: true, data };
  } catch (error: any) {
    logger.error('[MCP] get_stock_flow error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 批量获取资金流向
 */
export async function get_batch_stock_flow(params: {
  symbols: string[];
  market: 'a' | 'hk';
}): Promise<{
  success: boolean;
  data: FlowData[];
  errors: string[];
}> {
  const { symbols, market } = params;
  logger.info(`[MCP] get_batch_stock_flow ${symbols.length} ${market}`);
  
  const data = await getBatchFlow(symbols, market);
  
  return {
    success: data.length > 0,
    data,
    errors: symbols.filter(s => !data.find(d => d.symbol === s)),
  };
}

/**
 * 获取北向资金数据
 */
export async function get_north_bound_flow(): Promise<{
  success: boolean;
  data?: NorthBoundData[];
  error?: string;
}> {
  logger.info('[MCP] get_north_bound_flow');
  
  try {
    const data = await getNorthBoundData();
    
    return { success: true, data };
  } catch (error: any) {
    logger.error('[MCP] get_north_bound_flow error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 资金流向分析
 */
export async function analyze_flow(params: {
  symbol: string;
  market: 'a' | 'hk';
}): Promise<{
  success: boolean;
  analysis?: {
    direction: 'inflow' | 'outflow' | 'neutral';
    strength: 'strong' | 'medium' | 'weak';
    mainForce: boolean;
    recommendation: string;
  };
  error?: string;
}> {
  const { symbol, market } = params;
  
  const result = await getStockFlow(symbol, market);
  
  if (!result) {
    return { success: false, error: '无法获取数据' };
  }
  
  const { mainNetInflow, mainNetInflowPct } = result;
  
  // 分析逻辑
  let direction: 'inflow' | 'outflow' | 'neutral' = 'neutral';
  let strength: 'strong' | 'medium' | 'weak' = 'weak';
  let mainForce = false;
  let recommendation = '观望';
  
  if (mainNetInflow > 0) {
    direction = 'inflow';
    if (mainNetInflowPct > 5) {
      strength = 'strong';
      mainForce = true;
      recommendation = '主力净流入，关注';
    } else if (mainNetInflowPct > 2) {
      strength = 'medium';
      recommendation = '温和流入';
    } else {
      recommendation = '小幅流入';
    }
  } else if (mainNetInflow < 0) {
    direction = 'outflow';
    if (mainNetInflowPct < -5) {
      strength = 'strong';
      recommendation = '主力净流出，注意风险';
    } else {
      recommendation = '小幅流出';
    }
  }
  
  return {
    success: true,
    analysis: { direction, strength, mainForce, recommendation },
  };
}
