/**
 * 报告生成模块
 * 
 * 生成股票分析报告、组合报告
 * 兼容现有架构
 */

import { logger } from '../../utils/logger';

// ==================== 类型定义 ====================

export type ReportType = 
  | 'stock_analysis'  // 股票分析报告
  | 'daily_summary'   // 每日总结
  | 'portfolio'       // 组合报告
  | 'trade_history';  // 交易历史报告

export interface ReportData {
  title: string;
  stockCode?: string;
  stockName?: string;
  generatedAt: Date;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  content: string;
  type: 'text' | 'table' | 'chart';
  data?: any;
}

// ==================== 报告模板 ====================

/**
 * 股票分析报告模板
 */
export function generateStockAnalysisReport(data: {
  stockCode: string;
  stockName: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  pe?: number;
  pb?: number;
  marketCap?: number;
  roe?: number;
  recommendation: 'BUY' | 'HOLD' | 'SELL';
  summary: string;
  risks?: string[];
  opportunities?: string[];
}): ReportData {
  const sections: ReportSection[] = [
    {
      title: '一、投资要点',
      type: 'text',
      content: data.summary,
    },
    {
      title: '二、核心数据',
      type: 'table',
      content: '',
      data: {
        headers: ['指标', '数值'],
        rows: [
          ['最新价', `¥${data.price.toFixed(2)}`],
          ['涨跌幅', `${data.change > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`],
          ['成交量', `${(data.volume / 1000000).toFixed(2)}万手`],
          ['换手率', `${data.turnover.toFixed(2)}%`],
          ...(data.pe ? [['市盈率(PE)', data.pe.toFixed(2)]] : []),
          ...(data.pb ? [['市净率(PB)', data.pb.toFixed(2)]] : []),
          ...(data.marketCap ? [['市值(亿)', (data.marketCap / 100000000).toFixed(2)]] : []),
          ...(data.roe ? [['ROE', `${data.roe.toFixed(2)}%`]] : []),
        ],
      },
    },
  ];
  
  if (data.risks && data.risks.length > 0) {
    sections.push({
      title: '三、风险提示',
      type: 'text',
      content: data.risks.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    });
  }
  
  if (data.opportunities && data.opportunities.length > 0) {
    sections.push({
      title: '四、机会分析',
      type: 'text',
      content: data.opportunities.map((o, i) => `${i + 1}. ${o}`).join('\n'),
    });
  }
  
  sections.push({
    title: '五、投资建议',
    type: 'text',
    content: `综合分析后，建议：${data.recommendation}\n\n以上仅供参考，不构成投资建议。`,
  });
  
  return {
    title: `${data.stockName}(${data.stockCode}) 分析报告`,
    stockCode: data.stockCode,
    stockName: data.stockName,
    generatedAt: new Date(),
    sections,
  };
}

/**
 * 组合报告模板
 */
export function generatePortfolioReport(data: {
  positions: Array<{
    stockCode: string;
    stockName: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    profit: number;
    profitPercent: number;
    weight: number;
  }>;
  totalValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  cash: number;
  date: string;
}): ReportData {
  const sections: ReportSection[] = [
    {
      title: '一、组合概况',
      type: 'text',
      content: `报告日期：${data.date}\n\n` +
        `总市值：¥${(data.totalValue / 10000).toFixed(2)}万\n` +
        `现金余额：¥${(data.cash / 10000).toFixed(2)}万\n` +
        `总资产：¥${((data.totalValue + data.cash) / 10000).toFixed(2)}万\n` +
        `持仓收益：¥${(data.totalProfit / 10000).toFixed(2)}万 (${data.totalProfitPercent.toFixed(2)}%)`,
    },
    {
      title: '二、持仓明细',
      type: 'table',
      content: '',
      data: {
        headers: ['股票代码', '股票名称', '持仓量', '成本价', '现价', '市值', '盈亏', '仓位'],
        rows: data.positions.map(p => [
          p.stockCode,
          p.stockName,
          p.quantity.toString(),
          `¥${p.avgCost.toFixed(2)}`,
          `¥${p.currentPrice.toFixed(2)}`,
          `¥${(p.marketValue / 10000).toFixed(2)}万`,
          `${p.profitPercent > 0 ? '+' : ''}${p.profitPercent.toFixed(2)}%`,
          `${p.weight.toFixed(1)}%`,
        ]),
      },
    },
    {
      title: '三、持仓分布',
      type: 'text',
      content: data.positions
        .sort((a, b) => b.weight - a.weight)
        .map((p, i) => `${i + 1}. ${p.stockName} ${p.weight.toFixed(1)}%`)
        .join('\n'),
    },
  ];
  
  return {
    title: '投资组合报告',
    generatedAt: new Date(),
    sections,
  };
}

/**
 * 每日总结报告
 */
export function generateDailySummaryReport(data: {
  date: string;
  market: {
    index: string;
    change: number;
    changePercent: number;
  };
  trades: Array<{
    time: string;
    stockCode: string;
    stockName: string;
    direction: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    amount: number;
  }>;
  news: Array<{
    title: string;
    sentiment: string;
  }>;
}): ReportData {
  const sections: ReportSection[] = [
    {
      title: '一、大盘回顾',
      type: 'text',
      content: `${data.date}\n\n` +
        `${data.market.index}：${data.market.change > 0 ? '+' : ''}${data.market.change.toFixed(2)} ` +
        `(${data.market.changePercent > 0 ? '+' : ''}${data.market.changePercent.toFixed(2)}%)`,
    },
    {
      title: '二、交易记录',
      type: 'table',
      content: data.trades.length === 0 ? '今日无交易' : '',
      data: data.trades.length > 0 ? {
        headers: ['时间', '股票代码', '股票名称', '方向', '价格', '数量', '金额'],
        rows: data.trades.map(t => [
          t.time,
          t.stockCode,
          t.stockName,
          t.direction,
          `¥${t.price.toFixed(2)}`,
          t.quantity.toString(),
          `¥${(t.amount / 10000).toFixed(2)}万`,
        ]),
      } : undefined,
    },
    {
      title: '三、重点资讯',
      type: 'text',
      content: data.news.length === 0 ? '今日无重点资讯' : 
        data.news.map((n, i) => `${i + 1}. ${n.title} [${n.sentiment}]`).join('\n'),
    },
  ];
  
  return {
    title: `每日总结 - ${data.date}`,
    generatedAt: new Date(),
    sections,
  };
}

// ==================== Markdown 渲染 ====================

/**
 * 渲染为 Markdown 格式
 */
export function renderToMarkdown(report: ReportData): string {
  const lines: string[] = [];
  
  // 标题
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt.toLocaleString('zh-CN')}`);
  lines.push('');
  
  // 章节
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    
    if (section.type === 'text') {
      lines.push(section.content);
    } else if (section.type === 'table' && section.data) {
      // 表头
      const headers = section.data.headers as string[];
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      
      // 数据行
      const rows = section.data.rows as string[][];
      for (const row of rows) {
        lines.push(`| ${row.join(' | ')} |`);
      }
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 渲染为 JSON 格式
 */
export function renderToJSON(report: ReportData): string {
  return JSON.stringify(report, null, 2);
}

/**
 * 渲染为 Text 格式
 */
export function renderToText(report: ReportData): string {
  const lines: string[] = [];
  
  // 标题
  lines.push(report.title);
  lines.push('='.repeat(report.title.length));
  lines.push(`生成时间：${report.generatedAt.toLocaleString('zh-CN')}`);
  lines.push('');
  
  // 章节
  for (const section of report.sections) {
    lines.push(section.title);
    lines.push('-'.repeat(section.title.length));
    lines.push(section.content);
    lines.push('');
  }
  
  return lines.join('\n');
}

// ==================== 工具函数 ====================

/**
 * 生成股票分析报告
 */
export async function generate_analysis_report(params: {
  stockCode: string;
  stockName: string;
  format?: 'markdown' | 'json' | 'text';
}): Promise<string> {
  logger.info(`[Report] Generating analysis report for ${params.stockCode}`);
  
  // 模拟数据（实际应该调用各个工具获取）
  const report = generateStockAnalysisReport({
    stockCode: params.stockCode,
    stockName: params.stockName,
    price: 100 + Math.random() * 50,
    change: (Math.random() - 0.5) * 10,
    changePercent: (Math.random() - 0.5) * 5,
    volume: 10000000 + Math.random() * 50000000,
    turnover: 1 + Math.random() * 5,
    pe: 15 + Math.random() * 20,
    pb: 1.5 + Math.random() * 3,
    marketCap: 100 + Math.random() * 500,
    roe: 8 + Math.random() * 15,
    recommendation: Math.random() > 0.5 ? 'BUY' : 'HOLD',
    summary: `${params.stockName}基本面良好，盈利能力稳定，技术面呈现多头趋势，建议关注。`,
    risks: ['市场整体回调风险', '行业政策变化'],
    opportunities: ['新产品研发进展', '市场份额提升'],
  });
  
  const format = params.format || 'markdown';
  
  switch (format) {
    case 'json':
      return renderToJSON(report);
    case 'text':
      return renderToText(report);
    default:
      return renderToMarkdown(report);
  }
}

/**
 * 生成组合报告
 */
export async function generate_portfolio_report(params: {
  format?: 'markdown' | 'json' | 'text';
}): Promise<string> {
  logger.info('[Report] Generating portfolio report');
  
  const positions = [
    { stockCode: '600519', stockName: '贵州茅台', quantity: 100, avgCost: 1600, currentPrice: 1800 },
    { stockCode: '000858', stockName: '五粮液', quantity: 200, avgCost: 150, currentPrice: 180 },
    { stockCode: '600036', stockName: '招商银行', quantity: 500, avgCost: 35, currentPrice: 40 },
  ].map((p, i) => ({
    ...p,
    marketValue: p.quantity * p.currentPrice,
    profit: (p.currentPrice - p.avgCost) * p.quantity,
    profitPercent: ((p.currentPrice - p.avgCost) / p.avgCost) * 100,
    weight: 0,
  }));
  
  // 计算权重
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  positions.forEach(p => {
    p.weight = (p.marketValue / totalValue) * 100;
  });
  
  const report = generatePortfolioReport({
    positions,
    totalValue,
    totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
    totalProfitPercent: (positions.reduce((sum, p) => sum + p.profit, 0) / 
      positions.reduce((sum, p) => sum + p.avgCost * p.quantity, 0)) * 100,
    cash: 50000,
    date: new Date().toISOString().split('T')[0],
  });
  
  const format = params.format || 'markdown';
  
  switch (format) {
    case 'json':
      return renderToJSON(report);
    case 'text':
      return renderToText(report);
    default:
      return renderToMarkdown(report);
  }
}
