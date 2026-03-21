import { logger } from '../../utils/logger';
import { config } from '../../config';
import type { FeishuEvent, FeishuCardActionEvent, FeishuMessageEvent } from './types';
import {
  stepConfirmOrder,
  stepIgnoreDelivery,
  stepAbandonDelivery,
  stepAdjustAndConfirm,
  stepGetCopyTradeInfo,
  type ConfirmOrderResult,
} from '../../queues/steps/order-interact';
import { updateMessage } from './bot';
import { remindQueue } from '../../queues/remind-queue';
import { handleTechnicalQuery } from './technical-query';

/**
 * 处理飞书事件回调
 */
export async function handleFeishuEvent(event: FeishuEvent): Promise<any> {
  const { header, event: eventData } = event;

  // URL验证
  if (header.event_type === 'url_verification') {
    return { challenge: (eventData as any).challenge };
  }

  // 卡片按钮点击事件
  if (header.event_type === 'card.action.trigger') {
    await handleCardAction(eventData as FeishuCardActionEvent);
    return { code: 0 };
  }

  // 用户消息事件
  if (header.event_type === 'im.message.receive_v1') {
    await handleUserMessage(eventData as FeishuMessageEvent);
    return { code: 0 };
  }

  logger.warn(`Unknown Feishu event type: ${header.event_type}`);
  return { code: 0 };
}

/**
 * 处理用户文本消息
 */
async function handleUserMessage(eventData: FeishuMessageEvent): Promise<void> {
  try {
    const { message, chat_id, sender } = eventData;
    const openId = sender?.open_id;
    const text = message?.message_id ? '' : (eventData as any).message?.message?.text;
    
    if (!openId || !text) {
      logger.debug('[Feishu] 忽略无法处理的消息');
      return;
    }

    logger.info(`[Feishu] 收到用户消息 from ${openId}: ${text}`);

    // 处理技术指标查询
    if (text.match(/^(指标|技术|分析|查询|看)\s*[A-Za-z0-9]/i) || 
        text.match(/^[A-Z]{1,5}$/i) ||
        text.match(/^\d{5,6}$/) ||
        text.match(/^(苹果|特斯拉|微软|谷歌|英伟达|腾讯|阿里|茅台|平安)/)) {
      await handleTechnicalQuery(openId, text);
      return;
    }

    // 默认回复帮助信息
    const helpText = `📌 **MarketPlayer 命令**:
- 指标 AAPL / MSFT / TSLA
- 技术分析 600519 / 00700
- 查询 茅台 / 腾讯

支持: A股(6位代码), 美股(字母), 港股(5位代码)`;
    
    const { sendMessageToUser } = await import('./bot');
    await sendMessageToUser(openId, { text: helpText });

  } catch (error) {
    logger.error('[Feishu] 处理用户消息失败:', error);
  }
}

/**
 * 处理卡片按钮点击
 */
async function handleCardAction(eventData: FeishuCardActionEvent): Promise<void> {
  try {
    const { action, open_message_id } = eventData;
    const { action: actionType, deliveryId, orderToken } = action.value;

    logger.info(`Feishu card action: ${actionType}, delivery: ${deliveryId}`);

    // 立即禁用按钮
    await disableCardButtons(open_message_id);

    switch (actionType) {
      case 'confirm':
      case 'retry_order': {
        const result = await stepConfirmOrder(deliveryId, orderToken, false);
        await replyConfirmResult(result, open_message_id);
        break;
      }
      case 'confirm_warn': {
        const result = await stepConfirmOrder(deliveryId, orderToken, true);
        await replyConfirmResult(result, open_message_id);
        break;
      }
      case 'ignore': {
        const result = await stepIgnoreDelivery(deliveryId);
        await updateCardMessage(
          open_message_id,
          result.kind === 'ok' ? '已忽略本次信号参考' : '❌ 推送记录不存在或已失效'
        );
        break;
      }
      case 'abandon': {
        const result = await stepAbandonDelivery(deliveryId);
        await updateCardMessage(
          open_message_id,
          result.kind === 'ok' ? '❌ 已放弃本次交易' : '❌ 推送记录不存在或已失效'
        );
        break;
      }
      case 'adjust': {
        // 飞书不支持 Modal，需要通过其他方式实现
        // 这里简化处理，提示用户使用其他方式调整
        await updateCardMessage(
          open_message_id,
          '⚠️ 飞书暂不支持直接调整仓位，请使用 Discord 或 API 调整'
        );
        break;
      }
      case 'remind': {
        await handleRemind(deliveryId, eventData.open_id, open_message_id);
        break;
      }
      case 'copy_trade': {
        const result = await stepGetCopyTradeInfo(deliveryId);
        if (result.kind === 'not_found') {
          await updateCardMessage(open_message_id, '❌ 推送记录或信号不存在');
          break;
        }
        const { payload } = result;
        const text = [
          '📋 交易信息（可复制）',
          `标的: ${payload.symbol}`,
          `市场: ${payload.market.toUpperCase()}`,
          `方向: ${payload.direction === 'long' ? '买入' : '卖出'}`,
          `参考仓位: ${payload.suggestedPositionPct}%`,
          `依据: ${payload.reasoning}`,
        ].join('\n');
        await updateCardMessage(open_message_id, text);
        break;
      }
      default:
        await updateCardMessage(open_message_id, '未知操作');
    }
  } catch (error) {
    logger.error('Error handling Feishu card action:', error);
  }
}

/**
 * 禁用卡片所有按钮
 */
async function disableCardButtons(messageId: string): Promise<void> {
  const card = {
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: '处理中...',
        },
      },
    ],
  };
  await updateMessage(messageId, card);
}

/**
 * 更新卡片消息
 */
async function updateCardMessage(messageId: string, content: string): Promise<void> {
  const card = {
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content,
        },
      },
    ],
  };
  await updateMessage(messageId, card);
}

/**
 * 回复确认结果
 */
async function replyConfirmResult(result: ConfirmOrderResult, messageId: string): Promise<void> {
  let message: string;
  switch (result.kind) {
    case 'queued':
      message = '⏳ 已确认，正在执行下单并回写结果...';
      break;
    case 'not_found':
      message = '❌ 推送记录不存在或已失效';
      break;
    case 'wrong_status':
      message = `⚠️ 当前状态为 ${result.currentStatus}，无法再次确认`;
      break;
    case 'token_mismatch':
      message = '⚠️ 该按钮已过期，请使用最新消息操作';
      break;
  }
  await updateCardMessage(messageId, message);
}

/**
 * 处理提醒
 */
async function handleRemind(
  deliveryId: string,
  openId: string,
  messageId: string
): Promise<void> {
  const jobId = `remind:${deliveryId}`;
  const existing = await remindQueue.getJob(jobId);
  if (existing) {
    await updateCardMessage(messageId, '⏰ 提醒已设置，请等待');
    return;
  }

  await remindQueue.add(
    'send-remind',
    { deliveryId, feishuOpenId: openId },
    { delay: 30 * 60 * 1000, jobId }
  );

  await updateCardMessage(messageId, '⏰ 好的，将在 30 分钟后提醒您此信号');
}
