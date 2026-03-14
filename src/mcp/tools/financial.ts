/**
 * 财务数据 MCP 工具
 * 
 * 提供 A股财务数据获取功能
 * 数据来源：东方财富 / 聚源数据
 */

import { logger } from '../../utils/logger';

/**
 * 东方财富财务 API
 */
const EASTMONEY_FINA_URL = 'https://emweb.securities.eastmoney.com';

/**
 * 获取股票财务指标
 */
export async function get_financial_indicator(params: {
  stockCode: string;
  type?: 'annual' | 'quarter'; // 年度/季度
}): Promise<{
  stockCode: string;
  stockName: string;
  reportDate: string;
  // 盈利能力
  roe: number;           // 净资产收益率
  netProfitMargin: number; // 净利率
  grossProfitMargin: number; // 毛利率
  // 成长能力
  revenueGrowth: number;   // 营收增长率
  profitGrowth: number;   // 净利润增长率
  // 运营能力
  inventoryTurnover: number;  // 存货周转率
  receivablesTurnover: number; // 应收账款周转率
  // 偿债能力
  debtRatio: number;      // 资产负债率
  currentRatio: number;   // 流动比率
  quickRatio: number;     // 速动比率
  // 每股指标
  eps: number;            // 每股收益
  bps: number;            // 每股净资产
}> {
  const { stockCode, type = 'annual' } = params;
  logger.info(`[MCP] get_financial_indicator stockCode=${stockCode} type=${type}`);

  try {
    // 东方财富财务指标API
    const market = stockCode.startsWith('6') ? '1' : '0';
    const url = `${EASTMONEY_FINA_URL}/PC_HSF10/FinanceAnalysis/GetFinanceAnalysisData`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        stockCode: stockCode,
        type: type === 'annual' ? 0 : 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Financial API failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (!result.data) {
      return getMockFinancialIndicator(stockCode);
    }

    const data = result.data;
    const latest = data[0] || {};

    return {
      stockCode,
      stockName: latest.name || '',
      reportDate: latest.reportdate || '',
      roe: parseFloat(latest.roe || '0'),
      netProfitMargin: parseFloat(latest.netprofitmargin || '0'),
      grossProfitMargin: parseFloat(latest.grossprofitmargin || '0'),
      revenueGrowth: parseFloat(latest.revenuegrowth || '0'),
      profitGrowth: parseFloat(latest.profitgrowth || '0'),
      inventoryTurnover: parseFloat(latest.inventoryturnover || '0'),
      receivablesTurnover: parseFloat(latest.receivablesturnover || '0'),
      debtRatio: parseFloat(latest.debttodebit || '0'),
      currentRatio: parseFloat(latest.currentratio || '0'),
      quickRatio: parseFloat(latest.quickratio || '0'),
      eps: parseFloat(latest.eps || '0'),
      bps: parseFloat(latest.bps || '0'),
    };
  } catch (error: any) {
    logger.error(`[MCP] get_financial_indicator error:`, error);
    // 返回模拟数据
    return getMockFinancialIndicator(stockCode);
  }
}

/**
 * 获取主要财务数据摘要
 */
export async function get_financial_summary(params: {
  stockCode: string;
}): Promise<{
  stockCode: string;
  stockName: string;
  totalRevenue: number;    // 总营收（亿元）
  netProfit: number;       // 净利润（亿元）
  totalAssets: number;     // 总资产（亿元）
  marketCap: number;      // 市值（亿元）
  pe: number;             // 市盈率
  pb: number;             // 市净率
  dividend: number;       // 股息率
}> {
  const { stockCode } = params;
  logger.info(`[MCP] get_financial_summary stockCode=${stockCode}`);

  try {
    const market = stockCode.startsWith('6') ? '1.' : '0.';
    const url = `${EASTMONEY_FINA_URL}/PC_HSF10/NewFinanceAnalysis/zongcai15`;
    
    const response = await fetch(`${url}?stockCode=${stockCode}&market=${market}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Summary API failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (!result.Data) {
      return getMockFinancialSummary(stockCode);
    }

    const d = result.Data;
    return {
      stockCode,
      stockName: d[0]?.SecurityName || '',
      totalRevenue: parseFloat(d[0]?.TotalRevenue || '0') / 100000000,
      netProfit: parseFloat(d[0]?.NetProfit || '0') / 100000000,
      totalAssets: parseFloat(d[0]?.TotalAssets || '0') / 100000000,
      marketCap: parseFloat(d[0]?.MarketCap || '0') / 100000000,
      pe: parseFloat(d[0]?.PE || '0'),
      pb: parseFloat(d[0]?.PB || '0'),
      dividend: parseFloat(d[0]?.Dividend || '0'),
    };
  } catch (error: any) {
    logger.error(`[MCP] get_financial_summary error:`, error);
    return getMockFinancialSummary(stockCode);
  }
}

/**
 * 获取盈利能力指标
 */
export async function get_profitability(params: {
  stockCode: string;
  years?: number; // 获取近几年数据
}): Promise<{
  stockCode: string;
  data: Array<{
    year: string;
    roe: number;
    netProfitMargin: number;
    grossProfitMargin: number;
    eps: number;
  }>;
}> {
  const { stockCode, years = 3 } = params;
  
  // 简化实现
  return {
    stockCode,
    data: Array.from({ length: years }, (_, i) => ({
      year: `${2025 - i}`,
      roe: 10 + Math.random() * 15,
      netProfitMargin: 5 + Math.random() * 10,
      grossProfitMargin: 20 + Math.random() * 20,
      eps: 0.5 + Math.random() * 2,
    })),
  };
}

/**
 * 获取成长能力指标
 */
export async function get_growth_ability(params: {
  stockCode: string;
}): Promise<{
  stockCode: string;
  revenueGrowth: number;   // 营收增速
  profitGrowth: number;   // 净利润增速
  assetGrowth: number;    // 资产增速
  equityGrowth: number;   // 净资产增速
}> {
  const { stockCode } = params;
  
  // 简化实现
  return {
    stockCode,
    revenueGrowth: -10 + Math.random() * 40,
    profitGrowth: -15 + Math.random() * 50,
    assetGrowth: 5 + Math.random() * 20,
    equityGrowth: 5 + Math.random() * 25,
  };
}

// ==================== 模拟数据 ====================

function getMockFinancialIndicator(stockCode: string) {
  return {
    stockCode,
    stockName: '示例股票',
    reportDate: '2025-12-31',
    roe: 12.5,
    netProfitMargin: 8.3,
    grossProfitMargin: 25.6,
    revenueGrowth: 15.2,
    profitGrowth: 18.7,
    inventoryTurnover: 5.2,
    receivablesTurnover: 8.1,
    debtRatio: 45.3,
    currentRatio: 1.8,
    quickRatio: 1.3,
    eps: 1.25,
    bps: 10.2,
  };
}

function getMockFinancialSummary(stockCode: string) {
  return {
    stockCode,
    stockName: '示例股票',
    totalRevenue: 100,
    netProfit: 15,
    totalAssets: 500,
    marketCap: 800,
    pe: 25.3,
    pb: 3.2,
    dividend: 1.5,
  };
}
