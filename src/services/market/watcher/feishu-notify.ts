/**
 * 飞书通知模块
 * 使用飞书应用发送告警通知
 */

import { WatchAlert } from './detector';
import { logger } from '../../../utils/logger';
import { sendMessageToUser, sendMessageToChat } from '../../feishu/bot';

// 从配置获取飞书参数
const FEISHU_USER_OPEN_ID = process.env.FEISHU_USER_OPEN_ID;
const FEISHU_CHAT_ID = process.env.FEISHU_CHAT_ID;

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
 * 优先发送到群聊，其次发送到用户
 */
export async function sendFeishuAlert(alert: WatchAlert): Promise<boolean> {
  // 构建卡片消息
  const card = buildAlertCard(alert);
  
  // 优先发送到群聊
  if (FEISHU_CHAT_ID) {
    try {
      const result = await sendMessageToChat(FEISHU_CHAT_ID, { card });
      if (result) {
        logger.info(`[Feishu] 群聊告警发送成功: ${alert.symbol} ${alert.type}`);
        return true;
      }
    } catch (error) {
      logger.error('[Feishu] 群聊发送失败:', error);
    }
  }
  
  // 其次发送到用户
  if (FEISHU_USER_OPEN_ID) {
    try {
      const result = await sendMessageToUser(FEISHU_USER_OPEN_ID, { card });
      if (result) {
        logger.info(`[Feishu] 用户告警发送成功: ${alert.symbol} ${alert.type}`);
        return true;
      }
    } catch (error) {
      logger.error('[Feishu] 用户发送失败:', error);
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
 * 优先发送到群聊，其次发送到用户
 */
export async function sendFeishuText(text: string): Promise<boolean> {
  let success = false;
  
  // 优先发送到群聊
  if (FEISHU_CHAT_ID) {
    try {
      const result = await sendMessageToChat(FEISHU_CHAT_ID, { text });
      success = !!result;
    } catch (error) {
      logger.error('[Feishu] 群聊发送文本失败:', error);
    }
  }
  
  // 其次发送到用户
  if (!success && FEISHU_USER_OPEN_ID) {
    try {
      const result = await sendMessageToUser(FEISHU_USER_OPEN_ID, { text });
      success = !!result;
    } catch (error) {
      logger.error('[Feishu] 用户发送文本失败:', error);
    }
  }
  
  if (!success) {
    logger.info(`[Feishu] 文本消息 (未发送): ${text}`);
  }
  return success;
}
