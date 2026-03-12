/**
 * 回测引擎 - 增强版
 * 支持止盈止损、风控规则
 */

import { 
  KLine, 
  Trade, 
  Position, 
  BacktestResult, 
  PerformanceMetrics,
  EquityPoint,
  Signal 
} from './data-source/types';
import { logger } from '../../utils/logger';

export interface Strategy {
  name: string;
  generateSignal: (kLine: KLine, history: KLine[]) => Signal | null;
}

/**
 * 增强的回测配置
 */
export interface EnhancedConfig {
  symbol: string;
  market: 'hk' | 'us';
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commissionRate: number;
  strategy: Strategy;
  
  // 增强参数
  takeProfitPct?: number;
  stopLossPct?: number;
  maxPositionPct?: number;
  maxDrawdownPct?: number;
  slippage?: number;
}

/**
 * 持仓带止盈止损信息
 */
interface EnhancedPosition extends Position {
  entryPrice: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  highestPrice?: number;
  lowestPrice?: number;
}

/**
 * 增强回测引擎
 */
export class EnhancedBacktestEngine {
  private config: EnhancedConfig;
  private cash: number;
  private positions: Map<string, EnhancedPosition> = new Map();
  private trades: Trade[] = [];
  private equityCurve: EquityPoint[] = [];
  private peakEquity: number = 0;
  private maxDrawdown: number = 0;
  
  constructor(config: EnhancedConfig) {
    this.config = config;
    this.cash = config.initialCapital;
    this.peakEquity = config.initialCapital;
  }
  
  /**
   * 运行回测
   */
  async run(data: KLine[]): Promise<BacktestResult> {
    logger.info(`Starting enhanced backtest with ${data.length} K-lines`);
    
    const warmupPeriod = 50;
    
    for (let i = warmupPeriod; i < data.length; i++) {
      const currentKLine = data[i];
      const history = data.slice(0, i + 1);
      
      // 1. 检查止盈止损
      await this.checkStopLossTakeProfit(currentKLine);
      
      // 2. 检查风控（最大回撤）
      if (this.checkMaxDrawdown(currentKLine)) {
        logger.info(`Max drawdown reached at ${currentKLine.date}, closing all positions`);
        await this.closeAllPositions(currentKLine);
        break;
      }
      
      // 3. 生成策略信号
      const signal = this.config.strategy.generateSignal(currentKLine, history);
      
      if (signal && signal.confidence >= 50) {
        await this.executeSignal(signal, currentKLine);
      }
      
      // 4. 记录权益
      this.recordEquity(currentKLine);
    }
    
    // 平仓所有剩余持仓
    const lastKLine = data[data.length - 1];
    await this.closeAllPositions(lastKLine);
    
    const metrics = this.calculateMetrics(data);
    
    logger.info(`Enhanced backtest completed: ${this.trades.length} trades, return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
    
    return {
      trades: this.trades,
      positions: Array.from(this.positions.values()),
      metrics,
      equityCurve: this.equityCurve,
    };
  }
  
  /**
   * 检查止盈止损
   */
  private async checkStopLossTakeProfit(kLine: KLine): Promise<void> {
    for (const [key, position] of this.positions) {
      const currentPrice = kLine.close;
      
      // 更新最高/最低价
      if (!position.highestPrice || currentPrice > position.highestPrice) {
        position.highestPrice = currentPrice;
      }
      if (!position.lowestPrice || currentPrice < position.lowestPrice) {
        position.lowestPrice = currentPrice;
      }
      
      const entryPrice = position.entryPrice;
      const pnlPct = (currentPrice - entryPrice) / entryPrice;
      
      // 检查止盈
      if (this.config.takeProfitPct && pnlPct >= this.config.takeProfitPct / 100) {
        await this.closePosition(key, position, kLine, 'take_profit');
        continue;
      }
      
      // 检查止损
      if (this.config.stopLossPct && pnlPct <= -this.config.stopLossPct / 100) {
        await this.closePosition(key, position, kLine, 'stop_loss');
        continue;
      }
    }
  }
  
  /**
   * 检查最大回撤
   */
  private checkMaxDrawdown(kLine: KLine): boolean {
    if (!this.config.maxDrawdownPct) return false;
    
    const currentEquity = this.getCurrentEquity(kLine);
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }
    
    const drawdown = (this.peakEquity - currentEquity) / this.peakEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
    
    return this.maxDrawdown >= this.config.maxDrawdownPct / 100;
  }
  
  /**
   * 获取当前权益
   */
  private getCurrentEquity(kLine: KLine): number {
    let equity = this.cash;
    for (const position of this.positions.values()) {
      equity += position.quantity * kLine.close;
    }
    return equity;
  }
  
  /**
   * 执行信号
   */
  private async executeSignal(signal: Signal, kLine: KLine): Promise<void> {
    // 已有持仓时不买入（简化为只做多）
    if (signal.direction === 'long' && this.positions.size > 0) {
      return;
    }
    
    const symbol = this.config.symbol;
    const key = `${symbol}-${this.config.market}`;
    
    if (signal.direction === 'long') {
      // 买入
      let positionSize = this.cash * 0.1; // 默认 10%
      
      // 应用最大仓位限制
      if (this.config.maxPositionPct) {
        const maxAmount = this.config.initialCapital * (this.config.maxPositionPct / 100);
        positionSize = Math.min(positionSize, maxAmount);
      }
      
      // 应用滑点
      const slippageMultiplier = 1 + (this.config.slippage || 0.001);
      const price = kLine.close * slippageMultiplier;
      
      const quantity = Math.floor(positionSize / price);
      
      if (quantity > 0) {
        const cost = quantity * price * (1 + this.config.commissionRate);
        
        if (cost <= this.cash) {
          this.cash -= cost;
          
          const entryPrice = price;
          
          // 计算止盈止损价格
          let takeProfitPrice: number | undefined;
          let stopLossPrice: number | undefined;
          
          if (this.config.takeProfitPct) {
            takeProfitPrice = entryPrice * (1 + this.config.takeProfitPct / 100);
          }
          if (this.config.stopLossPct) {
            stopLossPrice = entryPrice * (1 - this.config.stopLossPct / 100);
          }
          
          this.positions.set(key, {
            symbol,
            market: this.config.market,
            quantity,
            avgCost: entryPrice,
            entryDate: kLine.date,
            entryPrice,
            takeProfitPrice,
            stopLossPrice,
            highestPrice: entryPrice,
            lowestPrice: entryPrice,
          });
          
          this.trades.push({
            date: kLine.date,
            symbol,
            market: this.config.market,
            direction: 'long',
            price: entryPrice,
            quantity,
            commission: cost - quantity * price,
          });
          
          logger.info(`BUY ${symbol} @ ${entryPrice.toFixed(2)}, qty: ${quantity}, TP: ${takeProfitPrice?.toFixed(2) || 'N/A'}, SL: ${stopLossPrice?.toFixed(2) || 'N/A'}`);
        }
      }
    } else if (signal.direction === 'short' || signal.direction === 'neutral') {
      // 卖出（平仓）
      const position = this.positions.get(key);
      if (position) {
        await this.closePosition(key, position, kLine, 'signal');
      }
    }
  }
  
  /**
   * 平仓
   */
  private async closePosition(
    key: string, 
    position: EnhancedPosition, 
    kLine: KLine, 
    reason: string
  ): Promise<void> {
    // 应用滑点
    const slippageMultiplier = 1 - (this.config.slippage || 0.001);
    const price = kLine.close * slippageMultiplier;
    
    const revenue = position.quantity * price * (1 - this.config.commissionRate);
    this.cash += revenue;
    
    this.trades.push({
      date: kLine.date,
      symbol: position.symbol,
      market: position.market,
      direction: 'short', // 平仓用 short 表示
      price,
      quantity: position.quantity,
      commission: position.quantity * price * this.config.commissionRate,
    });
    
    logger.info(`SELL ${position.symbol} @ ${price.toFixed(2)}, qty: ${position.quantity}, reason: ${reason}`);
    
    this.positions.delete(key);
  }
  
  /**
   * 平所有仓
   */
  private async closeAllPositions(kLine: KLine): Promise<void> {
    for (const [key, position] of this.positions) {
      await this.closePosition(key, position, kLine, 'force_close');
    }
  }
  
  /**
   * 记录权益曲线
   */
  private recordEquity(kLine: KLine): void {
    const equity = this.getCurrentEquity(kLine);
    this.equityCurve.push({
      date: kLine.date,
      equity,
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
    
    // 最大回撤（使用记录的值）
    const maxDrawdown = this.maxDrawdown;
    
    // 计算盈利因子
    let totalProfit = 0;
    let totalLoss = 0;
    
    for (let i = 1; i < this.equityCurve.length; i++) {
      const pnl = this.equityCurve[i].equity - this.equityCurve[i-1].equity;
      if (pnl > 0) totalProfit += pnl;
      else totalLoss += Math.abs(pnl);
    }
    
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0;
    
    // 胜率
    const closedTrades = this.trades.filter(t => t.direction === 'short');
    const wins = closedTrades.length > 0 ? Math.floor(closedTrades.length / 2) : 0; // 简化
    const winRate = closedTrades.length > 0 ? wins / closedTrades.length : 0;
    
    // 夏普比率
    const returns: number[] = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const ret = (this.equityCurve[i].equity - this.equityCurve[i-1].equity) / this.equityCurve[i-1].equity;
      returns.push(ret);
    }
    
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1 
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: this.trades.length,
      avgTradeReturn: totalReturn / Math.max(this.trades.length, 1),
    };
  }
}

/**
 * 运行增强回测
 */
export async function runEnhancedBacktest(
  symbol: string,
  market: 'hk' | 'us',
  years: number,
  strategy: Strategy,
  options?: {
    takeProfitPct?: number;
    stopLossPct?: number;
    maxPositionPct?: number;
    maxDrawdownPct?: number;
  }
): Promise<BacktestResult> {
  const { fetchRecentYears } = await import('./data-source/mock');
  const data = await fetchRecentYears(symbol, market, years);
  
  const config: EnhancedConfig = {
    symbol,
    market,
    startDate: data[0].date,
    endDate: data[data.length - 1].date,
    initialCapital: 100000,
    commissionRate: 0.001,
    slippage: 0.001,
    strategy,
    ...options,
  };
  
  const engine = new EnhancedBacktestEngine(config);
  return engine.run(data);
}
