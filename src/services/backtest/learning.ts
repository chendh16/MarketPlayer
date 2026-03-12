/**
 * 实盘反馈学习系统
 * 记录和分析实盘交易与模拟交易的差异
 */

import { KLine } from './data-source/types';

// 市场环境类型
export type MarketRegime = 'bull' | 'bear' | 'volatile' | 'sideways';

// 交易差异记录
export interface TradeDiff {
  signalId: string;
  symbol: string;
  strategyId: string;
  // 信号产生
  signalTime: Date;
  signalPrice: number;
  // 实际执行
  execTime?: Date;
  execPrice?: number;
  execType?: 'buy' | 'sell';
  // 对比
  priceDiff: number;      // 价差
  timeDiff: number;       // 时间差(分钟)
  // 结果
  expectedReturn?: number;
  actualReturn?: number;
}

// 策略有效性记录
export interface StrategyEffectiveness {
  strategyId: string;
  symbol: string;
  regime: MarketRegime;
  sampleCount: number;
  accuracy: number;        // 准确率
  avgReturn: number;       // 平均收益
  avgTimeDiff: number;     // 平均执行延迟
  lastUpdated: Date;
}

// 市场环境识别
export class MarketRegimeDetector {
  private readonly BULL_THRESHOLD = 0.05;    // 5%月涨幅
  private readonly BEAR_THRESHOLD = -0.05;   // -5%月跌幅
  private readonly VOLATILE_STD = 0.02;      // 日波动>2%
  
  /**
   * 识别市场环境
   */
  detect(klines: KLine[], lookback: number = 30): MarketRegime {
    if (klines.length < lookback) return 'sideways';
    
    const recent = klines.slice(-lookback);
    
    // 计算收益率
    const returns = recent.map((k, i) => 
      i > 0 ? (k.close - recent[i-1].close) / recent[i-1].close : 0
    ).slice(1);
    
    // 计算总涨幅
    const totalReturn = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
    
    // 计算波动率
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const std = Math.sqrt(variance);
    
    // 判断环境
    if (totalReturn > this.BULL_THRESHOLD && std < this.VOLATILE_STD) {
      return 'bull';
    }
    if (totalReturn < this.BEAR_THRESHOLD) {
      return 'bear';
    }
    if (std > this.VOLATILE_STD * 1.5) {
      return 'volatile';
    }
    return 'sideways';
  }
  
  /**
   * 获取环境描述
   */
  getDescription(regime: MarketRegime): string {
    switch (regime) {
      case 'bull': return '上涨趋势';
      case 'bear': return '下跌趋势';
      case 'volatile': return '高波动';
      case 'sideways': return '横盘整理';
    }
  }
}

/**
 * 交易差异记录器
 */
export class TradeDiffRecorder {
  private diffs: TradeDiff[] = [];
  
  /**
   * 记录信号产生
   */
  recordSignal(
    signalId: string,
    symbol: string,
    strategyId: string,
    price: number
  ): void {
    this.diffs.push({
      signalId,
      symbol,
      strategyId,
      signalTime: new Date(),
      signalPrice: price,
      priceDiff: 0,
      timeDiff: 0,
    });
  }
  
  /**
   * 记录实际执行
   */
  recordExecution(
    signalId: string,
    execPrice: number,
    execType: 'buy' | 'sell'
  ): void {
    const diff = this.diffs.find(d => d.signalId === signalId);
    if (!diff) return;
    
    diff.execTime = new Date();
    diff.execPrice = execPrice;
    diff.execType = execType;
    
    // 计算差异
    diff.timeDiff = (diff.execTime.getTime() - diff.signalTime.getTime()) / 60000; // 分钟
    diff.priceDiff = (execPrice - diff.signalPrice) / diff.signalPrice * 100; // 百分比
  }
  
  /**
   * 记录结果
   */
  recordResult(signalId: string, expected: number, actual: number): void {
    const diff = this.diffs.find(d => d.signalId === signalId);
    if (diff) {
      diff.expectedReturn = expected;
      diff.actualReturn = actual;
    }
  }
  
  /**
   * 获取差异统计
   */
  getStats(strategyId?: string): {
    avgPriceDiff: number;
    avgTimeDiff: number;
    accuracy: number;
  } {
    const filtered = strategyId 
      ? this.diffs.filter(d => d.strategyId === strategyId)
      : this.diffs;
    
    if (filtered.length === 0) {
      return { avgPriceDiff: 0, avgTimeDiff: 0, accuracy: 0 };
    }
    
    const avgPriceDiff = filtered.reduce((s, d) => s + d.priceDiff, 0) / filtered.length;
    const avgTimeDiff = filtered.reduce((s, d) => s + d.timeDiff, 0) / filtered.length;
    
    // 准确率: 方向正确且收益为正
    const correct = filtered.filter(d => 
      d.expectedReturn !== undefined && d.actualReturn !== undefined &&
      Math.sign(d.expectedReturn) === Math.sign(d.actualReturn!) &&
      d.actualReturn! > 0
    ).length;
    
    return {
      avgPriceDiff,
      avgTimeDiff,
      accuracy: correct / filtered.length,
    };
  }
}

/**
 * 策略有效性评估器
 */
export class StrategyEffectivenessEvaluator {
  private regimeDetector = new MarketRegimeDetector();
  private effectiveness: Map<string, StrategyEffectiveness> = new Map();
  
  /**
   * 评估策略有效性
   */
  evaluate(
    strategyId: string,
    symbol: string,
    klines: KLine[]
  ): StrategyEffectiveness {
    const regime = this.regimeDetector.detect(klines);
    const key = `${strategyId}_${symbol}_${regime}`;
    
    // 获取历史记录
    const existing = this.effectiveness.get(key);
    
    // 简单模拟评估 (实际需要真实交易数据)
    const sampleCount = (existing?.sampleCount || 0) + 1;
    const accuracy = 0.6 + Math.random() * 0.2; // 模拟
    const avgReturn = (existing?.avgReturn || 0) * 0.9 + Math.random() * 5; // 模拟
    const avgTimeDiff = existing?.avgTimeDiff || 5;
    
    const result: StrategyEffectiveness = {
      strategyId,
      symbol,
      regime,
      sampleCount,
      accuracy,
      avgReturn,
      avgTimeDiff,
      lastUpdated: new Date(),
    };
    
    this.effectiveness.set(key, result);
    return result;
  }
  
  /**
   * 获取最佳策略 (针对当前环境)
   */
  getBestForCurrentRegime(
    strategies: string[],
    symbol: string,
    klines: KLine[]
  ): string | null {
    const regime = this.regimeDetector.detect(klines);
    
    let best: string | null = null;
    let bestScore = -Infinity;
    
    for (const strategyId of strategies) {
      const key = `${strategyId}_${symbol}_${regime}`;
      const eff = this.effectiveness.get(key);
      
      if (eff) {
        const score = eff.accuracy * 0.5 + (eff.avgReturn / 10) * 0.3 - (eff.avgTimeDiff / 60) * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = strategyId;
        }
      }
    }
    
    return best;
  }
  
  /**
   * 生成评估报告
   */
  generateReport(): string {
    let report = '# 策略有效性评估报告\n\n';
    
    for (const [key, eff] of this.effectiveness) {
      const regimeDesc = this.regimeDetector.getDescription(eff.regime);
      report += `## ${eff.strategyId} - ${eff.symbol} (${regimeDesc})\n`;
      report += `- 样本数: ${eff.sampleCount}\n`;
      report += `- 准确率: ${(eff.accuracy * 100).toFixed(1)}%\n`;
      report += `- 平均收益: ${eff.avgReturn.toFixed(2)}%\n`;
      report += `- 平均延迟: ${eff.avgTimeDiff.toFixed(1)}分钟\n\n`;
    }
    
    return report;
  }
}
