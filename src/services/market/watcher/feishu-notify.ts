/**
 * 飞书通知模块
 * 使用飞书应用发送告警通知
 */

import { WatchAlert } from './detector';
import { logger } from '../../../utils/logger';
import { sendMessageToUser } from '../../feishu/bot';

// 用户飞书 open_id (从环境变量或配置获取)
const FEISHU_USER_OPEN_ID = process.env.FEISHU_USER_OPEN_ID;

interface FeishuCard {
  config: { wide_screen_mode: boolean };
  header: {
    title: { tag: string; content: string };
    template: string;
  };
  elements: any[];
}

/**
 * 发送飞书告警通知
 */
export async function sendFeishuAlert(alert: WatchAlert): Promise<boolean> {
  // 构建卡片消息
  const card = buildAlertCard(alert);
  
  // 如果配置了用户 open_id，直接发送
  if (FEISHU_USER_OPEN_ID) {
    try {
      const result = await sendMessageToUser(FEISHU_USER_OPEN_ID, { card });
      if (result) {
        logger.info(`[Feishu] 告警发送成功: ${alert.symbol} ${alert.type}`);
        return true;
      }
    } catch (error) {
      logger.error('[Feishu] 发送失败:', error);
    }
  }
  
  // 否则打印日志（调试用）
  logger.info(`[Feishu] 告警 (未发送): ${alert.message}`);
  return false;
}

/**
 * 构建告警卡片
 */
function buildAlertCard(alert: WatchAlert): FeishuCard {
  const levelColors: Record<string, string> = {
    urgent: 'red',
    normal: 'orange',
    info: 'blue',
  };
  
  const levelEmoji: Record<string, string> = {
    urgent: '🔴',
    normal: '🟡',
    info: '🔵',
  };
  
  const color = levelColors[alert.level] || 'blue';
  const emoji = levelEmoji[alert.level] || '🔔';
  
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `${emoji} ${alert.type.replace('_', ' ').toUpperCase()} 告警`,
      },
      template: color,
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: alert.message,
        },
      },
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'plain_text',
              content: `📈 股票: ${alert.symbol}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'plain_text',
              content: `⏰ 时间: ${alert.timestamp.toLocaleString('zh-CN')}`,
            },
          },
        ],
      },
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: `📊 当前值: ${typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}`,
        },
      },
    ],
  };
}

/**
 * 发送文本消息
 */
export async function sendFeishuText(text: string): Promise<boolean> {
  if (!FEISHU_USER_OPEN_ID) {
    logger.info(`[Feishu] 文本消息 (未发送): ${text}`);
    return false;
  }
  
  try {
    const result = await sendMessageToUser(FEISHU_USER_OPEN_ID, { text });
    return !!result;
  } catch (error) {
    logger.error('[Feishu] 发送文本失败:', error);
    return false;
  }
}
