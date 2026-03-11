/**
 * 参数优化引擎
 * 支持网格搜索和并行计算
 */

import { KLine, BacktestResult } from './data-source/types';

export interface OptimizationParams {
  strategy: string;
  paramSpace: Record<string, number[]>;  // 参数空间，如 { period: [7, 14, 21], oversold: [25, 30, 35] }
  market: string;
  symbol: string;
  days: number;
}

export interface OptimizationResult {
  params: Record<string, number>;
  metrics: {
    totalReturn: number;
    annualReturn: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number;
  };
  score: number;
}

/**
 * 网格搜索 - 遍历所有参数组合
 */
export async function gridSearch(
  fn: (params: Record<string, number>) => Promise<BacktestResult>,
  paramSpace: Record<string, number[]>,
  objective: 'return' | 'sharpe' | 'score' = 'score'
): Promise<OptimizationResult[]> {
  const keys = Object.keys(paramSpace);
  const values = Object.values(paramSpace);
  const results: OptimizationResult[] = [];
  
  // 生成所有组合
  function* combinations(index: number): Generator<Record<string, number>> {
    if (index === keys.length) {
      yield {} as Record<string, number>;
      return;
    }
    for (const v of values[index]) {
      for (const partial of combinations(index + 1)) {
        yield { [keys[index]]: v, ...partial };
      }
    }
  }
  
  // 串行执行（可改为并行）
  for (const params of combinations(0)) {
    try {
      const backtestResult = await fn(params);
      const score = calculateScore(backtestResult, objective);
      results.push({
        params,
        metrics: {
          totalReturn: backtestResult.metrics.totalReturn,
          annualReturn: backtestResult.metrics.annualizedReturn,
          maxDrawdown: backtestResult.metrics.maxDrawdown,
          winRate: backtestResult.metrics.winRate,
          sharpeRatio: backtestResult.metrics.sharpeRatio,
        },
        score,
      });
    } catch (e) {
      console.error('参数组合失败:', params, e);
    }
  }
  
  // 按得分排序
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 计算综合得分
 */
function calculateScore(
  result: BacktestResult,
  objective: 'return' | 'sharpe' | 'score'
): number {
  const m = result.metrics;
  if (objective === 'return') {
    return m.totalReturn;
  }
  if (objective === 'sharpe') {
    return m.sharpeRatio || 0;
  }
  
  // 综合评分
  const returnScore = Math.max(0, m.totalReturn) * 1.0;
  const winScore = m.winRate * 0.3;
  const ddScore = Math.max(0, 30 - m.maxDrawdown) * 0.4;  // 回撤越小越好
  const sharpeScore = (m.sharpeRatio || 0) * 0.3;
  
  return returnScore + winScore + ddScore + sharpeScore;
}

/**
 * 并行网格搜索
 */
export async function parallelGridSearch(
  fn: (params: Record<string, number>) => Promise<BacktestResult>,
  paramSpace: Record<string, number[]>,
  concurrency: number = 5
): Promise<OptimizationResult[]> {
  const keys = Object.keys(paramSpace);
  const values = Object.values(paramSpace);
  
  // 生成所有组合
  const allCombinations: Record<string, number>[] = [];
  function* combinations(index: number): Generator<Record<string, number>> {
    if (index === keys.length) {
      yield {} as Record<string, number>;
      return;
    }
    for (const v of values[index]) {
      for (const partial of combinations(index + 1)) {
        yield { [keys[index]]: v, ...partial };
      }
    }
  }
  
  for (const c of combinations(0)) {
    allCombinations.push(c);
  }
  
  // 分批并行执行
  const results: OptimizationResult[] = [];
  for (let i = 0; i < allCombinations.length; i += concurrency) {
    const batch = allCombinations.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (params) => {
        try {
          const result = await fn(params);
          const m = result.metrics;
          return {
            params,
            metrics: {
              totalReturn: m.totalReturn,
              annualReturn: m.annualizedReturn,
              maxDrawdown: m.maxDrawdown,
              winRate: m.winRate,
              sharpeRatio: m.sharpeRatio || 0,
            },
            score: calculateScore(result, 'score'),
          };
        } catch (e) {
          return null;
        }
      })
    );
    
    results.push(...batchResults.filter((r): r is OptimizationResult => r !== null));
  }
  
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 常用参数空间模板
 */
export const ParamSpaceTemplates = {
  RSI: {
    period: [7, 10, 14, 21],
    oversold: [25, 30, 35, 40],
    overbought: [60, 65, 70, 75, 80],
  },
  MA: {
    shortPeriod: [3, 5, 7, 10, 15],
    longPeriod: [20, 30, 50, 100, 150],
  },
  MACD: {
    fast: [8, 12, 16],
    slow: [20, 26, 32],
    signal: [6, 9, 12],
  },
  Bollinger: {
    period: [10, 15, 20, 30],
    stdDev: [1.5, 2.0, 2.5, 3.0],
  },
  Momentum: {
    period: [5, 7, 10, 14, 21],
    threshold: [0.02, 0.03, 0.05, 0.08],
  },
};
