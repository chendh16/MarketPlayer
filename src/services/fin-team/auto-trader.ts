/**
 * 金融团队自动化系统
 * 
 * - 每日分析：强势股筛选 + 交易信号生成
 * - 交易执行：通过分析后自动/手动执行虚拟盘交易
 * - 复盘机制：每日/每周/每月复盘
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { init_virtual_account, get_virtual_summary, get_virtual_positions, virtual_buy, virtual_sell, virtual_short, virtual_cover } from '../../services/virtual';
import { sendMessageToUser } from '../../services/feishu/bot';

// ==================== 类型定义 ====================

export interface TradeSignal {
  symbol: string;
  market: 'us' | 'hk' | 'a';
  action: 'buy' | 'sell' | 'short' | 'cover';
  quantity: number;
  reason: string;
  confidence: number; // 0-1
  timestamp: Date;
}

export interface DailyAnalysis {
  date: string;
  strongStocks: string[];
  signals: TradeSignal[];
  executedTrades: number;
  summary: string;
}

// ==================== 存储 ====================

let dailyAnalysis: DailyAnalysis | null = null;
let tradeHistory: TradeSignal[] = [];
let pendingSignals: TradeSignal[] = [];

// ==================== 通知 ====================

async function notify(title: string, msg: string) {
  try {
    await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: `${title}\n\n${msg}` });
  } catch (e) {
    logger.error('[FinTeam] 通知失败', e);
  }
}

// ==================== 分析任务 ====================

/**
 * 每日市场分析 - 筛选强势股 + 生成信号
 */
async function runDailyAnalysis(): Promise<DailyAnalysis> {
  logger.info('[FinTeam] 开始每日分析...');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 模拟强势股筛选结果（实际应该调用强势股筛选服务）
  const strongStocks = [
    { symbol: 'AAPL', market: 'us' as const, reason: 'RSI超卖反弹', confidence: 0.75 },
    { symbol: 'NVDA', market: 'us' as const, reason: '突破新高', confidence: 0.80 },
    { symbol: '00700', market: 'hk' as const, reason: '量价齐升', confidence: 0.70 },
  ];
  
  // 生成信号
  const signals: TradeSignal[] = strongStocks.map(s => ({
    ...s,
    action: 'buy' as const,
    quantity: 100,
    timestamp: new Date(),
  }));
  
  dailyAnalysis = {
    date: today,
    strongStocks: strongStocks.map(s => s.symbol),
    signals,
    executedTrades: 0,
    summary: `分析了 ${strongStocks.length} 只强势股，产生 ${signals.length} 个信号`,
  };
  
  logger.info(`[FinTeam] 分析完成: ${signals.length} 个信号`);
  
  // 推送给用户审核
  let signalMsg = `📈 每日交易信号 (${today})\n\n`;
  for (const sig of signals) {
    signalMsg += `• ${sig.symbol} (${sig.market.toUpperCase()}) - ${sig.reason}\n`;
    signalMsg += `  建议: 买入 x${sig.quantity} 置信度: ${(sig.confidence * 100).toFixed(0)}%\n\n`;
  }
  signalMsg += `\n回复 "买入 [股票代码]" 确认执行`;
  
  await notify('📈 每日交易信号', signalMsg);
  
  return dailyAnalysis;
}

/**
 * 执行交易
 */
async function executeTrade(signal: TradeSignal): Promise<boolean> {
  try {
    let result;
    
    switch (signal.action) {
      case 'buy':
        result = await virtual_buy({ symbol: signal.symbol, market: signal.market, quantity: signal.quantity });
        break;
      case 'sell':
        result = await virtual_sell({ symbol: signal.symbol, market: signal.market, quantity: signal.quantity });
        break;
      case 'short':
        result = await virtual_short({ symbol: signal.symbol, market: signal.market, quantity: signal.quantity });
        break;
      case 'cover':
        result = await virtual_cover({ symbol: signal.symbol, market: signal.market, quantity: signal.quantity });
        break;
    }
    
    if (result.success) {
      tradeHistory.push(signal);
      logger.info(`[FinTeam] 交易执行成功: ${signal.symbol} ${signal.action}`);
      return true;
    }
    
    logger.warn(`[FinTeam] 交易失败: ${signal.symbol} - ${result.message}`);
    return false;
  } catch (e) {
    logger.error('[FinTeam] 交易执行异常', e);
    return false;
  }
}

// ==================== 复盘任务 ====================

/**
 * 每日复盘
 */
async function runDailyReview() {
  logger.info('[FinTeam] 每日复盘...');
  
  const summary = await get_virtual_summary();
  const positions = await get_virtual_positions();
  
  let msg = `📊 每日复盘 (${new Date().toLocaleDateString('zh-CN')})\n\n`;
  msg += `💰 账户总值: ¥${summary.summary.totalValue.toLocaleString()}\n`;
  msg += `📈 总盈亏: ${summary.summary.profitPercent >= 0 ? '+' : ''}${summary.summary.profitPercent.toFixed(2)}%\n`;
  msg += `💵 现金: ¥${summary.summary.cash.toLocaleString()}\n`;
  msg += `📋 持仓: ${summary.summary.positions} 只\n`;
  
  if (positions.positions.length > 0) {
    msg += `\n持仓明细:\n`;
    for (const p of positions.positions) {
      const emoji = p.profit >= 0 ? '🟢' : '🔴';
      msg += `${emoji} ${p.symbol} x${p.quantity} - ${p.profitPercent >= 0 ? '+' : ''}${p.profitPercent.toFixed(2)}%\n`;
    }
  }
  
  msg += `\n今日交易: ${tradeHistory.length} 笔`;
  
  await notify('📊 每日复盘', msg);
}

/**
 * 每周复盘
 */
async function runWeeklyReview() {
  logger.info('[FinTeam] 每周复盘...');
  
  const summary = await get_virtual_summary();
  const positions = await get_virtual_positions();
  
  // 简单统计
  const wins = positions.positions.filter(p => p.profit > 0).length;
  const losses = positions.positions.filter(p => p.profit < 0).length;
  const winRate = positions.positions.length > 0 ? (wins / positions.positions.length * 100) : 0;
  
  let msg = `📊 周度复盘 (第${Math.ceil(new Date().getDate() / 7)}周)\n\n`;
  msg += `💰 账户总值: ¥${summary.summary.totalValue.toLocaleString()}\n`;
  msg += `📈 本周盈亏: ${summary.summary.profitPercent >= 0 ? '+' : ''}${summary.summary.profitPercent.toFixed(2)}%\n`;
  msg += `🎯 胜率: ${winRate.toFixed(1)}% (${wins}胜 ${losses}负)\n`;
  msg += `📋 持仓: ${summary.summary.positions} 只\n`;
  msg += `📝 本周交易: ${tradeHistory.length} 笔\n`;
  
  // 成功总结
  msg += `\n✅ 成功总结:\n`;
  msg += `- 抓住 ${wins > 0 ? '上涨机会' : '无'}\n`;
  
  // 失败复盘
  msg += `\n❌ 失败复盘:\n`;
  msg += `- 亏损 ${losses} 只股票分析待改进\n`;
  
  // 下周计划
  msg += `\n📅 下周计划:\n`;
  msg += `- 继续关注强势股\n`;
  msg += `- 严格执行止损纪律\n`;
  
  await notify('📊 周度复盘', msg);
  
  // 重置交易历史
  tradeHistory = [];
}

/**
 * 每月复盘
 */
async function runMonthlyReview() {
  logger.info('[FinTeam] 每月复盘...');
  
  const summary = await get_virtual_summary();
  const positions = await get_virtual_positions();
  
  let msg = `📊 月度复盘 (${new Date().getFullYear()}年${new Date().getMonth() + 1}月)\n\n`;
  msg += `💰 账户总值: ¥${summary.summary.totalValue.toLocaleString()}\n`;
  msg += `📈 本月盈亏: ${summary.summary.profitPercent >= 0 ? '+' : ''}${summary.summary.profitPercent.toFixed(2)}%\n`;
  msg += `💵 初始资金: ¥1,000,000\n`;
  msg += `📋 当前持仓: ${summary.summary.positions} 只\n`;
  
  // 持仓分析
  if (positions.positions.length > 0) {
    msg += `\n📈 持仓分析:\n`;
    for (const p of positions.positions) {
      const status = p.profitPercent > 5 ? '🚀' : p.profitPercent > 0 ? '✅' : '⚠️';
      msg += `${status} ${p.symbol}: ${p.profitPercent >= 0 ? '+' : ''}${p.profitPercent.toFixed(2)}%\n`;
    }
  }
  
  // 策略评估
  msg += `\n🎯 策略评估:\n`;
  msg += `- 月度目标: ${summary.summary.profitPercent >= 3 ? '✅ 超额完成' : summary.summary.profitPercent >= 0 ? '✅ 完成目标' : '❌ 未达标'}\n`;
  
  // 下月计划
  msg += `\n📅 下月计划:\n`;
  msg += `- 优化选股策略\n`;
  msg += `- 调整仓位管理\n`;
  msg += `- 学习新技术指标\n`;
  
  await notify('📊 月度复盘', msg);
}

// ==================== 手动触发 ====================

/**
 * 手动执行分析
 */
export async function triggerAnalysis(): Promise<DailyAnalysis> {
  return await runDailyAnalysis();
}

/**
 * 手动执行交易信号
 */
export async function triggerTrade(signal: TradeSignal): Promise<boolean> {
  return await executeTrade(signal);
}

// ==================== 调度器启动 ====================

export function startFinTeamScheduler() {
  logger.info('[FinTeam] 启动金融团队调度器...');
  
  // 初始化账户
  init_virtual_account({ initialCash: 1000000 });
  
  // 每天 09:30 A股开盘 - 每日分析
  cron.schedule('30 9 * * 1-5', async () => {
    await runDailyAnalysis();
  });
  
  // 每天 14:00 下午开盘 - 二次分析
  cron.schedule('0 14 * * 1-5', async () => {
    await runDailyAnalysis();
  });
  
  // 每天 15:30 A股收盘 - 每日复盘
  cron.schedule('30 15 * * 1-5', async () => {
    await runDailyReview();
  });
  
  // 每周五 15:30 - 每周复盘
  cron.schedule('30 15 * * 5', async () => {
    await runWeeklyReview();
  });
  
  // 每月1号 - 月度复盘
  cron.schedule('0 16 * * 1', async () => {
    // 检查是否是月初第一个交易日
    const today = new Date().getDate();
    if (today <= 3) {
      await runMonthlyReview();
    }
  });
  
  // 每10分钟 - 持仓监控（交易时间）
  // cron.schedule('*/10 * * * *', async () => {
  //   const summary = await get_virtual_summary();
  //   logger.debug(`[FinTeam] 持仓监控: ¥${summary.summary.totalValue}`);
  // });
  
  logger.info('[FinTeam] 金融团队调度器已启动');
  logger.info('[FinTeam] - 每日分析: 09:30, 14:00');
  logger.info('[FinTeam] - 每日复盘: 15:30');
  logger.info('[FinTeam] - 每周复盘: 周五 15:30');
  logger.info('[FinTeam] - 每月复盘: 每月末');
}

// 导出主要函数
export default {
  startFinTeamScheduler,
  triggerAnalysis,
  triggerTrade,
};
