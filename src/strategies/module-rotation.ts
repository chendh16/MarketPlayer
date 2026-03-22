/**
 * 行业轮动策略引擎
 * 
 * 核心理念：基于"模块+上下游联动"逻辑
 * 支持: A股 + 港股 + 美股
 * 1. 识别强势模块 (动量/涨幅)
 * 2. 追踪上下游传导机会
 * 3. 把握轮动节奏
 */

import { logger } from '../utils/logger';
import { getHistoryKLine, KLine } from '../services/market/quote-service';
import { ALL_MODULES, IndustryModule, getModule, getRelatedModules, getStockModule, Market } from '../config/industry-modules';

/**
 * 模块信号
 */
export interface ModuleSignal {
  moduleId: string;
  moduleName: string;
  signal: 'leading' | 'following' | 'reversing' | 'neutral';
  strength: number;        // 0-100
  momentum: number;         // 近20日涨幅
  volatility: number;       // 波动率
  upstreamStrength: number; // 上游强度
  downstreamStrength: number; // 下游强度
  reason: string;
  relatedModules: string[]; // 关联模块
  stocks: Array<{
    code: string;
    name: string;
    price: number;
    change: number;
  }>;
}

/**
 * 计算单只股票的动量
 */
async function calculateMomentum(code: string, market: Market, days: number = 20): Promise<number> {
  try {
    const klines = await getHistoryKLine(code, market, '1d', '3mo');
    if (klines.length < days) return 0;
    
    const current = klines[klines.length - 1].close;
    const past = klines[klines.length - days].close;
    
    return ((current - past) / past) * 100;
  } catch (e) {
    return 0;
  }
}

/**
 * 计算波动率
 */
async function calculateVolatility(code: string, market: Market, days: number = 20): Promise<number> {
  try {
    const klines = await getHistoryKLine(code, market, '1d', '3mo');
    if (klines.length < days) return 0;
    
    const closes = klines.slice(-days).map(k => k.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // 年化波动率
  } catch (e) {
    return 0;
  }
}

/**
 * 分析单个模块
 */
export async function analyzeModule(module: IndustryModule): Promise<ModuleSignal> {
  const stockMomenta: Array<{code: string, name: string, momentum: number, price: number}> = [];
  
  // 计算各成分股动量
  for (const stock of module.stocks) {
    // 根据代码判断市场
    let market: Market = 'a';
    if (stock.code.match(/^[0-9]{5}$/)) {
      market = 'hk'; // 5位数字 = 港股
    } else if (stock.code.match(/^[A-Z]+\.?[A-Z]*$/)) {
      market = 'us'; // 字母 = 美股
    } else if (stock.code.match(/^[0-9]{6}$/)) {
      market = 'a'; // 6位数字 = A股
    }
    
    const momentum = await calculateMomentum(stock.code, market);
    const klines = await getHistoryKLine(stock.code, market, '1d', '1mo');
    const price = klines.length > 0 ? klines[klines.length - 1].close : 0;
    
    stockMomenta.push({
      code: stock.code,
      name: stock.name,
      momentum,
      price
    });
  }
  
  // 计算模块整体动量 (成分股平均)
  const avgMomentum = stockMomenta.reduce((sum, s) => sum + s.momentum, 0) / stockMomenta.length;
  
  // 计算平均波动率
  const volatilities = await Promise.all(
    module.stocks.map(s => {
      const market: 'a' | 'hk' | 'us' = s.code.match(/^\d+$/) ? 'a' : 'us';
      return calculateVolatility(s.code, market);
    })
  );
  const avgVolatility = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;
  
  // 获取上下游模块强度
  const relatedModules = getRelatedModules(module.id);
  let upstreamStrength = 0;
  let downstreamStrength = 0;
  
  if (module.upstream) {
    for (const upId of module.upstream) {
      const upModule = getModule(upId);
      if (upModule) {
        for (const s of upModule.stocks) {
          const m = await calculateMomentum(s.code, 'a');
          upstreamStrength += m;
        }
        upstreamStrength /= upModule.stocks.length;
      }
    }
  }
  
  if (module.downstream) {
    for (const downId of module.downstream) {
      const downModule = getModule(downId);
      if (downModule) {
        for (const s of downModule.stocks) {
          const m = await calculateMomentum(s.code, 'a');
          downstreamStrength += m;
        }
        downstreamStrength /= downModule.stocks.length;
      }
    }
  }
  
  // 判断信号类型
  let signal: ModuleSignal['signal'] = 'neutral';
  let reason = '';
  let strength = 50;
  
  if (avgMomentum > 5 && upstreamStrength > 3) {
    signal = 'leading'; // 领涨 + 上游支撑
    reason = `模块领涨(涨幅${avgMomentum.toFixed(1)}%) + 上游强势`;
    strength = Math.min(100, 50 + avgMomentum);
  } else if (avgMomentum > 3 && downstreamStrength > avgMomentum) {
    signal = 'following'; // 跟随下游
    reason = `受益于下游需求(下游涨幅${downstreamStrength.toFixed(1)}%)`;
    strength = Math.min(100, 50 + downstreamStrength);
  } else if (avgMomentum < -5 && upstreamStrength > avgMomentum + 5) {
    signal = 'reversing'; // 传导受阻，可能反转
    reason = `上游强势但本模块下跌，存在反弹机会`;
    strength = Math.min(100, 60 + Math.abs(avgMomentum));
  } else {
    reason = `区间震荡(涨幅${avgMomentum.toFixed(1)}%)`;
  }
  
  return {
    moduleId: module.id,
    moduleName: module.name,
    signal,
    strength,
    momentum: avgMomentum,
    volatility: avgVolatility,
    upstreamStrength,
    downstreamStrength,
    reason,
    relatedModules: relatedModules.map(m => m.name),
    stocks: stockMomenta.map(s => ({
      code: s.code,
      name: s.name,
      price: s.price,
      change: s.momentum
    }))
  };
}

/**
 * 扫描所有模块
 */
export async function scanAllModules(): Promise<ModuleSignal[]> {
  logger.info('[ModuleRotation] 开始扫描所有行业模块...');
  
  const signals: ModuleSignal[] = [];
  
  for (const module of ALL_MODULES) {
    try {
      const signal = await analyzeModule(module);
      signals.push(signal);
    } catch (e) {
      logger.error(`[ModuleRotation] 分析模块${module.id}失败:`, e);
    }
  }
  
  // 按动量排序
  return signals.sort((a, b) => b.momentum - a.momentum);
}

/**
 * 获取推荐配置
 */
export async function getModuleRecommendations(): Promise<{
  leading: ModuleSignal[];   // 领涨模块
  following: ModuleSignal[]; // 跟涨模块
  reversal: ModuleSignal[];  // 反弹模块
}> {
  const signals = await scanAllModules();
  
  return {
    leading: signals.filter(s => s.signal === 'leading'),
    following: signals.filter(s => s.signal === 'following'),
    reversal: signals.filter(s => s.signal === 'reversing'),
  };
}

/**
 * 获取上下游联动的投资建议
 */
export async function getChainRecommendations(): Promise<Array<{
  type: 'upstream' | 'downstream' | '本模块';
  module: string;
  stocks: Array<{code: string, name: string, change: number}>;
  recommendation: string;
}>> {
  const signals = await scanAllModules();
  const recommendations: Array<any> = [];
  
  for (const signal of signals) {
    if (signal.signal === 'leading' && signal.upstreamStrength > 0) {
      // 领涨模块 + 上游强势 = 上下游都有机会
      recommendations.push({
        type: 'upstream',
        module: signal.moduleName,
        stocks: signal.stocks,
        recommendation: `模块领涨，可关注上游传导机会`
      });
    }
    
    if (signal.signal === 'following' && signal.downstreamStrength > signal.momentum) {
      // 跟涨模块
      recommendations.push({
        type: 'downstream',
        module: signal.moduleName,
        stocks: signal.stocks,
        recommendation: `下游需求强劲，关注补涨机会`
      });
    }
  }
  
  return recommendations;
}

export default {
  analyzeModule,
  scanAllModules,
  getModuleRecommendations,
  getChainRecommendations,
};
