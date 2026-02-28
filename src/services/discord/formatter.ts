import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Signal, SignalDelivery, RiskCheckResult, NewsItem } from '../../models/signal';
import { AccountSnapshot } from '../../models/position';
import { AnalysisResult } from '../ai/analyzer';

// 正常交易参考
export function buildNormalSignalMessage(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult,
  account: AccountSnapshot
) {
  const directionEmoji = signal.direction === 'long' ? '📈' : '📉';
  const directionText = signal.direction === 'long' ? '看多' : '看空';
  const estimatedValue = account.totalAssets * (signal.suggestedPositionPct / 100);
  
  const embed = new EmbedBuilder()
    .setColor(0x00AA44)
    .setTitle(`📊 AI信号参考｜置信度 ${signal.confidence}%`)
    .setDescription([
      `**标的：** ${signal.symbol}`,
      `**信号方向：** ${directionEmoji} ${directionText}`,
      `**参考仓位：** 账户 ${signal.suggestedPositionPct}%（约 $${estimatedValue.toFixed(0)}）`,
      `**参考依据：** ${signal.reasoning}`,
      '',
      '─────────────────',
      `🛡️ **风控检查（仅富途账户）**`,
      `${signal.symbol} 当前持仓：${Number(riskCheck.currentSinglePositionPct).toFixed(1)}%  ✅`,
      `当前总仓位：${Number(riskCheck.currentTotalPositionPct).toFixed(1)}%  ✅`,
      `可用资金：$${Number(riskCheck.availableCash).toFixed(0)}  ✅`,
      `确认后预计总仓位：${Number(riskCheck.projectedTotalPositionPct).toFixed(1)}%  ✅`,
      '',
      `⚠️ *${riskCheck.coverageNote}*`,
    ].join('\n'))
    .setFooter({ text: '免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负' })
    .setTimestamp();
  
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:${delivery.id}:${delivery.orderToken}`)
      .setLabel('✅ 确认下单')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`adjust:${delivery.id}:${delivery.orderToken}`)
      .setLabel('✏️ 调整仓位')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remind:${delivery.id}:${delivery.orderToken}`)
      .setLabel('⏰ 30分钟后提醒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ignore:${delivery.id}:${delivery.orderToken}`)
      .setLabel('❌ 忽略')
      .setStyle(ButtonStyle.Danger),
  );

  // A股仅支持手动执行，补充一键复制交易信息入口
  if (signal.market === 'a') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`copy_trade:${delivery.id}:${delivery.orderToken}`)
        .setLabel('📋 复制交易信息')
        .setStyle(ButtonStyle.Primary),
    );
  }
  
  const expiresAt = new Date(delivery.sentAt.getTime() + 15 * 60 * 1000);
  return {
    content: `⏱️ 本参考将于 <t:${Math.floor(expiresAt.getTime() / 1000)}:R> 失效`,
    embeds: [embed],
    components: [row],
  };
}

// 风控警告参考
export function buildWarningSignalMessage(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult
) {
  const warningLines = riskCheck.warningMessages.map(m => `⚠️ ${m}`).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`⚠️ AI信号参考（含风险提示）｜置信度 ${signal.confidence}%`)
    .setDescription([
      `**标的：** ${signal.symbol}  **方向：** ${signal.direction === 'long' ? '看多' : '看空'}`,
      '',
      '🛡️ **风控检查（仅富途账户）**',
      warningLines,
      '',
      `⚠️ *${riskCheck.coverageNote}*`,
    ].join('\n'))
    .setFooter({ text: '免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负' });
  
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_warn:${delivery.id}:${delivery.orderToken}`)
      .setLabel('⚠️ 仍然确认（将记录日志）')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ignore:${delivery.id}:${delivery.orderToken}`)
      .setLabel('❌ 忽略')
      .setStyle(ButtonStyle.Secondary),
  );

  if (signal.market === 'a') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`copy_trade:${delivery.id}:${delivery.orderToken}`)
        .setLabel('📋 复制交易信息')
        .setStyle(ButtonStyle.Primary),
    );
  }
  
  return { embeds: [embed], components: [row] };
}

// 纯资讯解读（置信度不足，不生成交易信号）
export function buildNewsOnlyMessage(newsItem: NewsItem, analysis: AnalysisResult) {
  const sentimentEmoji = analysis.sentiment === 'positive' ? '📈' : analysis.sentiment === 'negative' ? '📉' : '📊';
  const importanceColor = analysis.importance === 'high' ? 0xFF6B00 : analysis.importance === 'medium' ? 0x4A90D9 : 0x888888;
  const importanceLabel = analysis.importance === 'high' ? '重要' : analysis.importance === 'medium' ? '一般' : '参考';
  const marketLabel = newsItem.market.toUpperCase();

  const lines = [
    `**摘要：** ${analysis.summary}`,
    '',
    `**市场影响：** ${analysis.impact}`,
  ];
  if (newsItem.symbols && newsItem.symbols.length > 0) {
    lines.push('', `**相关标的：** ${newsItem.symbols.join(', ')}`);
  }
  if (newsItem.url) {
    lines.push('', `[查看原文](${newsItem.url})`);
  }

  const embed = new EmbedBuilder()
    .setColor(importanceColor)
    .setTitle(`${sentimentEmoji} 资讯解读｜${marketLabel} · ${importanceLabel}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: '置信度不足，仅供参考，不构成投资建议' })
    .setTimestamp(newsItem.publishedAt);

  return { embeds: [embed] };
}
