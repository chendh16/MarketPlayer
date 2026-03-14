/**
 * 持仓复盘 MCP 工具
 * 
 * 提供持仓分析、风险指标计算、资产配置分析等功能
 */

import { logger } from '../../utils/logger';
import { fetch_realtime_quote, fetch_kline } from './stock';

/**
 * 持仓项目增强版
 */
export interface PositionItem {
  symbol: string;
  name: string;
  market: string;           // A股/港股/美股
  quantity: number;        // 持仓数量
  costPrice: number;       // 成本价
  currentPrice: number;     // 当前价格
  marketValue: number;     // 当前市值
  costValue: number;       // 成本市值
  profitLoss: number;       // 浮动盈亏
  profitPercent: number;   // 盈亏比例
  positionPct: number;     // 仓位占比
  todayChange: number;     // 今日涨跌
  todayChangePercent: number; // 今日涨跌幅
  industry?: string;        // 所属行业
}

/**
 * 账户快照增强版
 */
export interface PositionSnapshot {
  broker: string;
  totalAssets: number;      // 总资产
  availableCash: number;    // 可用资金
  marketValue: number;      // 持仓市值
  profitLoss: number;       // 总浮动盈亏
  profitPercent: number;    // 总盈亏比例
  positionPct: number;      // 仓位比例
  positions: PositionItem[];
  riskMetrics: RiskMetrics;
  updateTime: string;
}

/**
 * 风险指标
 */
export interface RiskMetrics {
  // 仓位指标
  positionPct: number;           // 仓位占比
  cashPct: number;              // 现金占比
  
  // 行业集中度
  industryConcentration: Array<{
    industry: string;
    pct: number;
  }>;
  
  // 风险等级
  riskLevel: '低' | '中' | '高';
  riskScore: number;             // 0-100
  
  // 波动率
  portfolioVolatility: number;  // 组合波动率
  maxDrawdown: number;          // 最大回撤估算
  
  // 杠杆
  hasLeverage: boolean;         // 是否有杠杆
  leverageRatio: number;         // 杠杆比例
}

/**
 * 资产配置
 */
export interface AssetAllocation {
  byMarket: {                    // 按市场
    a: number;                   // A股
    hk: number;                  // 港股
    us: number;                  // 美股
    cash: number;                // 现金
  };
  byAsset: {                     // 按资产类别
    stock: number;               // 股票
    bond: number;               // 债券
    fund: number;               // 基金
    cash: number;               // 现金
  };
  total: number;
}

/**
 * 获取持仓复盘报告
 * 
 * @param params 参数
 * @returns 持仓分析报告
 */
export async function fetch_position_review(params: {
  broker?: string;
  forceRefresh?: boolean;
}): Promise<{
  summary: string;
  snapshot: PositionSnapshot;
  allocation: AssetAllocation;
  warnings: string[];
}> {
  const { broker = 'futu', forceRefresh = false } = params;
  
  logger.info(`[MCP] fetch_position_review broker=${broker}`);

  // TODO: 从真实API获取持仓数据
  // 当前返回模拟数据演示结构
  const mockPositions = getMockPositions();
  
  // 获取实时行情更新价格
  const symbols = mockPositions.map(p => p.symbol);
  const quotes = await fetch_batch_quote_internal(symbols);
  
  // 计算持仓
  const positions = mockPositions.map(p => {
    const quote = quotes[p.symbol];
    const currentPrice = quote?.price || p.currentPrice;
    const marketValue = p.quantity * currentPrice;
    const costValue = p.quantity * p.costPrice;
    const profitLoss = marketValue - costValue;
    const profitPercent = costValue > 0 ? (profitLoss / costValue) * 100 : 0;
    const todayChange = quote?.change || 0;
    const todayChangePercent = quote?.changePercent || 0;
    
    return {
      ...p,
      currentPrice,
      marketValue,
      costValue,
      profitLoss,
      profitPercent,
      todayChange,
      todayChangePercent
    };
  });

  // 计算总计
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCostValue = positions.reduce((sum, p) => sum + p.costValue, 0);
  const totalProfitLoss = totalMarketValue - totalCostValue;
  const totalAssets = totalMarketValue + 100000; // 假设10万现金
  const availableCash = 100000;
  const positionPct = (totalMarketValue / totalAssets) * 100;

  // 计算风险指标
  const riskMetrics = calculateRiskMetrics(positions, totalAssets);

  // 资产配置
  const allocation = calculateAllocation(positions, totalAssets);

  // 生成警告
  const warnings = generateWarnings(positions, riskMetrics, totalAssets);

  const snapshot: PositionSnapshot = {
    broker,
    totalAssets,
    availableCash,
    marketValue: totalMarketValue,
    profitLoss: totalProfitLoss,
    profitPercent: (totalProfitLoss / totalCostValue) * 100,
    positionPct,
    positions,
    riskMetrics,
    updateTime: new Date().toISOString()
  };

  // 生成摘要
  const summary = `
📊 持仓复盘 (${broker})

总资产: ${formatMoney(totalMarketValue + availableCash)}
持仓市值: ${formatMoney(totalMarketValue)}
可用现金: ${formatMoney(availableCash)}
仓位: ${positionPct.toFixed(1)}%

浮动盈亏: ${totalProfitLoss >= 0 ? '+' : ''}${formatMoney(totalProfitLoss)} (${(totalProfitLoss / totalCostValue * 100).toFixed(2)}%)

风险等级: ${riskMetrics.riskLevel} (${riskMetrics.riskScore}分)
行业集中度: ${riskMetrics.industryConcentration[0]?.industry || 'N/A'} ${riskMetrics.industryConcentration[0]?.pct.toFixed(1) || 0}%

⚠️ 提示: ${warnings.length > 0 ? warnings[0] : '无'}
`.trim();

  return {
    summary,
    snapshot,
    allocation,
    warnings
  };
}

/**
 * 计算风险指标
 */
function calculateRiskMetrics(positions: PositionItem[], totalAssets: number): RiskMetrics {
  // 仓位
  const marketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const cash = totalAssets - marketValue;
  const positionPct = (marketValue / totalAssets) * 100;
  const cashPct = (cash / totalAssets) * 100;

  // 行业集中度
  const industryMap = new Map<string, number>();
  positions.forEach(p => {
    const ind = p.industry || '其他';
    const current = industryMap.get(ind) || 0;
    industryMap.set(ind, current + p.marketValue);
  });
  const industryConcentration = Array.from(industryMap.entries())
    .map(([industry, value]) => ({
      industry,
      pct: (value / totalAssets) * 100
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  // 风险评分 (0-100)
  let riskScore = 0;
  
  // 仓位风险
  if (positionPct > 90) riskScore += 30;
  else if (positionPct > 80) riskScore += 20;
  else riskScore += (100 - positionPct) * 0.2;
  
  // 集中度风险
  const topIndustryPct = industryConcentration[0]?.pct || 0;
  if (topIndustryPct > 50) riskScore += 25;
  else if (topIndustryPct > 30) riskScore += 15;
  
  // 个股风险
  const maxSinglePct = Math.max(...positions.map(p => p.positionPct));
  if (maxSinglePct > 30) riskScore += 20;
  else if (maxSinglePct > 20) riskScore += 10;
  
  // 波动风险 (简化)
  const avgChangePercent = positions.reduce((sum, p) => sum + Math.abs(p.todayChangePercent), 0) / positions.length;
  if (avgChangePercent > 5) riskScore += 15;
  else if (avgChangePercent > 3) riskScore += 10;

  riskScore = Math.min(100, Math.round(riskScore));

  // 风险等级
  let riskLevel: '低' | '中' | '高' = '低';
  if (riskScore >= 70) riskLevel = '高';
  else if (riskScore >= 40) riskLevel = '中';

  return {
    positionPct,
    cashPct,
    industryConcentration,
    riskLevel,
    riskScore,
    portfolioVolatility: avgChangePercent,
    maxDrawdown: 0,  // 需要历史数据计算
    hasLeverage: false,
    leverageRatio: 1
  };
}

/**
 * 计算资产配置
 */
function calculateAllocation(positions: PositionItem[], totalAssets: number): AssetAllocation {
  const byMarket = { a: 0, hk: 0, us: 0, cash: 0 };
  const byAsset = { stock: 0, bond: 0, fund: 0, cash: 0 };
  
  positions.forEach(p => {
    if (p.market === 'A股') byMarket.a += p.marketValue;
    else if (p.market === '港股') byMarket.hk += p.marketValue;
    else if (p.market === '美股') byMarket.us += p.marketValue;
    
    byAsset.stock += p.marketValue;
  });
  
  const marketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  byMarket.cash = Math.max(0, totalAssets - marketValue);
  byAsset.cash = byMarket.cash;

  return {
    byMarket: {
      a: (byMarket.a / totalAssets) * 100,
      hk: (byMarket.hk / totalAssets) * 100,
      us: (byMarket.us / totalAssets) * 100,
      cash: (byMarket.cash / totalAssets) * 100
    },
    byAsset: {
      stock: (byAsset.stock / totalAssets) * 100,
      bond: 0,
      fund: 0,
      cash: (byAsset.cash / totalAssets) * 100
    },
    total: totalAssets
  };
}

/**
 * 生成风险警告
 */
function generateWarnings(positions: PositionItem[], riskMetrics: RiskMetrics, totalAssets: number): string[] {
  const warnings: string[] = [];
  
  // 仓位警告
  if (riskMetrics.positionPct > 90) {
    warnings.push('仓位过高，建议减仓至80%以下');
  }
  
  // 集中度警告
  if (riskMetrics.industryConcentration[0]?.pct > 50) {
    warnings.push(`行业集中度过高: ${riskMetrics.industryConcentration[0].industry}占比${riskMetrics.industryConcentration[0].pct.toFixed(1)}%`);
  }
  
  // 个股集中度
  const maxSingle = Math.max(...positions.map(p => p.positionPct));
  if (maxSingle > 30) {
    warnings.push('单只股票仓位过重，建议分散风险');
  }
  
  // 现金不足
  if (riskMetrics.cashPct < 5) {
    warnings.push('现金储备不足，建议保留10%以上');
  }
  
  return warnings;
}

/**
 * 内部批量获取行情
 */
async function fetch_batch_quote_internal(symbols: string[]): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  
  // 逐个获取
  for (const symbol of symbols) {
    try {
      const quote = await fetch_realtime_quote({ symbol });
      result[symbol] = {
        price: quote.lastPrice,
        change: quote.change,
        changePercent: quote.changePercent
      };
    } catch (e) {
      // 忽略错误
    }
  }
  
  return result;
}

/**
 * 格式化金额
 */
function formatMoney(amount: number): string {
  if (Math.abs(amount) >= 100000000) {
    return (amount / 100000000).toFixed(2) + '亿';
  } else if (Math.abs(amount) >= 10000) {
    return (amount / 10000).toFixed(2) + '万';
  }
  return amount.toFixed(2);
}

/**
 * 模拟持仓数据
 */
function getMockPositions(): PositionItem[] {
  return [
    { symbol: '600519', name: '贵州茅台', market: 'A股', quantity: 100, costPrice: 1400, currentPrice: 1400, marketValue: 140000, costValue: 140000, profitLoss: 0, profitPercent: 0, positionPct: 50, todayChange: 0, todayChangePercent: 0, industry: '食品饮料' },
    { symbol: '000858', name: '五粮液', market: 'A股', quantity: 500, costPrice: 150, currentPrice: 150, marketValue: 75000, costValue: 75000, profitLoss: 0, profitPercent: 0, positionPct: 26.8, todayChange: 0, todayChangePercent: 0, industry: '食品饮料' },
    { symbol: '600036', name: '招商银行', market: 'A股', quantity: 1000, costPrice: 35, currentPrice: 35, marketValue: 35000, costValue: 35000, profitLoss: 0, profitPercent: 0, positionPct: 12.5, todayChange: 0, todayChangePercent: 0, industry: '银行' },
    { symbol: '00700', name: '腾讯控股', market: '港股', quantity: 200, costPrice: 350, currentPrice: 350, marketValue: 70000, costValue: 70000, profitLoss: 0, profitPercent: 0, positionPct: 25, todayChange: 0, todayChangePercent: 0, industry: '互联网' },
  ];
}
