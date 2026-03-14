/**
 * 飞书机器人服务
 * 
 * 发送消息/卡片/告警
 */

import { logger } from '../../utils/logger';

const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || '';

/**
 * 飞书消息类型
 */
export type FeishuMsgType = 'text' | 'post' | 'interactive';

/**
 * 发送文本消息
 */
export async function sendTextMessage(content: string): Promise<boolean> {
  if (!FEISHU_WEBHOOK) {
    logger.warn('[Feishu] 未配置WEBHOOK');
    return false;
  }
  
  try {
    const response = await fetch(FEISHU_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
    });
    
    return response.ok;
  } catch (error) {
    logger.error('[Feishu] 发送失败:', error);
    return false;
  }
}

/**
 * 发送富文本卡片
 */
export async function sendCardMessage(title: string, content: string, color: string = 'blue'): Promise<boolean> {
  const card = {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**${title}**` } },
      { tag: 'div', text: { tag: 'lark_md', content } },
    ],
    header: { title: { tag: 'plain_text', content: title }, color },
  };
  
  try {
    const response = await fetch(FEISHU_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'interactive', card: JSON.stringify(card) }),
    });
    
    return response.ok;
  } catch (error) {
    logger.error('[Feishu] 卡片发送失败:', error);
    return false;
  }
}

/**
 * 发送告警
 */
export async function sendAlert(alertType: string, message: string): Promise<boolean> {
  const emoji = alertType === 'danger' ? '🔴' : alertType === 'warning' ? '🟡' : '🔵';
  return sendCardMessage(`${emoji} ${alertType.toUpperCase()} 告警`, message, alertType === 'danger' ? 'red' : 'yellow');
}

/**
 * 发送交易信号
 */
export async function sendSignal(symbol: string, signal: 'buy' | 'sell' | 'hold', price: number, reason: string): Promise<boolean> {
  const emoji = signal === 'buy' ? '🟢' : signal === 'sell' ? '🔴' : '⚪';
  const content = `
**股票**: ${symbol}
**信号**: ${signal.toUpperCase()}
**价格**: ${price}
**原因**: ${reason}
  `.trim();
  
  return sendCardMessage(`📈 交易信号 - ${symbol}`, content, signal === 'buy' ? 'green' : signal === 'sell' ? 'red' : 'blue');
}

/**
 * 发送持仓报告
 */
export async function sendPortfolioReport(data: {
  totalValue: number;
  profit: number;
  positions: Array<{symbol: string; profitPct: number}>;
}): Promise<boolean> {
  const content = `
**总资产**: ¥${data.totalValue.toFixed(2)}
**盈亏**: ¥${data.profit.toFixed(2)}

${data.positions.map(p => `- ${p.symbol}: ${p.profitPct > 0 ? '+' : ''}${p.profitPct.toFixed(1)}%`).join('\n')}
  `.trim();
  
  return sendCardMessage('📊 持仓报告', content, data.profit >= 0 ? 'green' : 'red');
}

/**
 * 发送每日简报
 */
export async function sendDailyBrief(brief: {
  date: string;
  market: string;
  signals: number;
  positions: number;
  profit: number;
}): Promise<boolean> {
  const content = `
**日期**: ${brief.date}
**市场**: ${brief.market}
**信号数**: ${brief.signals}
**持仓数**: ${brief.positions}
**日盈亏**: ¥${brief.profit.toFixed(2)}
  `.trim();
  
  return sendCardMessage('📰 每日简报', content, 'blue');
}
