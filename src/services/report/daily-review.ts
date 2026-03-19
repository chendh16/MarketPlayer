/**
 * 每日复盘服务
 * 自动分析持仓表现、交易记录、策略信号
 */

import { logger } from '../../utils/logger';
import { syncFutuAccount } from '../futu/python-api';
import { getHistoryKLine, KLine } from '../market/quote-service';
import { StrategySignal, combinedStrategy } from '../../strategies/quant-engine';

export interface DailyReview {
  date: string;
  account: {
    power: number;
    cash: number;
    totalValue: number;
  };
  positions: PositionReview[];
  trades: TradeRecord[];
  signals: StrategySignal[];
  summary: string;
  suggestions: string[];
}

export interface PositionReview {
  code: string;
  name: string;
  qty: number;
  avgCost: number;
  currentPrice: number;
  change: number;
  changePct: number;
  pnl: number;
  pnlPct: number;
  rsi?: number;
  macd?: string;
  signal: string;
}

export interface TradeRecord {
  time: string;
  code: string;
  direction: 'buy' | 'sell';
  price: number;
  qty: number;
  amount: number;
}

/**
 * 获取每日复盘报告
 */
export async function getDailyReview(): Promise<DailyReview> {
  logger.info('[DailyReview] 开始生成每日复盘...');
  
  const date = new Date().toISOString().split('T')[0];
  
  // 获取富途账户数据
  const { account, positions } = await syncFutuAccount();
  
  const positionReviews: PositionReview[] = [];
  const signals: StrategySignal[] = [];
  
  // 分析每个持仓
  for (const pos of positions) {
    const symbol = pos.code.replace('US.', '');
    const market: 'us' = 'us';
    
    // 获取K线
    const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
    const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;
    const yesterdayPrice = klines.length > 1 ? klines[klines.length - 2].close : currentPrice;
    
    // 计算涨跌
    const change = currentPrice - yesterdayPrice;
    const changePct = yesterdayPrice > 0 ? (change / yesterdayPrice) * 100 : 0;
    
    // 计算盈亏
    const pnl = (currentPrice - pos.qty) * pos.qty - (pos.qty * pos.qty); // 简化计算
    const pnlPct = pos.qty > 0 ? ((currentPrice - pos.qty) / pos.qty) * 100 : 0;
    
    // 获取策略信号
    let signal = 'HOLD';
    try {
      const strategySignal = await combinedStrategy({ symbol, market });
      signals.push(strategySignal);
      signal = strategySignal.signal === 'buy' ? '买入' : strategySignal.signal === 'sell' ? '卖出' : '持有';
    } catch (e) {
      logger.warn(`[DailyReview] 获取${symbol}策略信号失败`);
    }
    
    positionReviews.push({
      code: pos.code,
      name: pos.name,
      qty: pos.qty,
      avgCost: pos.qty, // 简化
      currentPrice,
      change,
      changePct,
      pnl: 0, // 需要成本价计算
      pnlPct,
      signal,
    });
  }
  
  // 计算总资产
  const totalValue = account.cash + positionReviews.reduce((sum, p) => sum + p.currentPrice * p.qty, 0);
  
  // 生成总结
  const summary = generateSummary(positionReviews, account.cash, totalValue);
  const suggestions = generateSuggestions(positionReviews, signals);
  
  return {
    date,
    account: {
      power: account.power,
      cash: account.cash,
      totalValue,
    },
    positions: positionReviews,
    trades: [], // 需要从交易记录获取
    signals,
    summary,
    suggestions,
  };
}

/**
 * 生成复盘总结
 */
function generateSummary(positions: PositionReview[], cash: number, totalValue: number): string {
  if (positions.length === 0) {
    return `今日无持仓。现金: ¥${cash.toFixed(2)}`;
  }
  
  const upCount = positions.filter(p => p.changePct > 0).length;
  const downCount = positions.filter(p => p.changePct < 0).length;
  const totalPnl = positions.reduce((sum, p) => sum + (p.changePct * p.qty), 0);
  
  return `
📊 每日复盘 ${new Date().toISOString().split('T')[0]}
━━━━━━━━━━━━━━━━━━━━
💰 总资产: ¥${totalValue.toFixed(2)}
💵 现金: ¥${cash.toFixed(2)}
📈 持仓: ${positions.length}只
  - 上涨: ${upCount}只
  - 下跌: ${downCount}只
  - 平盘: ${positions.length - upCount - downCount}只
`.trim();
}

/**
 * 生成操作建议
 */
function generateSuggestions(positions: PositionReview[], signals: StrategySignal[]): string[] {
  const suggestions: string[] = [];
  
  // 根据持仓信号
  for (const pos of positions) {
    if (pos.signal === '卖出') {
      suggestions.push(`⚠️ ${pos.name}(${pos.code}) 建议卖出 - 策略信号`);
    }
  }
  
  // 根据整体信号
  const buySignals = signals.filter(s => s.signal === 'buy');
  const sellSignals = signals.filter(s => s.signal === 'sell');
  
  if (buySignals.length > 0) {
    suggestions.push(`📈 有${buySignals.length}个标的出现买入信号`);
  }
  
  if (sellSignals.length > 0) {
    suggestions.push(`📉 有${sellSignals.length}个标的出现卖出信号`);
  }
  
  if (suggestions.length === 0) {
    suggestions.push('✅ 当前无特殊操作建议');
  }
  
  return suggestions;
}

/**
 * 格式化复盘报告为文本
 */
export function formatDailyReview(review: DailyReview): string {
  let report = `
╔════════════════════════════════════════════════════════════╗
║                    📈 每日交易复盘报告                       ║
║                       ${review.date}                          ║
╚════════════════════════════════════════════════════════════╝

🏦 账户概况
────────────────────────────────────────────────────────────
  现金: ¥${review.account.cash.toFixed(2)}
  可用资金: ¥${review.account.power.toFixed(2)}
  总资产: ¥${review.account.totalValue.toFixed(2)}

📊 持仓表现
────────────────────────────────────────────────────────────
`;
  
  if (review.positions.length === 0) {
    report += '  暂无持仓\n';
  } else {
    for (const pos of review.positions) {
      const emoji = pos.changePct > 0 ? '📈' : pos.changePct < 0 ? '📉' : '➡️';
      report += `
  ${emoji} ${pos.name} (${pos.code})
     持仓: ${pos.qty}股 | 当前价: ¥${pos.currentPrice.toFixed(2)}
     涨跌: ${pos.changePct >= 0 ? '+' : ''}${pos.changePct.toFixed(2)}%
     信号: ${pos.signal}
`;
    }
  }
  
  report += `
💡 策略信号
────────────────────────────────────────────────────────────
`;
  
  if (review.signals.length === 0) {
    report += '  无信号\n';
  } else {
    const buySignals = review.signals.filter(s => s.signal === 'buy');
    const sellSignals = review.signals.filter(s => s.signal === 'sell');
    
    if (buySignals.length > 0) {
      report += '  买入信号:\n';
      for (const s of buySignals) {
        report += `    • ${s.symbol}: ${s.reason}\n`;
      }
    }
    
    if (sellSignals.length > 0) {
      report += '  卖出信号:\n';
      for (const s of sellSignals) {
        report += `    • ${s.symbol}: ${s.reason}\n`;
      }
    }
  }
  
  report += `
📝 操作建议
────────────────────────────────────────────────────────────
`;
  
  for (const suggestion of review.suggestions) {
    report += `  ${suggestion}\n`;
  }
  
  report += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  报告生成时间: ${new Date().toLocaleString('zh-CN')}
`;
  
  return report;
}
