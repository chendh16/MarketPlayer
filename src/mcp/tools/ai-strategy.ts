/**
 * AI策略 MCP 工具
 */

import { predict, batchPredict, getFeatureImportance, Prediction } from '../../strategies/ml-engine';

/**
 * 单股AI预测
 */
export async function ai_predict(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
}): Promise<{ success: boolean; prediction?: Prediction; error?: string }> {
  try {
    const prediction = await predict(params.symbol, params.market);
    
    if (!prediction) {
      return { success: false, error: '预测失败或数据不足' };
    }
    
    return { success: true, prediction };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 批量AI预测
 */
export async function ai_batch_predict(params: {
  symbols: string[];
  market: 'a' | 'hk' | 'us';
}): Promise<{ success: boolean; predictions: Prediction[] }> {
  const predictions = await batchPredict(params.symbols, params.market);
  return { success: true, predictions };
}

/**
 * 特征重要性
 */
export async function get_feature_importance(): Promise<{ success: boolean; features: Array<{ feature: string; importance: number }> }> {
  return { success: true, features: getFeatureImportance() };
}

/**
 * AI策略建议
 */
export async function ai_strategy_advice(params: {
  symbols: string[];
  market: 'a' | 'hk' | 'us';
}): Promise<{ success: boolean; buySignals: Prediction[]; sellSignals: Prediction[]; summary: string }> {
  const predictions = await batchPredict(params.symbols, params.market);
  
  const buySignals = predictions.filter(p => p.signal === 'buy');
  const sellSignals = predictions.filter(p => p.signal === 'sell');
  
  let summary = `AI分析${params.symbols.length}只股票，`;
  summary += `买入信号${buySignals.length}个，卖出信号${sellSignals.length}个`;
  
  if (buySignals.length > 0) {
    summary += `。推荐: ${buySignals.slice(0, 3).map(p => `${p.symbol}(${p.confidence}%)`).join(', ')}`;
  }
  
  return { success: true, buySignals, sellSignals, summary };
}
