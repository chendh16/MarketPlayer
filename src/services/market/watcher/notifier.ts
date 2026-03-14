/**
 * 通知推送服务
 * 
 * 支持飞书和邮件推送
 */

import { logger } from '../../../utils/logger';
import { sendEmail } from '../../email/mailer';
import { WatchAlert } from './detector';

// 飞书Webhook配置
const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;

/**
 * 发送通知
 */
export async function sendNotifications(alert: WatchAlert): Promise<void> {
  // 1. 发送飞书
  await sendFeishuNotification(alert);
  
  // 2. 发送邮件
  await sendEmailNotification(alert);
  
  logger.info(`[Notifier] 已发送 ${alert.symbol} 告警通知`);
}

/**
 * 发送飞书通知
 */
async function sendFeishuNotification(alert: WatchAlert): Promise<void> {
  if (!FEISHU_WEBHOOK_URL) {
    logger.warn('[Notifier] 未配置飞书Webhook');
    return;
  }
  
  // 根据告警类型设置颜色
  const colorMap: Record<string, string> = {
    'limit_up': 'red',
    'limit_down': 'green',
    'price_change': 'blue',
    'volume_surge': 'orange',
    'rsi_overbought': 'red',
    'rsi_oversold': 'green',
    'ma_golden_cross': 'green',
    'ma_death_cross': 'red',
  };
  
  const color = colorMap[alert.condition] || 'blue';
  
  const payload = {
    msg_type: 'interactive',
    card: {
      header: {
        title: {
          tag: 'plain_text',
          content: `📈 ${alert.condition.replace('_', ' ').toUpperCase()}`,
        },
        template: color,
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${alert.message}**\n\n` +
              `当前价格: ¥${alert.quote.lastPrice.toFixed(2)}\n` +
              `涨跌: ${alert.quote.changePercent > 0 ? '+' : ''}${alert.quote.changePercent.toFixed(2)}%\n` +
              `成交量: ${(alert.quote.volume / 10000).toFixed(0)}万手`
          }
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '查看详情'
              },
              url: `https://quote.eastmoney.com/sh${alert.symbol}.html`,
              type: 'primary'
            }
          ]
        }
      ]
    }
  };
  
  try {
    const response = await fetch(FEISHU_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`飞书推送失败: ${response.status}`);
    }
    
    logger.info(`[Notifier] 飞书通知发送成功: ${alert.symbol}`);
  } catch (error) {
    logger.error('[Notifier] 飞书通知发送失败:', error);
  }
}

/**
 * 发送邮件通知
 */
async function sendEmailNotification(alert: WatchAlert): Promise<void> {
  const subject = `[MarketPlayer] ${alert.condition.replace('_', ' ').toUpperCase()} - ${alert.symbol}`;
  
  const html = `
    <h2>${alert.message}</h2>
    
    <table style="border-collapse: collapse; width: 100%;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>股票代码</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.symbol}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>股票名称</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.quote.name}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>当前价格</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">¥${alert.quote.lastPrice.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>涨跌幅</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.quote.changePercent > 0 ? '+' : ''}${alert.quote.changePercent.toFixed(2)}%</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>成交量</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${(alert.quote.volume / 10000).toFixed(0)}万手</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><b>触发时间</b></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.timestamp.toLocaleString('zh-CN')}</td>
      </tr>
    </table>
    
    <p style="color: #666; font-size: 12px; margin-top: 20px;">
      本邮件由 MarketPlayer 自动发送
    </p>
  `;
  
  try {
    // 发送给配置的用户
    const to = process.env.ALERT_EMAIL_TO || 'default@example.com';
    await sendEmail({
      to,
      subject,
      html,
    });
    
    logger.info(`[Notifier] 邮件通知发送成功: ${alert.symbol}`);
  } catch (error) {
    logger.error('[Notifier] 邮件通知发送失败:', error);
  }
}

/**
 * 发送测试通知
 */
export async function sendTestNotification(userId: string): Promise<boolean> {
  const testAlert: WatchAlert = {
    ruleId: 0,
    userId,
    symbol: '600519',
    condition: 'test',
    triggerValue: 0,
    message: '【测试消息】实时看盘服务配置成功！',
    quote: {
      symbol: '600519',
      name: '贵州茅台',
      lastPrice: 1800.00,
      change: 50.00,
      changePercent: 2.86,
      volume: 1000000,
      amount: 1800000000,
      prevClose: 1750.00,
      limitUp: 1925.00,
      limitDown: 1575.00,
    },
    timestamp: new Date(),
  };
  
  await sendNotifications(testAlert);
  return true;
}
