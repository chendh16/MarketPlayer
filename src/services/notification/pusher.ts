import { User } from '../../models/user';
import { Signal, SignalDelivery, RiskCheckResult, NewsItem } from '../../models/signal';
import { AccountSnapshot } from '../../models/position';
import { AnalysisResult } from '../ai/analyzer';
import { logger } from '../../utils/logger';
import { config } from '../../config';

// Discord
import { sendSignalToUser as sendDiscordMessage } from '../discord/bot';
import {
  buildNormalSignalMessage,
  buildWarningSignalMessage,
  buildNewsOnlyMessage,
} from '../discord/formatter';

// Feishu
import { sendMessageToUser as sendFeishuMessage } from '../feishu/bot';
import {
  buildNormalSignalCard,
  buildWarningSignalCard,
  buildNewsOnlyCard,
} from '../feishu/formatter';

export interface PushResult {
  discord?: { messageId: string; channelId: string } | null;
  feishu?: { messageId: string } | null;
}

/**
 * 推送信号给用户（支持多渠道）
 */
export async function pushSignalToUser(
  user: User,
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult,
  accountSnapshot: AccountSnapshot
): Promise<PushResult> {
  const result: PushResult = {};
  const channels = user.notificationChannels || ['discord'];

  // Discord 推送
  if (channels.includes('discord') && user.discordUserId) {
    try {
      let message: any;
      if (riskCheck.status === 'warning') {
        message = buildWarningSignalMessage(signal, delivery, riskCheck);
      } else {
        message = buildNormalSignalMessage(signal, delivery, riskCheck, accountSnapshot);
      }
      result.discord = await sendDiscordMessage(user.discordUserId, message);
    } catch (error) {
      logger.error(`Failed to push signal to Discord for user ${user.id}:`, error);
      result.discord = null;
    }
  }

  // 飞书推送
  if (channels.includes('feishu') && user.feishuOpenId && config.FEISHU_APP_ID) {
    try {
      let card: any;
      if (riskCheck.status === 'warning') {
        card = buildWarningSignalCard(signal, delivery, riskCheck);
      } else {
        card = buildNormalSignalCard(signal, delivery, riskCheck, accountSnapshot);
      }
      result.feishu = await sendFeishuMessage(user.feishuOpenId, { card });
    } catch (error) {
      logger.error(`Failed to push signal to Feishu for user ${user.id}:`, error);
      result.feishu = null;
    }
  }

  return result;
}

/**
 * 推送纯资讯解读给用户（支持多渠道）
 */
export async function pushNewsOnlyToUser(
  user: User,
  newsItem: NewsItem,
  analysis: AnalysisResult
): Promise<PushResult> {
  const result: PushResult = {};
  const channels = user.notificationChannels || ['discord'];

  // Discord 推送
  if (channels.includes('discord') && user.discordUserId) {
    try {
      const message = buildNewsOnlyMessage(newsItem, analysis);
      result.discord = await sendDiscordMessage(user.discordUserId, message);
    } catch (error) {
      logger.error(`Failed to push news to Discord for user ${user.id}:`, error);
      result.discord = null;
    }
  }

  // 飞书推送
  if (channels.includes('feishu') && user.feishuOpenId && config.FEISHU_APP_ID) {
    try {
      const card = buildNewsOnlyCard(newsItem, analysis);
      result.feishu = await sendFeishuMessage(user.feishuOpenId, { card });
    } catch (error) {
      logger.error(`Failed to push news to Feishu for user ${user.id}:`, error);
      result.feishu = null;
    }
  }

  return result;
}

/**
 * 发送文本消息给用户（支持多渠道）
 */
export async function sendTextToUser(user: User, text: string): Promise<PushResult> {
  const result: PushResult = {};
  const channels = user.notificationChannels || ['discord'];

  // Discord 推送
  if (channels.includes('discord') && user.discordUserId) {
    try {
      result.discord = await sendDiscordMessage(user.discordUserId, text);
    } catch (error) {
      logger.error(`Failed to send text to Discord for user ${user.id}:`, error);
      result.discord = null;
    }
  }

  // 飞书推送
  if (channels.includes('feishu') && user.feishuOpenId && config.FEISHU_APP_ID) {
    try {
      result.feishu = await sendFeishuMessage(user.feishuOpenId, { text });
    } catch (error) {
      logger.error(`Failed to send text to Feishu for user ${user.id}:`, error);
      result.feishu = null;
    }
  }

  return result;
}
