/**
 * 短线信号通知器
 * 将买入信号推送到飞书
 */

import { logger } from '../../utils/logger';
import { ShortTermSignal } from '../../strategies/shortTerm';

// 飞书消息发送占位符（实际通过主进程发送）
let sendMessageFn: ((text: string) => Promise<void>) | null = null;

export function setMessageSender(fn: (text: string) => Promise<void>) {
  sendMessageFn = fn;
}

/**
 * 发送短线信号到飞书
 */
export async function sendShortTermSignals(market: 'a' | 'hk' | 'us', signals: ShortTermSignal[]) {
  const marketName = { a: 'A股', hk: '港股', us: '美股' }[market];
  
  if (signals.length === 0) {
    logger.info(`[ShortTerm] ${marketName}无买入信号`);
    return;
  }
  
  // 构建消息
  let text = `📈 ${marketName}短线信号 (3-5天持股)\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  for (const s of signals) {
    const emoji = s.signal === 'BUY' ? '🟢' : '🔴';
    text += `${emoji} ${s.name} (${s.symbol})\n`;
    text += `   形态: ${s.pattern}\n`;
    text += `   入场: ¥${s.entryPrice.toFixed(2)}\n`;
    text += `   止损: ¥${s.stopLoss.toFixed(2)} (-5%)\n`;
    text += `   目标: ¥${s.targetPrice.toFixed(2)} (+8%)\n`;
    text += `   持股: ${s.holdDays}天\n`;
    text += `   强度: ${s.strength}\n`;
    text += `   原因: ${s.reasons.join(', ')}\n`;
    text += `\n`;
  }
  
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💡 建议: 符合条件可轻仓介入，严格止损`;
  
  // 尝试通过主进程发送
  if (sendMessageFn) {
    try {
      await sendMessageFn(text);
      logger.info(`[ShortTerm] 已推送${marketName}短线信号: ${signals.length}个`);
    } catch (e) {
      logger.error(`[ShortTerm] 推送失败:`, e);
    }
  } else {
    logger.info(`[ShortTerm] 消息发送功能未注册，信号: ${signals.length}个`);
    logger.info(text);
  }
}

/**
 * 发送持仓提醒
 */
export async function sendPositionAlert(code: string, name: string, alert: string, price: number) {
  const text = `⚠️ 持仓提醒\n━━━━━━━━━━━━━━━━━━━━\n${name} (${code})\n${alert}\n当前价格: ¥${price.toFixed(2)}`;
  
  if (sendMessageFn) {
    try {
      await sendMessageFn(text);
    } catch (e) {
      logger.error('[ShortTerm] 持仓提醒推送失败:', e);
    }
  } else {
    logger.info('[ShortTerm] 持仓提醒:', text);
  }
}

/**
 * 发送交易通知 (买入/卖出)
 */
export async function sendTradeNotification(
  action: 'buy' | 'sell',
  name: string,
  symbol: string,
  price: number,
  qty: number,
  amount: number,
  remainingCash: number
) {
  const emoji = action === 'buy' ? '🟢' : '🔴';
  const actionText = action === 'buy' ? '买入' : '卖出';
  
  const text = `${emoji} 自动${actionText}\n━━━━━━━━━━━━━━━━━━━━\n${name} (${symbol})\n${actionText}: ${qty}股 @ ¥${price.toFixed(2)}\n金额: ¥${amount.toFixed(2)}\n💰 剩余资金: ¥${remainingCash.toFixed(2)}`;
  
  if (sendMessageFn) {
    try {
      await sendMessageFn(text);
      logger.info(`[ShortTerm] 已推送${actionText}通知`);
    } catch (e) {
      logger.error('[ShortTerm] 交易通知推送失败:', e);
    }
  } else {
    logger.info('[ShortTerm] 交易通知:', text);
  }
}
