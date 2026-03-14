/**
 * 通知 MCP 工具
 */

import { logger } from '../../utils/logger';
import { sendTextMessage, sendCardMessage, sendAlert, sendSignal, sendPortfolioReport, sendDailyBrief } from '../../services/notify/feishu-bot';

/**
 * 发送文本
 */
export async function notify_text(params: { content: string }): Promise<{ success: boolean; message: string }> {
  const success = await sendTextMessage(params.content);
  return { success, message: success ? '发送成功' : '发送失败' };
}

/**
 * 发送卡片
 */
export async function notify_card(params: { title: string; content: string; color?: string }): Promise<{ success: boolean; message: string }> {
  const success = await sendCardMessage(params.title, params.content, params.color);
  return { success, message: success ? '发送成功' : '发送失败' };
}

/**
 * 发送告警
 */
export async function notify_alert(params: { type: 'danger' | 'warning' | 'info'; message: string }): Promise<{ success: boolean; message: string }> {
  const success = await sendAlert(params.type, params.message);
  return { success, message: success ? '发送成功' : '发送失败' };
}

/**
 * 发送交易信号
 */
export async function notify_signal(params: { symbol: string; signal: 'buy' | 'sell' | 'hold'; price: number; reason: string }): Promise<{ success: boolean; message: string }> {
  const success = await sendSignal(params.symbol, params.signal, params.price, params.reason);
  return { success, message: success ? '发送成功' : '发送失败' };
}

/**
 * 发送持仓报告
 */
export async function notify_portfolio(params: { totalValue: number; profit: number; positions: Array<{symbol: string; profitPct: number}> }): Promise<{ success: boolean; message: string }> {
  const success = await sendPortfolioReport(params);
  return { success, message: success ? '发送成功' : '发送失败' };
}

/**
 * 发送每日简报
 */
export async function notify_daily(params: { date: string; market: string; signals: number; positions: number; profit: number }): Promise<{ success: boolean; message: string }> {
  const success = await sendDailyBrief(params);
  return { success, message: success ? '发送成功' : '发送失败' };
}
