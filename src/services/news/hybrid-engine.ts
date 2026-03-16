/**
 * 新闻分析混合引擎
 * 结合规则引擎 + AI 分析
 * 
 * 流程：规则预筛 → AI深度分析 → 信号生成
 */

import { NewsItem, Signal } from '../../models/signal';
import { detectEvent, analyzeWithEvent, identifyIndustry, processIndustryChain, generateSignal as ruleGenerateSignal } from './analysis';
import { analyzeNewsItem, generateSignal as aiGenerateSignal, AnalysisResult, SignalResult } from '../ai/analyzer';

export interface HybridAnalysisConfig {
  useAI: boolean;           // 是否使用AI
  aiThreshold: number;      // 规则引擎置信度阈值，低于此值才调用AI
  useIndustryChain: boolean; // 是否使用产业链映射
  maxAICallsPerDay: number; // 每日最大AI调用次数
}

const DEFAULT_CONFIG: HybridAnalysisConfig = {
  useAI: true,
  aiThreshold: 0.6,        // 置信度低于0.6才调用AI
  useIndustryChain: true,
  maxAICallsPerDay: 100,
};

export interface HybridResult {
  // 规则引擎结果
  ruleEvent: ReturnType<typeof detectEvent>;
  ruleSentiment: ReturnType<typeof analyzeWithEvent>;
  ruleSignal: ReturnType<typeof ruleGenerateSignal>;
  
  // 产业链结果
  industryResult?: ReturnType<typeof processIndustryChain>;
  
  // AI 结果
  aiAnalysis?: AnalysisResult;
  aiSignal?: SignalResult;
  
  // 最终结果
  finalSignal: {
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    positionPct: number;
    reasoning: string;
    source: 'rule' | 'ai' | 'hybrid';
  };
  
  // 元数据
  usedAI: boolean;
  processingTime: number;
}

/**
 * 混合分析主函数
 */
export async function hybridAnalyze(
  news: NewsItem,
  config: Partial<HybridAnalysisConfig> = {}
): Promise<HybridResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  
  // === Step 1: 规则引擎分析 ===
  const ruleEvent = detectEvent(news);
  const ruleSentiment = analyzeWithEvent(news);
  const ruleSignal = ruleGenerateSignal(news);
  
  // === Step 2: 产业链映射 (可选) ===
  let industryResult;
  if (cfg.useIndustryChain) {
    industryResult = processIndustryChain(news);
  }
  
  // === Step 3: 判断是否需要 AI ===
  const ruleConfidence = ruleSignal?.event.confidence || 0;
  const needsAI = cfg.useAI && ruleConfidence < cfg.aiThreshold;
  
  let aiAnalysis: AnalysisResult | undefined;
  let aiSignal: SignalResult | undefined;
  
  if (needsAI) {
    try {
      // 调用 AI 分析
      aiAnalysis = await analyzeNewsItem(news);
      
      // 如果AI认为重要，生成信号
      if (aiAnalysis.importance === 'high') {
        const aiSignalResult = await aiGenerateSignal(news, aiAnalysis);
        if (aiSignalResult) {
          aiSignal = aiSignalResult;
        }
      }
    } catch (error) {
      console.error('AI分析失败，使用规则引擎结果:', error);
    }
  }
  
  // === Step 4: 融合结果 ===
  const finalSignal = fuseResults(ruleSignal, aiSignal, needsAI);
  
  const result: HybridResult = {
    ruleEvent,
    ruleSentiment,
    ruleSignal: ruleSignal!,
    industryResult,
    aiAnalysis,
    aiSignal,
    finalSignal,
    usedAI: needsAI,
    processingTime: Date.now() - startTime,
  };
  
  return result;
}

/**
 * 融合规则和AI结果
 */
function fuseResults(
  ruleSignal: ReturnType<typeof ruleGenerateSignal>,
  aiSignal: SignalResult | undefined,
  usedAI: boolean
): HybridResult['finalSignal'] {
  // 如果使用了AI，优先信任AI结果
  if (usedAI && aiSignal) {
    return {
      action: aiSignal.direction === 'long' ? 'buy' : 'sell',
      confidence: aiSignal.confidence,
      positionPct: aiSignal.suggestedPositionPct,
      reasoning: `[AI] ${aiSignal.reasoning}`,
      source: 'ai',
    };
  }
  
  // 否则使用规则引擎结果
  if (ruleSignal) {
    return {
      action: ruleSignal.action,
      confidence: Math.round(ruleSignal.event.confidence * 100),
      positionPct: ruleSignal.positionPct,
      reasoning: `[规则] ${ruleSignal.reasoning}`,
      source: 'rule',
    };
  }
  
  // 默认观望
  return {
    action: 'hold',
    confidence: 0,
    positionPct: 0,
    reasoning: '无有效信号',
    source: 'rule',
  };
}

/**
 * 批量处理新闻
 */
export async function hybridAnalyzeBatch(
  newsList: NewsItem[],
  config: Partial<HybridAnalysisConfig> = {}
): Promise<HybridResult[]> {
  const results: HybridResult[] = [];
  
  for (const news of newsList) {
    const result = await hybridAnalyze(news, config);
    results.push(result);
  }
  
  return results;
}

/**
 * 统计摘要
 */
export function summarizeResults(results: HybridResult[]): {
  total: number;
  usedAI: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  avgConfidence: number;
  avgProcessingTime: number;
} {
  const buySignals = results.filter(r => r.finalSignal.action === 'buy').length;
  const sellSignals = results.filter(r => r.finalSignal.action === 'sell').length;
  const holdSignals = results.filter(r => r.finalSignal.action === 'hold').length;
  const usedAI = results.filter(r => r.usedAI).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.finalSignal.confidence, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
  
  return {
    total: results.length,
    usedAI,
    buySignals,
    sellSignals,
    holdSignals,
    avgConfidence,
    avgProcessingTime: Math.round(avgTime),
  };
}
