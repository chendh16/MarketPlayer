/**
 * 回测 MCP 工具
 */

import { runBacktest, batchBacktest, BacktestResult } from '../../strategies/backtest-engine';

/**
 * 运行单次回测
 */
export async function run_single_backtest(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  strategy: 'ma' | 'rsi' | 'breakout';
  initialCapital?: number;
}): Promise<{ success: boolean; result?: BacktestResult; error?: string }> {
  try {
    const result = await runBacktest(params);
    
    if (!result) {
      return { success: false, error: '回测失败或数据不足' };
    }
    
    return { success: true, result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 批量回测
 */
export async function run_batch_backtest(params: {
  symbols: string[];
  market: 'a' | 'hk' | 'us';
  strategy: 'ma' | 'rsi' | 'breakout';
}): Promise<{ success: boolean; results: BacktestResult[] }> {
  const results = await batchBacktest(params.symbols, params.market, params.strategy);
  
  return { success: true, results };
}

/**
 * 比较策略
 */
export async function compare_strategies(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
}): Promise<{ success: boolean; results: BacktestResult[] }> {
  const strategies: Array<'ma' | 'rsi' | 'breakout'> = ['ma', 'rsi', 'breakout'];
  const results: BacktestResult[] = [];
  
  for (const strategy of strategies) {
    const result = await runBacktest({ symbol: params.symbol, market: params.market, strategy });
    if (result) results.push(result);
  }
  
  // 按收益排序
  results.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
  
  return { success: true, results };
}
