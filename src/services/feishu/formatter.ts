import { Signal, SignalDelivery, RiskCheckResult, NewsItem } from '../../models/signal';
import { AccountSnapshot } from '../../models/position';
import { AnalysisResult } from '../ai/analyzer';
import type { FeishuCard, FeishuCardElement, FeishuCardAction } from './types';

/**
 * 构建正常交易信号卡片
 */
export function buildNormalSignalCard(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult,
  account: AccountSnapshot
): FeishuCard {
  const directionEmoji = signal.direction === 'long' ? '📈' : '📉';
  const directionText = signal.direction === 'long' ? '看多' : '看空';

  const elements: FeishuCardElement[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**标的：** ${signal.symbol}\n**信号方向：** ${directionEmoji} ${directionText}\n**参考仓位：** 账户 ${signal.suggestedPositionPct}%\n**参考依据：** ${signal.reasoning}`,
      },
    },
    {
      tag: 'hr',
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `🛡️ **风控检查：** ${riskCheck.status === 'pass' ? '✅ 通过' : '⚠️ 注意'}`,
      },
    },
    {
      tag: 'action',
      actions: buildNormalActions(delivery, signal.market),
    },
    {
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: '免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负',
        },
      ],
    },
  ];

  const expiresAt = new Date(delivery.sentAt.getTime() + 15 * 60 * 1000);
  const expiresText = `⏱️ 本参考将于 ${expiresAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 失效`;

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `📊 AI信号参考｜置信度 ${signal.confidence}%`,
      },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: expiresText,
        },
      },
      ...elements,
    ],
  };
}

/**
 * 构建正常信号的按钮组
 */
function buildNormalActions(delivery: SignalDelivery, market: string): FeishuCardAction[] {
  const actions: FeishuCardAction[] = [
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '✅ 确认下单',
      },
      type: 'primary',
      value: {
        action: 'confirm',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '✏️ 调整仓位',
      },
      type: 'default',
      value: {
        action: 'adjust',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '⏰ 30分钟后提醒',
      },
      type: 'default',
      value: {
        action: 'remind',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '❌ 忽略',
      },
      type: 'danger',
      value: {
        action: 'ignore',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
  ];

  // A股仅支持手动执行，补充一键复制交易信息入口
  if (market === 'a') {
    actions.push({
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '📋 复制交易信息',
      },
      type: 'default',
      value: {
        action: 'copy_trade',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    });
  }

  return actions;
}

/**
 * 构建风控警告信号卡片
 */
export function buildWarningSignalCard(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult
): FeishuCard {
  const directionText = signal.direction === 'long' ? '看多' : '看空';

  const actions: FeishuCardAction[] = [
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '⚠️ 仍然确认（将记录日志）',
      },
      type: 'danger',
      value: {
        action: 'confirm_warn',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
    {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '❌ 忽略',
      },
      type: 'default',
      value: {
        action: 'ignore',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    },
  ];

  if (signal.market === 'a') {
    actions.push({
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: '📋 复制交易信息',
      },
      type: 'default',
      value: {
        action: 'copy_trade',
        deliveryId: delivery.id,
        orderToken: delivery.orderToken,
      },
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `⚠️ AI信号参考（含风险提示）｜置信度 ${signal.confidence}%`,
      },
      template: 'orange',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**标的：** ${signal.symbol}  **方向：** ${directionText}\n\n🛡️ **风控检查：** ⚠️ 存在风险提示，请谨慎评估后操作`,
        },
      },
      {
        tag: 'action',
        actions,
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负',
          },
        ],
      },
    ],
  };
}

/**
 * 构建纯资讯解读卡片（置信度不足，不生成交易信号）
 */
export function buildNewsOnlyCard(newsItem: NewsItem, analysis: AnalysisResult): FeishuCard {
  const sentimentEmoji = analysis.sentiment === 'positive' ? '📈' : analysis.sentiment === 'negative' ? '📉' : '📊';
  const importanceLabel = analysis.importance === 'high' ? '重要' : analysis.importance === 'medium' ? '一般' : '参考';
  const marketLabel = newsItem.market.toUpperCase();
  const template = analysis.importance === 'high' ? 'red' : analysis.importance === 'medium' ? 'blue' : 'grey';

  let content = `**摘要：** ${analysis.summary}\n\n**市场影响：** ${analysis.impact}`;

  if (newsItem.symbols && newsItem.symbols.length > 0) {
    content += `\n\n**相关标的：** ${newsItem.symbols.join(', ')}`;
  }

  const elements: FeishuCardElement[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content,
      },
    },
  ];

  if (newsItem.url) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '查看原文',
          },
          type: 'default',
          value: {
            action: 'open_url',
            url: newsItem.url,
          },
        },
      ],
    });
  }

  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: '置信度不足，仅供参考，不构成投资建议',
      },
    ],
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `${sentimentEmoji} 资讯解读｜${marketLabel} · ${importanceLabel}`,
      },
      template,
    },
    elements,
  };
}
