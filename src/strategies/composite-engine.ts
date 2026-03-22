/**
 * 综合策略引擎
 * 整合三大策略：
 * 1. 长线价值 (PB估值)
 * 2. 短线技术 (均线/RSI/MACD等)
 * 3. 行业轮动 (模块联动)
 */

import { getHistoryKLine } from '../services/market/quote-service';
import { evaluateLongTerm, LongTermSignal } from '../strategies/longTerm';
import { combinedStrategy, StrategySignal } from '../strategies/quant-engine';
import { getAllModules, getStockModule, IndustryModule } from '../config/industry-modules';

/**
 * 综合信号
 */
export interface CompositeSignal {
  code: string;
  name: string;
  market: 'a' | 'hk' | 'us';
  module?: string;
  
  // 各策略评分
  longTermScore: number;    // 长线: 0-100
  shortTermScore: number;     // 短线: 0-100
  moduleScore: number;        // 轮动: 0-100
  
  // 最终信号
  finalSignal: 'BUY' | 'SELL' | 'HOLD';
  finalScore: number;         // 综合评分 0-100
  
  // 信号原因
  reasons: string[];
  
  // 价格信息
  price: number;
  momentum: number;
}

/**
 * 获取市场
 */
function getMarket(code: string): 'a' | 'hk' | 'us' {
  if (code.match(/^[0-9]{5}$/)) return 'hk';
  if (code.match(/^[A-Z]+\.?[A-Z]*$/)) return 'us';
  return 'a';
}

/**
 * 计算动量
 */
async function calculateMomentum(code: string, market: 'a' | 'hk' | 'us'): Promise<number> {
  try {
    const klines = await getHistoryKLine(code, market, '1d', '20d');
    if (klines.length < 5) return 0;
    const current = klines[klines.length - 1].close;
    const past = klines[0].close;
    return ((current - past) / past) * 100;
  } catch {
    return 0;
  }
}

/**
 * 获取长线评分 (简化版)
 */
function getLongTermScore(): number {
  // TODO: 接入真实PB数据
  // 模拟: 基于当前市场情绪给分
  const baseScore = 50;
  const random = Math.random() * 20 - 10; // -10 到 +10
  return Math.max(0, Math.min(100, baseScore + random));
}

/**
 * 获取短线评分
 */
async function getShortTermScore(code: string, market: 'a' | 'hk' | 'us'): Promise<number> {
  try {
    const signal = await combinedStrategy({ symbol: code, market });
    // 转换 strength 到 0-100
    return signal.strength;
  } catch {
    return 50;
  }
}

/**
 * 获取轮动评分 (简化版)
 */
function getModuleScore(code: string, modules: IndustryModule[]): number {
  const module = getStockModule(code);
  if (!module) return 50;
  
  // 模拟: 电力/新能源给高分
  const boostModules = ['power', 'ev', 'us_tech', 'us_health'];
  if (boostModules.includes(module.id)) {
    return 60 + Math.random() * 20;
  }
  
  return 50;
}

/**
 * 分析单只股票的综合信号
 */
export async function analyzeComposite(code: string, name: string): Promise<CompositeSignal> {
  const market = getMarket(code);
  
  // 1. 长线评分
  const longTermScore = getLongTermScore();
  
  // 2. 短线评分
  const shortTermScore = await getShortTermScore(code, market);
  
  // 3. 轮动评分
  const modules = getAllModules();
  const moduleScore = getModuleScore(code, modules);
  
  // 计算综合评分
  // 权重: 长线40%, 短线35%, 轮动25%
  const finalScore = Math.round(
    longTermScore * 0.4 +
    shortTermScore * 0.35 +
    moduleScore * 0.25
  );
  
  // 确定最终信号
  let finalSignal: CompositeSignal['finalSignal'] = 'HOLD';
  const reasons: string[] = [];
  
  if (finalScore >= 70) {
    finalSignal = 'BUY';
    reasons.push('综合评分高分');
  } else if (finalScore <= 30) {
    finalSignal = 'SELL';
    reasons.push('综合评分低分');
  } else {
    reasons.push('综合评分中性');
  }
  
  // 添加各策略原因
  if (longTermScore >= 70) reasons.push('长线估值低位');
  if (shortTermScore >= 70) reasons.push('短线技术面强势');
  if (moduleScore >= 65) reasons.push('行业轮动上行');
  
  // 获取价格和动量
  const klines = await getHistoryKLine(code, market, '1d', '20d');
  const price = klines.length > 0 ? klines[klines.length - 1].close : 0;
  const momentum = await calculateMomentum(code, market);
  
  // 获取所属模块
  const module = getStockModule(code);
  
  return {
    code,
    name,
    market,
    module: module?.name,
    longTermScore: Math.round(longTermScore),
    shortTermScore: Math.round(shortTermScore),
    moduleScore: Math.round(moduleScore),
    finalSignal,
    finalScore,
    reasons,
    price,
    momentum: Math.round(momentum * 100) / 100,
  };
}

/**
 * 批量扫描
 */
export async function scanAllComposites(): Promise<CompositeSignal[]> {
  const modules = getAllModules();
  const results: CompositeSignal[] = [];
  
  console.log('[Composite] 开始综合扫描...');
  
  for (const module of modules) {
    for (const stock of module.stocks.slice(0, 5)) { // 每模块只扫描前5只
      try {
        const signal = await analyzeComposite(stock.code, stock.name);
        results.push(signal);
      } catch (e) {
        console.error(`  扫描 ${stock.code} 失败:`, e);
      }
    }
  }
  
  // 按综合评分排序
  return results.sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * 获取推荐持仓
 */
export async function getRecommendations(): Promise<{
  buy: CompositeSignal[];
  hold: CompositeSignal[];
  sell: CompositeSignal[];
}> {
  const signals = await scanAllComposites();
  
  return {
    buy: signals.filter(s => s.finalSignal === 'BUY'),
    hold: signals.filter(s => s.finalSignal === 'HOLD'),
    sell: signals.filter(s => s.finalSignal === 'SELL'),
  };
}

export default {
  analyzeComposite,
  scanAllComposites,
  getRecommendations,
};