/**
 * 新闻服务导出
 */

// 规则引擎分析
export {
  detectEvent,
  detectEvents,
  analyzeWithEvent,
  analyzeSentiment,
  identifyIndustry,
  processIndustryChain,
  generateSignal,
  buildFactorBundle,
  fuseSignals,
  type DetectedEvent,
  type EventType,
  type SentimentResult,
  type IndustryMatch,
  type ChainStock,
  type IndustryChainResult,
  type FactorBundle,
  type FusionResult,
} from './analysis';

// 混合引擎 ⭐
export {
  hybridAnalyze,
  hybridAnalyzeBatch,
  summarizeResults,
  type HybridAnalysisConfig,
  type HybridResult,
} from './hybrid-engine';

// 产业链数据
export {
  INDUSTRY_CHAINS,
  getAllIndustries,
  getAllStockCodes,
  type IndustryChain,
  type StockInfo,
} from './analysis/industry-data';
