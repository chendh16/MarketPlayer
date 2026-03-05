import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { FeishuAccessTokenResponse, FeishuMessageResponse } from './types';

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * 获取飞书 tenant_access_token
 */
async function getTenantAccessToken(): Promise<string> {
  // 检查缓存
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: config.FEISHU_APP_ID,
        app_secret: config.FEISHU_APP_SECRET,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data: FeishuAccessTokenResponse = await response.json();

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`Failed to get access token: ${data.msg}`);
    }

    cachedAccessToken = data.tenant_access_token;
    // 提前5分钟过期，避免边界问题
    tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;

    logger.info('Feishu access token refreshed');
    return cachedAccessToken;
  } catch (error) {
    logger.error('Failed to get Feishu access token:', error);
    throw error;
  }
}

/**
 * 发送消息给飞书用户
 * @param openId 用户的 open_id
 * @param message 消息内容（支持文本或卡片）
 * @returns 消息ID，失败返回 null
 */
export async function sendMessageToUser(
  openId: string,
  message: { text?: string; card?: any }
): Promise<{ messageId: string } | null> {
  try {
    const token = await getTenantAccessToken();

    const body: any = {
      receive_id: openId,
      msg_type: message.card ? 'interactive' : 'text',
    };

    if (message.card) {
      body.content = JSON.stringify(message.card);
    } else if (message.text) {
      body.content = JSON.stringify({ text: message.text });
    } else {
      throw new Error('Message must have either text or card');
    }

    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const data: FeishuMessageResponse = await response.json();

    if (data.code !== 0 || !data.data?.message_id) {
      logger.error(`Failed to send Feishu message to ${openId}: ${data.msg}`);
      return null;
    }

    logger.info(`Feishu message sent to ${openId}: ${data.data.message_id}`);
    return { messageId: data.data.message_id };
  } catch (error) {
    logger.error(`Error sending Feishu message to ${openId}:`, error);
    return null;
  }
}

/**
 * 更新已发送的消息卡片
 * @param messageId 消息ID
 * @param card 新的卡片内容
 */
export async function updateMessage(messageId: string, card: any): Promise<void> {
  try {
    const token = await getTenantAccessToken();

    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: JSON.stringify(card),
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data: FeishuMessageResponse = await response.json();

    if (data.code !== 0) {
      logger.error(`Failed to update Feishu message ${messageId}: ${data.msg}`);
    }
  } catch (error) {
    logger.error(`Error updating Feishu message ${messageId}:`, error);
  }
}
