/**
 * 新闻分析模块导出
 */

// 事件检测
export { detectEvent, detectEvents, type DetectedEvent, type EventType, getEventTimeWindow, getEventWeight } from './event-detector';

// 情感分析
export { analyzeSentiment, analyzeWithEvent, analyzeSentimentBatch, calculateTimeWeightedSentiment, type SentimentResult } from './sentiment-analyzer';

// 信号生成
export { generateSignal, generateSignals, filterSignals, getEventDirection, getConfigForEventType, type GeneratedSignal, type SignalGeneratorConfig } from './signal-generator';

// 时间衰减
export { 
  getDecayConfig, 
  calculateDecay, 
  calculateEventStrength, 
  calculateTimeWeightedScore, 
  getEventExpiryDays,
  decayNewsList,
  type TimeWeightedNews,
  type DecayConfig 
} from './time-decay';

// 因子构建
export { 
  buildSentimentFactor, 
  buildSentimentChangeFactor,
  buildHeatFactor, 
  buildAttentionFactor, 
  buildCumulativeFactor,
  buildFactorBundle,
  buildMultiSymbolFactors,
  type NewsFactor,
  type FactorBundle
} from './factor-builder';

// 信号融合
export { 
  fuseSignals, 
  fuseMultipleSignals, 
  selectBestSignal,
  createFinalSignal,
  type FusionConfig,
  type FusionResult
} from './signal-fusion';

// 产业链映射 ⭐
export {
  identifyIndustry,
  getChainStocks,
  processIndustryChain,
  getIndustriesForStock,
  getStockPosition,
  processNewsBatch,
  aggregateIndustryImpact,
  exportIndustryData,
  type ChainLevel,
  type IndustryMatch,
  type ChainStock,
  type IndustryChainResult
} from './industry-chain';

// 产业链数据
export {
  INDUSTRY_CHAINS,
  getAllIndustries,
  getAllStockCodes,
  type IndustryChain,
  type StockInfo
} from './industry-data';
