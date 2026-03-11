/**
 * 回测数据类型定义
 */

export interface KLine {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface Trade {
  date: Date;
  symbol: string;
  market: 'hk' | 'us';
  direction: 'long' | 'short';
  price: number;
  quantity: number;
  commission: number;
}

export interface Position {
  symbol: string;
  market: 'hk' | 'us';
  quantity: number;
  avgCost: number;
  entryDate: Date;
}

export interface BacktestResult {
  trades: Trade[];
  positions: Position[];
  metrics: PerformanceMetrics;
  equityCurve: EquityPoint[];
}

export interface PerformanceMetrics {
  totalReturn: number;           // 总收益率
  annualizedReturn: number;      // 年化收益率
  sharpeRatio: number;           // 夏普比率
  maxDrawdown: number;          // 最大回撤
  winRate: number;               // 胜率
  profitFactor: number;         // 盈利因子
  totalTrades: number;          // 总交易次数
  avgTradeReturn: number;       // 平均每笔收益
}

export interface EquityPoint {
  date: Date;
  equity: number;
}

export interface BacktestConfig {
  symbol: string;
  market: 'hk' | 'us';
  startDate: Date;
  endDate: Date;
  initialCapital: number;        // 初始资金
  commissionRate: number;        // 手续费率
  slippage: number;              // 滑点
  strategy: Strategy;
}

export interface Strategy {
  name: string;
  generateSignal: (kLine: KLine, history: KLine[]) => Signal | null;
}

export interface Signal {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reason: string;
}
