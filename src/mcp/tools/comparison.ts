/**
 * 竞品对比 MCP 工具
 * 
 * 提供股票同行业对比分析功能
 * 兼容现有架构
 */

import { logger } from '../../utils/logger';

// ==================== 类型定义 ====================

export interface StockComparison {
  target: {
    stockCode: string;
    stockName: string;
    industry: string;
  };
  competitors: Array<{
    stockCode: string;
    stockName: string;
  }>;
  metrics: ComparisonMetrics;
  rankings: MetricRanking[];
  analysis: string;
  timestamp: Date;
}

export interface ComparisonMetrics {
  valuation: {
    pe: { target: number; avg: number; competitors: number[] };
    pb: { target: number; avg: number; competitors: number[] };
    marketCap: { target: number; avg: number; competitors: number[] };
  };
  profitability: {
    roe: { target: number; avg: number; competitors: number[] };
    netProfitMargin: { target: number; avg: number; competitors: number[] };
    grossProfitMargin: { target: number; avg: number; competitors: number[] };
  };
  growth: {
    revenueGrowth: { target: number; avg: number; competitors: number[] };
    profitGrowth: { target: number; avg: number; competitors: number[] };
  };
  scale: {
    revenue: { target: number; avg: number; competitors: number[] };
    netProfit: { target: number; avg: number; competitors: number[] };
  };
}

export interface MetricRanking {
  metric: string;
  targetRank: number;
  totalCount: number;
  percentile: number; // 0-100
  assessment: '领先' | '中等' | '落后';
}

// ==================== 主工具函数 ====================

/**
 * 获取同行业竞争对手
 * 兼容现有 rank.ts 接口
 */
export async function get_competitors(params: {
  stockCode: string;
  stockName?: string;
  count?: number; // 返回多少个竞品
}): Promise<{
  stockCode: string;
  stockName: string;
  industry: string;
  competitors: Array<{
    stockCode: string;
    stockName: string;
    industry: string;
  }>;
}> {
  const { stockCode, stockName, count = 5 } = params;
  
  logger.info(`[Comparison] Getting competitors for ${stockCode}`);
  
  // 模拟获取行业信息
  const industry = await getIndustry(stockCode);
  
  // 模拟竞品列表（实际应调用行业板块接口）
  const competitors = generateMockCompetitors(industry, count).map(c => ({
    ...c,
    industry,
  }));
  
  return {
    stockCode,
    stockName: stockName || stockCode,
    industry,
    competitors,
  };
}

/**
 * 全面对比分析
 */
export async function compare_stock(params: {
  stockCode: string;
  stockName?: string;
  competitorCodes?: string[]; // 指定竞品，不指定则自动获取
}): Promise<StockComparison> {
  const { stockCode, stockName, competitorCodes } = params;
  
  logger.info(`[Comparison] Comparing ${stockCode} with competitors`);
  
  // 获取行业和竞品
  const { industry, competitors } = await getCompetitorsWithCodes(stockCode, competitorCodes);
  
  // 获取财务指标（模拟）
  const targetMetrics = await getFinancialMetrics(stockCode);
  const competitorMetrics = await Promise.all(
    competitors.map(c => getFinancialMetrics(c.stockCode))
  );
  
  // 构建对比指标
  const metrics = buildComparisonMetrics(targetMetrics, competitorMetrics);
  
  // 计算排名
  const rankings = calculateRankings(targetMetrics, competitorMetrics);
  
  // 生成分析文字
  const analysis = generateAnalysis(stockCode, metrics, rankings);
  
  return {
    target: {
      stockCode,
      stockName: stockName || stockCode,
      industry,
    },
    competitors,
    metrics,
    rankings,
    analysis,
    timestamp: new Date(),
  };
}

/**
 * 快速估值对比
 */
export async function compare_valuation_quick(params: {
  stockCodes: string[];
}): Promise<{
  comparisons: Array<{
    stockCode: string;
    pe: number;
    pb: number;
    marketCap: number;
    valuationRank: number; // 1最低估
  }>;
  cheapest: string; // 最低估
  mostExpensive: string; // 最高估
  timestamp: Date;
}> {
  const { stockCodes } = params;
  
  const comparisons = await Promise.all(
    stockCodes.map(async (code) => {
      const metrics = await getFinancialMetrics(code);
      return {
        stockCode: code,
        pe: metrics.pe,
        pb: metrics.pb,
        marketCap: metrics.marketCap,
        // 简化：PE越低越低估
        valuationScore: metrics.pe,
      };
    })
  );
  
  // 按PE排序
  comparisons.sort((a, b) => a.pe - b.pe);
  
  // 添加排名
  const ranked = comparisons.map((c, i) => ({
    ...c,
    valuationRank: i + 1,
  }));
  
  return {
    comparisons: ranked,
    cheapest: ranked[0]?.stockCode || '',
    mostExpensive: ranked[ranked.length - 1]?.stockCode || '',
    timestamp: new Date(),
  };
}

/**
 * 快速盈利对比
 */
export async function compare_profitability_quick(params: {
  stockCodes: string[];
}): Promise<{
  comparisons: Array<{
    stockCode: string;
    roe: number;
    netProfitMargin: number;
    profitabilityRank: number;
  }>;
  mostProfitable: string;
  timestamp: Date;
}> {
  const { stockCodes } = params;
  
  const comparisons = await Promise.all(
    stockCodes.map(async (code) => {
      const metrics = await getFinancialMetrics(code);
      return {
        stockCode: code,
        roe: metrics.roe,
        netProfitMargin: metrics.netProfitMargin,
        // 综合评分：ROE和净利率
        score: metrics.roe * 0.6 + metrics.netProfitMargin * 10 * 0.4,
      };
    })
  );
  
  // 按盈利能力强弱排序
  comparisons.sort((a, b) => b.score - a.score);
  
  const ranked = comparisons.map((c, i) => ({
    stockCode: c.stockCode,
    roe: c.roe,
    netProfitMargin: c.netProfitMargin,
    profitabilityRank: i + 1,
  }));
  
  return {
    comparisons: ranked,
    mostProfitable: ranked[0]?.stockCode || '',
    timestamp: new Date(),
  };
}

// ==================== 辅助函数 ====================

async function getIndustry(stockCode: string): Promise<string> {
  // 简化实现，实际应调用股票基本信息接口
  const industryMap: Record<string, string> = {
    '600519': '白酒',
    '000858': '白酒',
    '600036': '银行',
    '601318': '保险',
    '600900': '电力',
    '000333': '家电',
    '002475': '电子',
  };
  return industryMap[stockCode] || '制造业';
}

async function getCompetitorsWithCodes(
  stockCode: string, 
  competitorCodes?: string[]
): Promise<{
  industry: string;
  competitors: Array<{ stockCode: string; stockName: string; industry: string }>;
}> {
  const industry = await getIndustry(stockCode);
  
  if (competitorCodes) {
    return {
      industry,
      competitors: competitorCodes.map(code => ({
        stockCode: code,
        stockName: code, // 简化
        industry,
      })),
    };
  }
  
  // 自动获取竞品
  const competitors = generateMockCompetitors(industry, 4).map(c => ({
    ...c,
    industry,
  }));
  return { industry, competitors };
}

function generateMockCompetitors(industry: string, count: number): Array<{ stockCode: string; stockName: string }> {
  // 模拟竞品数据
  const competitorsMap: Record<string, Array<{ code: string; name: string }>> = {
    '白酒': [
      { code: '000568', name: '泸州老窖' },
      { code: '000596', name: '古井贡酒' },
      { code: '600559', name: '今世缘' },
      { code: '603589', name: '金种子酒' },
    ],
    '银行': [
      { code: '601398', name: '工商银行' },
      { code: '601939', name: '建设银行' },
      { code: '601288', name: '农业银行' },
      { code: '600016', name: '民生银行' },
    ],
    '制造业': [
      { code: '000001', name: '平安银行' },
      { code: '600000', name: '浦发银行' },
    ],
  };
  
  const list = competitorsMap[industry] || competitorsMap['制造业'];
  return list.slice(0, count).map(c => ({
    stockCode: c.code,
    stockName: c.name,
  }));
}

interface FinancialMetrics {
  pe: number;
  pb: number;
  marketCap: number;
  roe: number;
  netProfitMargin: number;
  grossProfitMargin: number;
  revenueGrowth: number;
  profitGrowth: number;
  revenue: number;
  netProfit: number;
}

async function getFinancialMetrics(stockCode: string): Promise<FinancialMetrics> {
  // 模拟数据，实际应调用财务接口
  return {
    pe: 15 + Math.random() * 20,
    pb: 1.5 + Math.random() * 3,
    marketCap: 100 + Math.random() * 500,
    roe: 8 + Math.random() * 15,
    netProfitMargin: 5 + Math.random() * 15,
    grossProfitMargin: 20 + Math.random() * 30,
    revenueGrowth: -10 + Math.random() * 40,
    profitGrowth: -15 + Math.random() * 50,
    revenue: 50 + Math.random() * 200,
    netProfit: 5 + Math.random() * 30,
  };
}

function buildComparisonMetrics(
  target: FinancialMetrics,
  competitors: FinancialMetrics[]
): ComparisonMetrics {
  const allValues = [target, ...competitors];
  
  const getAvg = (key: keyof FinancialMetrics) => 
    allValues.reduce((sum, v) => sum + (v[key] as number), 0) / allValues.length;
  
  const getCompetitorValues = (key: keyof FinancialMetrics) =>
    competitors.map(c => c[key] as number);
  
  return {
    valuation: {
      pe: { target: target.pe, avg: getAvg('pe'), competitors: getCompetitorValues('pe') },
      pb: { target: target.pb, avg: getAvg('pb'), competitors: getCompetitorValues('pb') },
      marketCap: { target: target.marketCap, avg: getAvg('marketCap'), competitors: getCompetitorValues('marketCap') },
    },
    profitability: {
      roe: { target: target.roe, avg: getAvg('roe'), competitors: getCompetitorValues('roe') },
      netProfitMargin: { target: target.netProfitMargin, avg: getAvg('netProfitMargin'), competitors: getCompetitorValues('netProfitMargin') },
      grossProfitMargin: { target: target.grossProfitMargin, avg: getAvg('grossProfitMargin'), competitors: getCompetitorValues('grossProfitMargin') },
    },
    growth: {
      revenueGrowth: { target: target.revenueGrowth, avg: getAvg('revenueGrowth'), competitors: getCompetitorValues('revenueGrowth') },
      profitGrowth: { target: target.profitGrowth, avg: getAvg('profitGrowth'), competitors: getCompetitorValues('profitGrowth') },
    },
    scale: {
      revenue: { target: target.revenue, avg: getAvg('revenue'), competitors: getCompetitorValues('revenue') },
      netProfit: { target: target.netProfit, avg: getAvg('netProfit'), competitors: getCompetitorValues('netProfit') },
    },
  };
}

function calculateRankings(
  target: FinancialMetrics,
  competitors: FinancialMetrics[]
): MetricRanking[] {
  const all = [target, ...competitors];
  
  const rankings: MetricRanking[] = [];
  
  // PE排名（越低越好）
  rankings.push({
    metric: '市盈率(PE)',
    targetRank: rankPosition(target.pe, all.map(v => v.pe), 'asc'),
    totalCount: all.length,
    percentile: percentile(target.pe, all.map(v => v.pe), 'asc'),
    assessment: assessRank(target.pe, all.map(v => v.pe), 'asc'),
  });
  
  // ROE排名（越高越好）
  rankings.push({
    metric: '净资产收益率(ROE)',
    targetRank: rankPosition(target.roe, all.map(v => v.roe), 'desc'),
    totalCount: all.length,
    percentile: percentile(target.roe, all.map(v => v.roe), 'desc'),
    assessment: assessRank(target.roe, all.map(v => v.roe), 'desc'),
  });
  
  // 净利润增长率排名
  rankings.push({
    metric: '净利润增长率',
    targetRank: rankPosition(target.profitGrowth, all.map(v => v.profitGrowth), 'desc'),
    totalCount: all.length,
    percentile: percentile(target.profitGrowth, all.map(v => v.profitGrowth), 'desc'),
    assessment: assessRank(target.profitGrowth, all.map(v => v.profitGrowth), 'desc'),
  });
  
  return rankings;
}

function rankPosition(value: number, all: number[], direction: 'asc' | 'desc'): number {
  const sorted = [...all].sort((a, b) => direction === 'asc' ? a - b : b - a);
  return sorted.indexOf(value) + 1;
}

function percentile(value: number, all: number[], direction: 'asc' | 'desc'): number {
  const sorted = [...all].sort((a, b) => direction === 'asc' ? a - b : b - a);
  const position = sorted.indexOf(value);
  return Math.round((position / (all.length - 1)) * 100) || 50;
}

function assessRank(value: number, all: number[], direction: 'asc' | 'desc'): '领先' | '中等' | '落后' {
  const p = percentile(value, all, direction);
  if (p >= 67) return '领先';
  if (p <= 33) return '落后';
  return '中等';
}

function generateAnalysis(stockCode: string, metrics: ComparisonMetrics, rankings: MetricRanking[]): string {
  const parts: string[] = [];
  
  // 估值分析
  if (metrics.valuation.pe.target < metrics.valuation.pe.avg) {
    parts.push(`估值低于行业平均，具备估值优势`);
  } else {
    parts.push(`估值高于行业平均，需关注回调风险`);
  }
  
  // 盈利能力
  const roeRank = rankings.find(r => r.metric.includes('ROE'));
  if (roeRank && roeRank.assessment === '领先') {
    parts.push(`盈利能力行业领先`);
  }
  
  // 成长性
  if (metrics.growth.profitGrowth.target > metrics.growth.profitGrowth.avg) {
    parts.push(`成长性好于行业平均`);
  }
  
  return parts.join('，') || '综合表现处于行业中游水平';
}
