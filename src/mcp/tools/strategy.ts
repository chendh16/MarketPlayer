/**
 * 量化策略 MCP 工具
 */

import { logger } from '../../utils/logger';
import { 
  maStrategy, 
  rsiStrategy, 
  breakoutStrategy, 
  momentumStrategy,
  combinedStrategy,
  scanSymbols,
  StrategySignal 
} from '../../strategies/quant-engine';

/**
 * 运行策略
 */
export async function run_strategy(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  strategy?: 'ma' | 'rsi' | 'breakout' | 'momentum' | 'combined';
}): Promise<{
  success: boolean;
  signal?: StrategySignal;
  error?: string;
}> {
  const { symbol, market, strategy = 'combined' } = params;
  logger.info(`[MCP] run_strategy ${symbol} ${strategy}`);
  
  try {
    let signal: StrategySignal;
    
    switch (strategy) {
      case 'ma':
        signal = await maStrategy({ symbol, market });
        break;
      case 'rsi':
        signal = await rsiStrategy({ symbol, market });
        break;
      case 'breakout':
        signal = await breakoutStrategy({ symbol, market });
        break;
      case 'momentum':
        signal = await momentumStrategy({ symbol, market });
        break;
      default:
        signal = await combinedStrategy({ symbol, market });
    }
    
    return { success: true, signal };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 批量扫描
 */
export async function scan_market(params: {
  symbols: string[];
  market: 'a' | 'hk' | 'us';
}): Promise<{
  success: boolean;
  signals: StrategySignal[];
}> {
  const { symbols, market } = params;
  logger.info(`[MCP] scan_market ${symbols.length} ${market}`);
  
  const signals = await scanSymbols(symbols, market);
  
  return { success: true, signals };
}

/**
 * 获取策略建议
 */
export async function get_strategy_advice(params: {
  symbols: string[];
  market: 'a' | 'hk' | 'us';
}): Promise<{
  success: boolean;
  buySignals: StrategySignal[];
  sellSignals: StrategySignal[];
  summary: string;
}> {
  const { symbols, market } = params;
  
  const signals = await scanSymbols(symbols, market);
  
  const buySignals = signals.filter(s => s.signal === 'buy');
  const sellSignals = signals.filter(s => s.signal === 'sell');
  
  let summary = `扫描${symbols.length}只股票，`;
  summary += `买入信号${buySignals.length}个，卖出信号${sellSignals.length}个`;
  
  if (buySignals.length > 0) {
    summary += `。重点关注: ${buySignals.slice(0, 3).map(s => s.symbol).join(', ')}`;
  }
  
  return { success: true, buySignals, sellSignals, summary };
}
