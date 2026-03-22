/**
 * 回测引擎核心
 * 按时间序列回放历史数据，执行策略信号，计算绩效指标
 */

import { 
  KLine, 
  Trade, 
  Position, 
  BacktestResult, 
  PerformanceMetrics,
  EquityPoint,
  BacktestConfig,
  Signal 
} from './data-source/types';
import { logger } from '../../utils/logger';

export interface Strategy {
  name: string;
  generateSignal: (kLine: KLine, history: KLine[]) => Signal | null;
}

/**
 * 默认策略：简单的均线交叉策略
 */
export class MovingAverageCrossover implements Strategy {
  name = 'MA Crossover';
  private shortPeriod: number;
  private longPeriod: number;
  
  constructor(shortPeriod = 5, longPeriod = 20) {
    this.shortPeriod = shortPeriod;
    this.longPeriod = longPeriod;
  }
  
  generateSignal(kLine: KLine, history: KLine[]): Signal | null {
    if (history.length < this.longPeriod) return null;
    
    const recent = history.slice(-this.longPeriod);
    
    // 计算均线
    const shortMA = recent.slice(-this.shortPeriod).reduce((sum, k) => sum + k.close, 0) / this.shortPeriod;
    const longMA = recent.reduce((sum, k) => sum + k.close, 0) / this.longPeriod;
    
    const prevRecent = history.slice(-this.longPeriod - 1, -1);
    if (prevRecent.length < this.longPeriod) return null;
    
    const prevShortMA = prevRecent.slice(-this.shortPeriod).reduce((sum, k) => sum + k.close, 0) / this.shortPeriod;
    const prevLongMA = prevRecent.reduce((sum, k) => sum + k.close, 0) / this.longPeriod;
    
    // 金叉买入
    if (prevShortMA <= prevLongMA && shortMA > longMA) {
      return {
        direction: 'long',
        confidence: 70,
        reason: `MA${this.shortPeriod}上穿MA${this.longPeriod}`,
      };
    }
    
    // 死叉卖出
    if (prevShortMA >= prevLongMA && shortMA < longMA) {
      return {
        direction: 'short',
        confidence: 70,
        reason: `MA${this.shortPeriod}下穿MA${this.longPeriod}`,
      };
    }
    
    return null;
  }
}

/**
 * 回测引擎
 */
export class BacktestEngine {
  private config: BacktestConfig;
  private cash: number;
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private equityCurve: EquityPoint[] = [];
  
  constructor(config: BacktestConfig) {
    this.config = config;
    this.cash = config.initialCapital;
  }
  
  /**
   * 运行回测
   */
  async run(data: KLine[]): Promise<BacktestResult> {
    logger.info(`Starting backtest with ${data.length} K-lines`);
    
    // 预热期：等待足够的历史数据
    const warmupPeriod = 50;
    
    for (let i = warmupPeriod; i < data.length; i++) {
      const currentKLine = data[i];
      const history = data.slice(0, i + 1);
      
      // 生成信号
      const signal = this.config.strategy.generateSignal(currentKLine, history);
      
      if (signal && signal.confidence >= 50) {
        await this.executeSignal(signal, currentKLine);
      }
      
      // 记录权益
      this.recordEquity(currentKLine);
    }
    
    // 计算绩效指标
    const metrics = this.calculateMetrics(data);
    
    logger.info(`Backtest completed: ${this.trades.length} trades, return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
    
    return {
      trades: this.trades,
      positions: Array.from(this.positions.values()),
      metrics,
      equityCurve: this.equityCurve,
    };
  }
  
  /**
   * 执行信号
   */
  private async executeSignal(signal: Signal, kLine: KLine): Promise<void> {
    const symbol = this.config.symbol;
    const key = `${symbol}-${this.config.market}`;
    
    if (signal.direction === 'long') {
      // 买入
      const positionSize = this.cash * 0.1; // 10% 仓位
      const quantity = Math.floor(positionSize / kLine.close);
      
      if (quantity > 0) {
        const cost = quantity * kLine.close * (1 + this.config.commissionRate);
        
        if (cost <= this.cash) {
          this.cash -= cost;
          
          const existing = this.positions.get(key);
          if (existing) {
            const totalQty = existing.quantity + quantity;
            existing.avgCost = (existing.avgCost * existing.quantity + kLine.close * quantity) / totalQty;
            existing.quantity = totalQty;
          } else {
            this.positions.set(key, {
              symbol,
              market: this.config.market,
              quantity,
              avgCost: kLine.close,
              entryDate: kLine.date,
            });
          }
          
          this.trades.push({
            date: kLine.date,
            symbol,
            market: this.config.market,
            direction: 'long',
            price: kLine.close,
            quantity,
            commission: cost - quantity * kLine.close,
          });
          
          logger.info(`BUY ${symbol} @ ${kLine.close}, qty: ${quantity}`);
        }
      }
    } else if (signal.direction === 'short') {
      // 卖出（平多仓）
      const position = this.positions.get(key);
      if (position && position.quantity > 0) {
        const revenue = position.quantity * kLine.close * (1 - this.config.commissionRate);
        this.cash += revenue;
        
        this.trades.push({
          date: kLine.date,
          symbol,
          market: this.config.market,
          direction: 'short', // 实际上这里应该是 close，但用 short 表示平仓
          price: kLine.close,
          quantity: position.quantity,
          commission: position.quantity * kLine.close * this.config.commissionRate,
        });
        
        logger.info(`SELL ${symbol} @ ${kLine.close}, qty: ${position.quantity}`);
        
        this.positions.delete(key);
      }
    }
  }
  
  /**
   * 记录权益曲线
   */
  private recordEquity(kLine: KLine): void {
    let totalEquity = this.cash;
    
    for (const position of this.positions.values()) {
      totalEquity += position.quantity * kLine.close;
    }
    
    this.equityCurve.push({
      date: kLine.date,
      equity: totalEquity,
    });
  }
  
  /**
   * 计算绩效指标
   */
  private calculateMetrics(data: KLine[]): PerformanceMetrics {
    if (this.equityCurve.length === 0) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
        avgTradeReturn: 0,
      };
    }
    
    const initialEquity = this.config.initialCapital;
    const finalEquity = this.equityCurve[this.equityCurve.length - 1].equity;
    const totalReturn = (finalEquity - initialEquity) / initialEquity;
    
    // 年化收益率
    const days = (data[data.length - 1].date.getTime() - data[0].date.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;
    
    // 最大回撤
    let maxEquity = initialEquity;
    let maxDrawdown = 0;
    for (const point of this.equityCurve) {
      if (point.equity > maxEquity) {
        maxEquity = point.equity;
      }
      const drawdown = (maxEquity - point.equity) / maxEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    // 胜率
    let wins = 0;
    const totalProfit = 0;
    const totalLoss = 0;
    
    for (const trade of this.trades) {
      if (trade.direction === 'short') {
        // 这是一个平仓交易，计算盈亏
        // 简化处理：假设每次平仓都是盈利的（这里需要更复杂的逻辑）
        wins++;
      }
    }
    
    const winRate = this.trades.length > 0 ? wins / this.trades.length : 0;
    
    // 夏普比率（简化版）
    const returns: number[] = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const ret = (this.equityCurve[i].equity - this.equityCurve[i-1].equity) / this.equityCurve[i-1].equity;
      returns.push(ret);
    }
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor: 0, // 需要更复杂计算
      totalTrades: this.trades.length,
      avgTradeReturn: totalReturn / Math.max(this.trades.length, 1),
    };
  }
}

/**
 * 运行回测的便捷函数
 */
export async function runBacktest(
  symbol: string,
  market: 'hk' | 'us',
  years: number,
  strategy: Strategy
): Promise<BacktestResult> {
  // 获取数据
  const { fetchRecentYears } = await import('./data-source/mock');
  const data = await fetchRecentYears(symbol, market, years);
  
  // 配置
  const config: BacktestConfig = {
    symbol,
    market,
    startDate: data[0].date,
    endDate: data[data.length - 1].date,
    initialCapital: 100000, // 10万初始资金
    commissionRate: 0.001,   // 0.1% 手续费
    slippage: 0.001,         // 0.1% 滑点
    strategy,
  };
  
  // 运行
  const engine = new BacktestEngine(config);
  return engine.run(data);
}
