/**
 * 回测服务 - 数据源模块
 * 统一出口
 */

export { KLine, FetchOptions, fetchHistoricalData, fetchRecentYears } from './yahoo';
export { 
  KLine as KLineType,
  Trade, 
  Position, 
  BacktestResult, 
  PerformanceMetrics, 
  EquityPoint, 
  BacktestConfig, 
  Strategy, 
  Signal 
} from './types';
