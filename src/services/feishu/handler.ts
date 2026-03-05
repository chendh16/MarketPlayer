import { logger } from '../../utils/logger';
import { config } from '../../config';
import type { FeishuEvent, FeishuCardActionEvent } from './types';
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
    await handleCardAction(eventData);
    return { code: 0 };
  }

  logger.warn(`Unknown Feishu event type: ${header.event_type}`);
  return { code: 0 };
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
