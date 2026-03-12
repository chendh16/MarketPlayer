/**
 * 回测服务 - 统一出口
 */

export { 
  KLine, 
  Trade, 
  Position, 
  BacktestResult, 
  PerformanceMetrics,
  EquityPoint,
  BacktestConfig,
  Signal 
} from './data-source/types';

export { fetchRecentYears as fetchMockData } from './data-source/mock';
export { fetchRealData } from './data-source/real';

export { BacktestEngine, MovingAverageCrossover, runBacktest } from './engine';
export { EnhancedBacktestEngine, runEnhancedBacktest } from './enhanced-engine';
export { RSIStrategy, BollingerStrategy, createStrategy, BuiltInStrategies } from './strategies';
export { NaturalLanguageStrategyParser, userStrategyService, UserStrategyConfig } from './user-strategy';
export { generateEquityCurveChart, generateReport, printSummary } from './visualization';
