/**
 * 风险指标 MCP 工具
 * 
 * 提供风险评估相关指标计算
 */

import { logger } from '../../utils/logger';

// ==================== 类型定义 ====================

export interface RiskMetrics {
  // 市场风险
  volatility: number;        // 波动率 (%)
  beta: number;             // Beta系数
  maxDrawdown: number;       // 最大回撤 (%)
  
  // 流动性风险
  avgVolume: number;         // 日均成交量
  volumeRatio: number;       // 量比
  turnoverRate: number;      // 换手率 (%)
  
  // 财务风险
  debtRatio: number;         // 资产负债率 (%)
  currentRatio: number;      // 流动比率
  quickRatio: number;       // 速动比率
  
  // 综合风险
  var95: number;            // VaR (95%置信度)
  var99: number;            // VaR (99%置信度)
  sharpeRatio: number;      // 夏普比率
  sortinoRatio: number;     // 索提诺比率
  
  // 风险评级
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  riskScore: number;         // 综合风险评分 (0-100)
}

/**
 * 风险评级结果
 */
export interface RiskAssessment {
  stockCode: string;
  stockName: string;
  metrics: RiskMetrics;
  riskFactors: Array<{
    category: string;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
  }>;
  recommendations: string[];
  timestamp: Date;
}

// ==================== 计算函数 ====================

/**
 * 计算历史波动率
 */
export function calculateVolatility(prices: number[], periods = 20): number {
  if (prices.length < periods + 1) return 0;
  
  // 计算日收益率
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  // 取最近 periods 个
  const recentReturns = returns.slice(-periods);
  
  // 计算标准差
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const variance = recentReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentReturns.length;
  const stdDev = Math.sqrt(variance);
  
  // 年化波动率 (假设250交易日)
  const annualVolatility = stdDev * Math.sqrt(250) * 100;
  
  return Math.round(annualVolatility * 100) / 100;
}

/**
 * 计算最大回撤
 */
export function calculateMaxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  let maxDrawdown = 0;
  let peak = prices[0];
  
  for (const price of prices) {
    if (price > peak) {
      peak = price;
    }
    const drawdown = (peak - price) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return Math.round(maxDrawdown * 10000) / 100; // 转为百分比
}

/**
 * 计算 Beta 系数
 * 
 * @param stockReturns 股票收益率数组
 * @param marketReturns 市场收益率数组
 */
export function calculateBeta(stockReturns: number[], marketReturns: number[]): number {
  if (stockReturns.length !== marketReturns.length || stockReturns.length < 10) {
    return 1.0; // 默认值
  }
  
  // 计算均值
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
  
  // 计算协方差和方差
  let covariance = 0;
  let marketVariance = 0;
  
  for (let i = 0; i < stockReturns.length; i++) {
    covariance += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
    marketVariance += Math.pow(marketReturns[i] - marketMean, 2);
  }
  
  if (marketVariance === 0) return 1.0;
  
  return Math.round((covariance / marketVariance) * 100) / 100;
}

/**
 * 计算 VaR (Value at Risk)
 */
export function calculateVaR(
  prices: number[],
  confidence: 95 | 99 = 95
): number {
  if (prices.length < 30) return 0;
  
  // 计算收益率
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  // 排序
  returns.sort((a, b) => a - b);
  
  // 计算 VaR
  const index = Math.floor(returns.length * (1 - confidence / 100));
  const varValue = Math.abs(returns[index] || 0) * 100;
  
  return Math.round(varValue * 100) / 100;
}

/**
 * 计算夏普比率
 */
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate = 0.03 // 无风险利率 3%
): number {
  if (returns.length < 30) return 0;
  
  // 计算平均收益率
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // 年化
  const annualReturn = avgReturn * 250;
  
  // 计算标准差
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance) * Math.sqrt(250);
  
  if (stdDev === 0) return 0;
  
  // 夏普比率
  const sharpe = (annualReturn - riskFreeRate) / stdDev;
  
  return Math.round(sharpe * 100) / 100;
}

/**
 * 计算索提诺比率 (只考虑下行波动)
 */
export function calculateSortinoRatio(
  returns: number[],
  riskFreeRate = 0.03,
  targetReturn = 0
): number {
  if (returns.length < 30) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualReturn = avgReturn * 250;
  
  // 只考虑下行偏差
  const downsideReturns = returns.filter(r => r < targetReturn);
  
  if (downsideReturns.length === 0) return 0;
  
  const downsideVariance = downsideReturns.reduce(
    (a, b) => a + Math.pow(b - targetReturn, 2), 0
  ) / downsideReturns.length;
  
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(250);
  
  if (downsideDeviation === 0) return 0;
  
  const sortino = (annualReturn - riskFreeRate) / downsideDeviation;
  
  return Math.round(sortino * 100) / 100;
}

/**
 * 综合风险评估
 */
export async function calculate_risk(params: {
  stockCode: string;
  stockName: string;
  prices: number[];
  marketPrices?: number[];
  volume: number;
  avgVolume20: number;
  debtRatio?: number;
  currentRatio?: number;
}): Promise<RiskAssessment> {
  const { stockCode, stockName, prices, marketPrices, volume, avgVolume20, debtRatio = 50, currentRatio = 1.5 } = params;
  
  logger.info(`[Risk] Calculating risk for ${stockCode}`);
  
  // 计算收益率
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  // 波动率
  const volatility = calculateVolatility(prices);
  
  // 最大回撤
  const maxDrawdown = calculateMaxDrawdown(prices);
  
  // Beta
  let beta = 1.0;
  if (marketPrices && marketPrices.length === prices.length) {
    const marketReturns: number[] = [];
    for (let i = 1; i < marketPrices.length; i++) {
      marketReturns.push((marketPrices[i] - marketPrices[i - 1]) / marketPrices[i - 1]);
    }
    beta = calculateBeta(returns, marketReturns);
  }
  
  // VaR
  const var95 = calculateVaR(prices, 95);
  const var99 = calculateVaR(prices, 99);
  
  // 夏普比率
  const sharpeRatio = calculateSharpeRatio(returns);
  
  // 索提诺比率
  const sortinoRatio = calculateSortinoRatio(returns);
  
  // 流动性指标
  const volumeRatio = volume / avgVolume20;
  const currentPrice = prices[prices.length - 1];
  const turnoverRate = (volume * currentPrice) / (avgVolume20 * currentPrice) * 100;
  
  // 综合风险评分 (0-100)
  let riskScore = 0;
  
  // 波动率评分 (0-25)
  if (volatility < 15) riskScore += 5;
  else if (volatility < 25) riskScore += 10;
  else if (volatility < 40) riskScore += 18;
  else riskScore += 25;
  
  // 最大回撤评分 (0-25)
  if (maxDrawdown < 10) riskScore += 5;
  else if (maxDrawdown < 20) riskScore += 10;
  else if (maxDrawdown < 35) riskScore += 18;
  else riskScore += 25;
  
  // Beta评分 (0-20)
  if (beta < 0.8) riskScore += 5;
  else if (beta < 1.2) riskScore += 12;
  else if (beta < 1.5) riskScore += 16;
  else riskScore += 20;
  
  // 财务风险评分 (0-15)
  if (debtRatio < 40) riskScore += 3;
  else if (debtRatio < 60) riskScore += 8;
  else if (debtRatio < 80) riskScore += 12;
  else riskScore += 15;
  
  // 流动性评分 (0-15)
  if (volumeRatio > 1.5 && turnoverRate > 3) riskScore += 3;
  else if (volumeRatio > 0.8 && turnoverRate > 1) riskScore += 8;
  else if (volumeRatio > 0.5) riskScore += 12;
  else riskScore += 15;
  
  // 确定风险等级
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  if (riskScore < 25) riskLevel = 'LOW';
  else if (riskScore < 50) riskLevel = 'MEDIUM';
  else if (riskScore < 75) riskLevel = 'HIGH';
  else riskLevel = 'VERY_HIGH';
  
  // 风险因素
  const riskFactors: Array<{
    category: string;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
  }> = [];
  
  if (volatility > 30) {
    riskFactors.push({
      category: '波动风险',
      level: 'HIGH',
      description: `年化波动率${volatility}%，波动较大`,
    });
  }
  
  if (maxDrawdown > 25) {
    riskFactors.push({
      category: '回撤风险',
      level: 'HIGH',
      description: `历史最大回撤${maxDrawdown}%，需注意风险`,
    });
  }
  
  if (beta > 1.3) {
    riskFactors.push({
      category: '市场风险',
      level: beta > 1.5 ? 'HIGH' : 'MEDIUM',
      description: `Beta=${beta}，波动大于市场`,
    });
  }
  
  if (debtRatio > 70) {
    riskFactors.push({
      category: '财务风险',
      level: 'HIGH',
      description: `资产负债率${debtRatio}%，债务压力较大`,
    });
  }
  
  if (volumeRatio < 0.5) {
    riskFactors.push({
      category: '流动性风险',
      level: 'MEDIUM',
      description: `成交量较低，流动性不足`,
    });
  }
  
  // 建议
  const recommendations = [];
  if (riskLevel === 'HIGH' || riskLevel === 'VERY_HIGH') {
    recommendations.push('建议降低仓位，控制风险');
    recommendations.push('设置止损位，限制最大亏损');
  }
  if (volatility > 30) {
    recommendations.push('波动较大，适合风险承受能力强的投资者');
  }
  if (beta > 1.3) {
    recommendations.push('建议关注市场整体走势');
  }
  if (recommendations.length === 0) {
    recommendations.push('风险可控，可维持当前策略');
  }
  
  return {
    stockCode,
    stockName,
    metrics: {
      volatility,
      beta,
      maxDrawdown,
      avgVolume: avgVolume20,
      volumeRatio,
      turnoverRate,
      debtRatio,
      currentRatio,
      quickRatio: currentRatio * 0.8,
      var95,
      var99,
      sharpeRatio,
      sortinoRatio,
      riskLevel,
      riskScore,
    },
    riskFactors,
    recommendations,
    timestamp: new Date(),
  };
}

/**
 * 组合风险评估
 */
export async function calculate_portfolio_risk(params: {
  positions: Array<{
    stockCode: string;
    weight: number;    // 权重 (0-1)
    volatility: number;
    correlation: number; // 与其他持仓的相关性
  }>;
  riskFreeRate?: number;
}): Promise<{
  portfolioVolatility: number;
  portfolioVaR95: number;
  diversificationBenefit: number;
  recommendations: string[];
}> {
  const { positions, riskFreeRate = 0.03 } = params;
  
  // 组合波动率 (简化计算)
  let portfolioVolatility = 0;
  
  for (const pos of positions) {
    portfolioVolatility += pos.weight * pos.weight * pos.volatility * pos.volatility;
    
    // 考虑相关性
    for (const other of positions) {
      if (pos !== other) {
        portfolioVolatility += 2 * pos.weight * other.weight * pos.volatility * other.volatility * pos.correlation;
      }
    }
  }
  
  portfolioVolatility = Math.sqrt(portfolioVolatility);
  
  // 组合 VaR (简化)
  const portfolioVaR95 = portfolioVolatility * 1.65; // 95%置信度
  
  // 分散化收益 (相对于等权重的改善)
  const equalWeightVol = positions.reduce((a, b) => a + b.volatility, 0) / positions.length;
  const diversificationBenefit = ((equalWeightVol - portfolioVolatility) / equalWeightVol) * 100;
  
  const recommendations = [];
  if (diversificationBenefit < 10) {
    recommendations.push('分散化不足，建议增加持仓数量');
  }
  if (portfolioVolatility > 25) {
    recommendations.push('组合波动率偏高，建议降低风险敞口');
  }
  if (positions.length < 5) {
    recommendations.push('持仓数量过少，建议分散投资');
  }
  
  return {
    portfolioVolatility: Math.round(portfolioVolatility * 100) / 100,
    portfolioVaR95: Math.round(portfolioVaR95 * 100) / 100,
    diversificationBenefit: Math.round(diversificationBenefit * 100) / 100,
    recommendations,
  };
}
