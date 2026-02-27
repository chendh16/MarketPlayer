import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Signal, SignalDelivery, RiskCheckResult } from '../../models/signal';
import { AccountSnapshot } from '../../models/position';

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
      `${signal.symbol} 当前持仓：${riskCheck.currentSinglePositionPct.toFixed(1)}%  ✅`,
      `当前总仓位：${riskCheck.currentTotalPositionPct.toFixed(1)}%  ✅`,
      `可用资金：$${riskCheck.availableCash.toFixed(0)}  ✅`,
      `确认后预计总仓位：${riskCheck.projectedTotalPositionPct.toFixed(1)}%  ✅`,
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
  
  return { embeds: [embed], components: [row] };
}

