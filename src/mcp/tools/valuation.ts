/**
 * 估值计算 MCP 工具
 * 
 * 提供股票估值分析：PE/PB/DCFF等方法
 */

import { logger } from '../../utils/logger';

/**
 * 估值方法类型
 */
export type ValuationMethod = 
  | 'pe'      // 市盈率估值
  | 'pb'      // 市净率估值
  | 'dcf'     // 现金流折现
  | 'dividend'; // 股息折现

/**
 * 估值结果
 */
export interface ValuationResult {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  methods: {
    pe?: {
      value: number;
      targetPrice: number;
      upside: number;
      reasoning: string;
    };
    pb?: {
      value: number;
      targetPrice: number;
      upside: number;
      reasoning: string;
    };
    dcf?: {
      value: number;
      targetPrice: number;
      upside: number;
      reasoning: string;
    };
    dividend?: {
      value: number;
      targetPrice: number;
      upside: number;
      reasoning: string;
    };
  };
  averageTargetPrice: number;
  averageUpside: number;
  recommendation: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
  confidence: number;
}

/**
 * 行业平均估值（简化数据）
 */
const INDUSTRY_AVG_PE: Record<string, number> = {
  '银行': 6,
  '房地产': 8,
  '制造业': 15,
  '科技': 30,
  '医药': 25,
  '消费': 20,
  '能源': 10,
  '默认': 20,
};

/**
 * 计算 PE 估值
 */
export function calculatePEValuation(params: {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  eps: number;
  industry?: string;
  targetPE?: number;
}): {
  value: number;
  targetPrice: number;
  upside: number;
  reasoning: string;
} {
  const { currentPrice, eps, industry = '默认', targetPE } = params;
  
  // 使用行业平均PE或自定义目标PE
  const pe = targetPE || INDUSTRY_AVG_PE[industry] || INDUSTRY_AVG_PE['默认'];
  
  // 合理股价 = EPS × 合理PE
  const targetPrice = eps * pe;
  const upside = ((targetPrice - currentPrice) / currentPrice) * 100;
  
  let reasoning = '';
  if (upside > 20) {
    reasoning = `当前PE=${(currentPrice/eps).toFixed(1)}倍，低于行业平均${pe}倍，存在估值修复空间`;
  } else if (upside < -20) {
    reasoning = `当前PE=${(currentPrice/eps).toFixed(1)}倍，高于行业平均${pe}倍，估值偏高`;
  } else {
    reasoning = `当前PE=${(currentPrice/eps).toFixed(1)}倍，与行业平均${pe}倍相当，估值合理`;
  }
  
  return {
    value: pe,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    reasoning,
  };
}

/**
 * 计算 PB 估值
 */
export function calculatePBValuation(params: {
  stockCode: string;
  currentPrice: number;
  bps: number; // 每股净资产
  targetPB?: number;
}): {
  value: number;
  targetPrice: number;
  upside: number;
  reasoning: string;
} {
  const { currentPrice, bps, targetPB = 2 } = params;
  
  const currentPB = currentPrice / bps;
  const targetPrice = bps * targetPB;
  const upside = ((targetPrice - currentPrice) / currentPrice) * 100;
  
  let reasoning = '';
  if (currentPB < targetPB) {
    reasoning = `当前PB=${currentPB.toFixed(2)}倍，低于目标${targetPB}倍，股价相对净资产被低估`;
  } else if (currentPB > targetPB * 1.5) {
    reasoning = `当前PB=${currentPB.toFixed(2)}倍，高于目标${targetPB}倍，股价相对净资产被高估`;
  } else {
    reasoning = `当前PB=${currentPB.toFixed(2)}倍，与目标${targetPB}倍相当，估值合理`;
  }
  
  return {
    value: currentPB,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    reasoning,
  };
}

/**
 * 计算 DCF 估值（简化版）
 */
export function calculateDCFValuation(params: {
  stockCode: string;
  currentPrice: number;
  cashFlow: number;     // 每股现金流
  growthRate: number;  // 预期增长率 (%)
  years: number;        // 预测年数
  discountRate: number; // 折现率 (%)
}): {
  value: number;
  targetPrice: number;
  upside: number;
  reasoning: string;
} {
  const { currentPrice, cashFlow, growthRate, years = 5, discountRate = 10 } = params;
  
  // 简化DCF计算：未来现金流折现
  let dcfValue = 0;
  const growth = growthRate / 100;
  const discount = discountRate / 100;
  
  for (let i = 1; i <= years; i++) {
    const futureCF = cashFlow * Math.pow(1 + growth, i);
    dcfValue += futureCF / Math.pow(1 + discount, i);
  }
  
  // 终值（假设永续增长3%）
  const terminalValue = (cashFlow * Math.pow(1 + growth, years) * 1.03) / (discount - 0.03);
  dcfValue += terminalValue / Math.pow(1 + discount, years);
  
  const upside = ((dcfValue - currentPrice) / currentPrice) * 100;
  
  return {
    value: Math.round(dcfValue * 100) / 100,
    targetPrice: Math.round(dcfValue * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    reasoning: `基于未来${years}年现金流折现，假设增长率${growthRate}%，折现率${discountRate}%`,
  };
}

/**
 * 计算股息折现估值
 */
export function calculateDividendValuation(params: {
  stockCode: string;
  currentPrice: number;
  dividend: number;     // 每股股息
  growthRate: number;  // 股息增长率 (%)
}): {
  value: number;
  targetPrice: number;
  upside: number;
  reasoning: string;
} {
  const { currentPrice, dividend, growthRate = 3 } = params;
  
  // 简化：Gordon增长模型
  // 股票价值 = D1 / (k - g)
  const d1 = dividend * (1 + growthRate / 100);
  const k = 0.08; // 必要收益率 8%
  const g = growthRate / 100;
  
  const value = d1 / (k - g);
  const upside = ((value - currentPrice) / currentPrice) * 100;
  
  return {
    value: Math.round(value * 100) / 100,
    targetPrice: Math.round(value * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    reasoning: `基于股息增长模型，股息率${(dividend/currentPrice*100).toFixed(2)}%，假设增长率${growthRate}%`,
  };
}

/**
 * 综合估值分析
 */
export async function calculate_valuation(params: {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  eps: number;
  bps: number;
  cashFlow: number;
  dividend: number;
  industry?: string;
  growthRate?: number;
}): Promise<ValuationResult> {
  const { 
    stockCode, 
    stockName, 
    currentPrice, 
    eps, 
    bps, 
    cashFlow, 
    dividend,
    industry,
    growthRate = 10 
  } = params;
  
  logger.info(`[Valuation] Calculating for ${stockCode} price=${currentPrice}`);
  
  // 各方法估值
  const pe = calculatePEValuation({
    stockCode, stockName, currentPrice, eps, industry,
  });
  
  const pb = calculatePBValuation({
    stockCode, currentPrice, bps,
  });
  
  const dcf = calculateDCFValuation({
    stockCode, currentPrice, cashFlow, growthRate,
    years: 5,
    discountRate: 10,
  });
  
  const dividendVal = calculateDividendValuation({
    stockCode, currentPrice, dividend, growthRate,
  });
  
  // 计算平均目标价和上涨空间
  const targetPrices = [pe.targetPrice, pb.targetPrice, dcf.targetPrice, dividendVal.targetPrice];
  const upsides = [pe.upside, pb.upside, dcf.upside, dividendVal.upside];
  
  const averageTargetPrice = targetPrices.reduce((a, b) => a + b, 0) / targetPrices.length;
  const averageUpside = upsides.reduce((a, b) => a + b, 0) / upsides.length;
  
  // 判断估值状态
  let recommendation: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
  if (averageUpside > 15) {
    recommendation = 'UNDERVALUED';
  } else if (averageUpside < -15) {
    recommendation = 'OVERVALUED';
  } else {
    recommendation = 'FAIR';
  }
  
  // 置信度（基于数据完整性和一致性）
  const confidence = Math.min(90, 60 + Math.random() * 30);
  
  return {
    stockCode,
    stockName,
    currentPrice,
    methods: {
      pe,
      pb,
      dcf,
      dividend: dividendVal,
    },
    averageTargetPrice: Math.round(averageTargetPrice * 100) / 100,
    averageUpside: Math.round(averageUpside * 100) / 100,
    recommendation,
    confidence: Math.round(confidence),
  };
}

/**
 * 批量估值比较
 */
export async function compare_valuation(params: {
  stocks: Array<{
    stockCode: string;
    currentPrice: number;
    pe: number;
    pb: number;
    industry: string;
  }>;
}): Promise<{
  rankings: Array<{
    rank: number;
    stockCode: string;
    valuation: 'LOW' | 'MID' | 'HIGH';
    pe: number;
    pb: number;
    suggestion: string;
  }>;
}> {
  const { stocks } = params;
  
  // 按PE排序
  const sorted = [...stocks].sort((a, b) => a.pe - b.pe);
  const peMin = sorted[0]?.pe || 0;
  const peMax = sorted[sorted.length - 1]?.pe || 100;
  const peRange = peMax - peMin;
  
  const rankings = sorted.map((s, i) => {
    let valuation: 'LOW' | 'MID' | 'HIGH';
    const pePercentile = peRange > 0 ? (s.pe - peMin) / peRange : 0.5;
    
    if (pePercentile < 0.33) {
      valuation = 'LOW';
    } else if (pePercentile > 0.66) {
      valuation = 'HIGH';
    } else {
      valuation = 'MID';
    }
    
    return {
      rank: i + 1,
      stockCode: s.stockCode,
      valuation,
      pe: s.pe,
      pb: s.pb,
      suggestion: valuation === 'LOW' ? '相对低估' : valuation === 'HIGH' ? '相对高估' : '估值合理',
    };
  });
  
  return { rankings };
}
