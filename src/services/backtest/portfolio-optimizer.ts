/**
 * 策略组合优化器
 * 计算策略相关性并优化仓位配置
 */

export interface StrategyAllocation {
  strategyId: string;
  weight: number;  // 0-1
}

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  diversificationScore: number;
}

export interface CorrelationMatrix {
  [key: string]: {
    [key: string]: number;
  };
}

/**
 * 计算策略收益的相关性
 */
export function calculateCorrelation(returns1: number[], returns2: number[]): number {
  if (returns1.length !== returns2.length || returns1.length === 0) {
    return 0;
  }
  
  const n = returns1.length;
  const mean1 = returns1.reduce((s, v) => s + v, 0) / n;
  const mean2 = returns2.reduce((s, v) => s + v, 0) / n;
  
  let cov = 0;
  let var1 = 0;
  let var2 = 0;
  
  for (let i = 0; i < n; i++) {
    const d1 = returns1[i] - mean1;
    const d2 = returns2[i] - mean2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }
  
  if (var1 === 0 || var2 === 0) return 0;
  
  return cov / Math.sqrt(var1 * var2);
}

/**
 * 构建相关性矩阵
 */
export function buildCorrelationMatrix(
  strategyReturns: Map<string, number[]>
): CorrelationMatrix {
  const symbols = Array.from(strategyReturns.keys());
  const matrix: CorrelationMatrix = {};
  
  for (const s1 of symbols) {
    matrix[s1] = {};
    for (const s2 of symbols) {
      if (s1 === s2) {
        matrix[s1][s2] = 1;
      } else {
        matrix[s1][s2] = calculateCorrelation(
          strategyReturns.get(s1) || [],
          strategyReturns.get(s2) || []
        );
      }
    }
  }
  
  return matrix;
}

/**
 * 简单的等权重配置
 */
export function equalWeightAllocation(strategyIds: string[]): StrategyAllocation[] {
  const weight = 1 / strategyIds.length;
  return strategyIds.map(id => ({ strategyId: id, weight }));
}

/**
 * 基于相关性的风险平价配置
 * 低相关性的策略分配更高权重
 */
export function riskParityAllocation(
  strategyReturns: Map<string, number[]>,
  targetVolatility: number = 0.15
): StrategyAllocation[] {
  const strategyIds = Array.from(strategyReturns.keys());
  if (strategyIds.length === 0) return [];
  
  // 计算每个策略的波动率
  const volatilities: Record<string, number> = {};
  for (const id of strategyIds) {
    const returns = strategyReturns.get(id) || [];
    if (returns.length === 0) {
      volatilities[id] = 0.1;
      continue;
    }
    // 年化波动率
    const std = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252);
    volatilities[id] = std || 0.1;
  }
  
  // 风险平价: 权重与波动率成反比
  let totalInvVol = 0;
  for (const id of strategyIds) {
    totalInvVol += 1 / volatilities[id];
  }
  
  const allocations: StrategyAllocation[] = strategyIds.map(id => ({
    strategyId: id,
    weight: (1 / volatilities[id]) / totalInvVol,
  }));
  
  // 调整到目标波动率
  const currentVol = Math.sqrt(
    allocations.reduce((sum, a) => {
      const vol = volatilities[a.strategyId];
      return sum + (a.weight * vol) ** 2;
    }, 0)
  ) * Math.sqrt(252);
  
  if (currentVol > 0) {
    const scale = targetVolatility / currentVol;
    allocations.forEach(a => a.weight *= scale);
  }
  
  // 归一化
  const total = allocations.reduce((s, a) => s + a.weight, 0);
  allocations.forEach(a => a.weight /= total);
  
  return allocations;
}

/**
 * 优化组合配置 (简化版)
 */
export function optimizePortfolio(
  strategyReturns: Map<string, number[]>,
  riskFreeRate: number = 0.03
): {
  allocations: StrategyAllocation[];
  metrics: PortfolioMetrics;
} {
  const strategyIds = Array.from(strategyReturns.keys());
  
  if (strategyIds.length === 0) {
    return {
      allocations: [],
      metrics: { expectedReturn: 0, volatility: 0, sharpeRatio: 0, maxDrawdown: 0, diversificationScore: 0 },
    };
  }
  
  // 使用风险平价
  const allocations = riskParityAllocation(strategyReturns);
  
  // 计算组合指标
  const metrics = calculatePortfolioMetrics(strategyReturns, allocations, riskFreeRate);
  
  return { allocations, metrics };
}

/**
 * 计算组合指标
 */
export function calculatePortfolioMetrics(
  strategyReturns: Map<string, number[]>,
  allocations: StrategyAllocation[],
  riskFreeRate: number = 0.03
): PortfolioMetrics {
  if (allocations.length === 0 || strategyReturns.size === 0) {
    return { expectedReturn: 0, volatility: 0, sharpeRatio: 0, maxDrawdown: 0, diversificationScore: 0 };
  }
  
  // 日收益序列
  const firstReturns = strategyReturns.values().next().value || [];
  const portfolioReturns: number[] = firstReturns.map(() => 0);
  
  for (const alloc of allocations) {
    const returns = strategyReturns.get(alloc.strategyId) || [];
    for (let i = 0; i < returns.length && i < portfolioReturns.length; i++) {
      portfolioReturns[i] += returns[i] * alloc.weight;
    }
  }
  
  // 预期收益 (年化)
  const avgReturn = portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length;
  const expectedReturn = avgReturn * 252;
  
  // 波动率 (年化)
  const volatility = Math.sqrt(
    portfolioReturns.reduce((s, r) => s + r * r, 0) / portfolioReturns.length
  ) * Math.sqrt(252);
  
  // 夏普比率
  const sharpeRatio = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;
  
  // 最大回撤
  let maxDrawdown = 0;
  let peak = 1;
  let value = 1;
  for (const r of portfolioReturns) {
    value *= 1 + r;
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  // 多样化得分 (基于平均相关性)
  const matrix = buildCorrelationMatrix(strategyReturns);
  let totalCorr = 0;
  let count = 0;
  for (const s1 of Object.keys(matrix)) {
    for (const s2 of Object.keys(matrix)) {
      if (s1 < s2) {
        totalCorr += Math.abs(matrix[s1][s2]);
        count++;
      }
    }
  }
  const avgCorr = count > 0 ? totalCorr / count : 0;
  const diversificationScore = Math.max(0, 100 - avgCorr * 100);
  
  return {
    expectedReturn: Math.round(expectedReturn * 10000) / 100,
    volatility: Math.round(volatility * 10000) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    diversificationScore: Math.round(diversificationScore),
  };
}
