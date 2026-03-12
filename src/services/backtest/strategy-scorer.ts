/**
 * 策略评分与排名系统
 */

export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  symbol: string;
  period: number;  // 评估天数
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  lastUpdated: Date;
}

export interface StrategyScore {
  strategyId: string;
  score: number;
  rank: number;
  breakdown: {
    returnScore: number;
    winScore: number;
    sharpeScore: number;
    drawdownScore: number;
  };
  recommendation: 'keep' | 'optimize' | 'remove';
}

/**
 * 权重配置
 */
const SCORE_WEIGHTS = {
  return: 0.30,
  winRate: 0.20,
  sharpe: 0.25,
  drawdown: 0.25,
};

/**
 * 计算策略综合评分
 */
export function calculateStrategyScore(perf: StrategyPerformance): StrategyScore {
  // 1. 收益率得分 (0-100)
  const returnScore = Math.min(100, Math.max(0, perf.totalReturn * 10));
  
  // 2. 胜率得分 (0-100)
  const winScore = perf.winRate * 100;
  
  // 3. 夏普比率得分 (假设合理范围 0-3)
  const sharpeScore = Math.min(100, Math.max(0, (perf.sharpeRatio || 0) / 3 * 100));
  
  // 4. 回撤得分 (越小越好, 0-100)
  // 0%回撤=100分, 50%以上回撤=0分
  const drawdownScore = Math.max(0, 100 - perf.maxDrawdown * 2);
  
  // 综合得分
  const score = 
    returnScore * SCORE_WEIGHTS.return +
    winScore * SCORE_WEIGHTS.winRate +
    sharpeScore * SCORE_WEIGHTS.sharpe +
    drawdownScore * SCORE_WEIGHTS.drawdown;
  
  // 建议
  let recommendation: 'keep' | 'optimize' | 'remove';
  if (score >= 60 && perf.totalTrades >= 10) {
    recommendation = 'keep';
  } else if (score >= 40) {
    recommendation = 'optimize';
  } else {
    recommendation = 'remove';
  }
  
  return {
    strategyId: perf.strategyId,
    score: Math.round(score * 10) / 10,
    rank: 0,  // 后续排序后填充
    breakdown: {
      returnScore: Math.round(returnScore),
      winScore: Math.round(winScore),
      sharpeScore: Math.round(sharpeScore),
      drawdownScore: Math.round(drawdownScore),
    },
    recommendation,
  };
}

/**
 * 策略排名
 */
export function rankStrategies(perfs: StrategyPerformance[]): StrategyScore[] {
  // 计算每个策略的得分
  const scores = perfs.map(perf => calculateStrategyScore(perf));
  
  // 按得分排序
  scores.sort((a, b) => b.score - a.score);
  
  // 填充排名
  scores.forEach((s, i) => {
    s.rank = i + 1;
  });
  
  return scores;
}

/**
 * 策略淘汰建议
 */
export function getStrategyRecommendation(scores: StrategyScore[]): {
  keep: string[];
  optimize: string[];
  remove: string[];
} {
  const keep: string[] = [];
  const optimize: string[] = [];
  const remove: string[] = [];
  
  for (const s of scores) {
    if (s.recommendation === 'keep') {
      keep.push(s.strategyId);
    } else if (s.recommendation === 'optimize') {
      optimize.push(s.strategyId);
    } else {
      remove.push(s.strategyId);
    }
  }
  
  return { keep, optimize, remove };
}

/**
 * 策略池管理
 */
export class StrategyPool {
  private strategies: Map<string, StrategyPerformance> = new Map();
  
  addStrategy(perf: StrategyPerformance): void {
    this.strategies.set(perf.strategyId, perf);
  }
  
  removeStrategy(strategyId: string): boolean {
    return this.strategies.delete(strategyId);
  }
  
  getStrategy(strategyId: string): StrategyPerformance | undefined {
    return this.strategies.get(strategyId);
  }
  
  getAllStrategies(): StrategyPerformance[] {
    return Array.from(this.strategies.values());
  }
  
  getRankings(): StrategyScore[] {
    return rankStrategies(this.getAllStrategies());
  }
  
  // 获取Top N策略
  getTopStrategies(n: number = 10): StrategyScore[] {
    return this.getRankings().slice(0, n);
  }
  
  // 淘汰低分策略
  prunePoorPerformers(threshold: number = 40): string[] {
    const scores = this.getRankings();
    const toRemove: string[] = [];
    
    for (const s of scores) {
      if (s.score < threshold) {
        this.removeStrategy(s.strategyId);
        toRemove.push(s.strategyId);
      }
    }
    
    return toRemove;
  }
}

/**
 * 评分报告生成
 */
export function generateScoreReport(scores: StrategyScore[]): string {
  let report = '# 策略评分报告\n\n';
  report += `## 总体统计\n`;
  report += `- 总策略数: ${scores.length}\n`;
  report += `- 平均得分: ${(scores.reduce((s, x) => s + x.score, 0) / scores.length).toFixed(1)}\n`;
  report += `- 建议保留: ${scores.filter(s => s.recommendation === 'keep').length}\n`;
  report += `- 建议优化: ${scores.filter(s => s.recommendation === 'optimize').length}\n`;
  report += `- 建议淘汰: ${scores.filter(s => s.recommendation === 'remove').length}\n\n`;
  
  report += `## 策略排名\n\n`;
  report += `| 排名 | 策略ID | 得分 | 收益率分 | 胜率分 | 夏普分 | 回撤分 | 建议 |\n`;
  report += `|------|--------|------|----------|--------|--------|--------|------|\n`;
  
  for (const s of scores) {
    report += `| ${s.rank} | ${s.strategyId} | ${s.score} | ${s.breakdown.returnScore} | ${s.breakdown.winScore} | ${s.breakdown.sharpeScore} | ${s.breakdown.drawdownScore} | ${s.recommendation} |\n`;
  }
  
  return report;
}
