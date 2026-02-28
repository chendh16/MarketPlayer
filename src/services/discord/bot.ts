import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../../config';
import { getDelivery, getSignal, updateDeliveryStatus } from '../../db/queries';
import { logger } from '../../utils/logger';

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

// 提醒记录（内存中，重启会丢失，符合预期）
const pendingReminders = new Map<string, ReturnType<typeof setTimeout>>();

export async function startDiscordBot(): Promise<void> {
  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      logger.info(`Discord Bot online: ${discordClient.user?.tag}`);
      resolve();
    });

    discordClient.on('error', (error) => {
      logger.error('Discord client error:', error);
    });

    // 按钮交互处理
    discordClient.on('interactionCreate', async (interaction) => {
      // Modal 提交处理
      if (interaction.isModalSubmit()) {
        try {
          const [action, deliveryId, orderToken] = interaction.customId.split(':');
          if (action === 'adjust_modal') {
            const positionPctStr = interaction.fields.getTextInputValue('position_pct');
            const positionPct = parseFloat(positionPctStr);

            if (isNaN(positionPct) || positionPct < 1 || positionPct > 20) {
              await interaction.reply({ content: '❌ 请输入 1-20 之间的数字', ephemeral: true });
              return;
            }

            await interaction.deferUpdate();

            // 更新 delivery 的 adjustedPositionPct
            const { updateAdjustedPositionPct } = await import('../../db/queries');
            await updateAdjustedPositionPct(deliveryId, positionPct);

            // 加入订单队列
            const { orderQueue } = await import('../../queues/order-queue');
            await orderQueue.add('place-order', { deliveryId, orderToken });

            await interaction.editReply({
              content: `⏳ 已调整仓位至 ${positionPct}%，正在执行下单...`,
              components: [],
            });
          }
        } catch (err) {
          logger.error('Modal submit handler error:', err);
        }
        return;
      }

      if (!interaction.isButton()) return;

      try {
        // 解析 customId: "action:deliveryId:orderToken"
        const [action, deliveryId, orderToken] = interaction.customId.split(':');

        // adjust 需要直接在 button interaction 上调用 showModal，
        // 不能在 deferUpdate 之后调用，因此提前处理
        if (action === 'adjust') {
          await handleAdjustPosition(deliveryId, orderToken, interaction);
          return;
        }

        // ⚡ 必须立即 ACK，否则 Discord 3秒后显示"交互失败"
        await interaction.deferUpdate();

        // 立即禁用所有按钮（防止重复点击）
        await disableAllButtons(interaction);

        // 异步处理业务逻辑
        await handleButtonAction(action, deliveryId, orderToken, interaction);
      } catch (err) {
        logger.error('Button handler error:', err);
        await interaction.editReply({
          content: '❌ 处理失败，请重试或手动操作',
          components: []
        });
      }
    });

    discordClient.login(config.DISCORD_BOT_TOKEN).catch(reject);
  });
}

// 禁用消息中所有按钮
async function disableAllButtons(interaction: any): Promise<void> {
  const { ActionRowBuilder, ButtonBuilder } = await import('discord.js');

  const disabledComponents = interaction.message.components.map((row: any) => {
    const newRow = new ActionRowBuilder();
    newRow.addComponents(
      ...row.components.map((btn: any) =>
        ButtonBuilder.from(btn.toJSON()).setDisabled(true)
      )
    );
    return newRow;
  });

  await interaction.editReply({ components: disabledComponents });
}

// 按钮动作处理分发
async function handleButtonAction(
  action: string,
  deliveryId: string,
  orderToken: string,
  interaction: any
): Promise<void> {
  logger.info(`Button action: ${action}, delivery: ${deliveryId}`);

  switch (action) {
    case 'confirm':
      await confirmOrder(deliveryId, orderToken, interaction, false);
      break;
    case 'confirm_warn':
      await confirmOrder(deliveryId, orderToken, interaction, true);
      break;
    case 'retry_order':
      await confirmOrder(deliveryId, orderToken, interaction, false);
      break;
    case 'ignore':
      await updateDeliveryStatus(deliveryId, 'ignored', { ignoredAt: new Date() });
      await interaction.editReply({ content: '已忽略本次信号参考', components: [] });
      break;
    case 'adjust':
      await handleAdjustPosition(deliveryId, orderToken, interaction);
      break;
    case 'remind':
      await handleRemind(deliveryId, orderToken, interaction);
      break;
    case 'copy_trade':
      await sendCopyTradeInfo(deliveryId, interaction);
      break;
    case 'abandon':
      await updateDeliveryStatus(deliveryId, 'ignored', { ignoredAt: new Date() });
      await interaction.editReply({ content: '❌ 已放弃本次交易', components: [] });
      break;
    default:
      await interaction.editReply({ content: '未知操作', components: [] });
  }
}

async function handleAdjustPosition(
  deliveryId: string,
  orderToken: string,
  interaction: any
): Promise<void> {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`adjust_modal:${deliveryId}:${orderToken}`)
    .setTitle('调整仓位');

  const input = new TextInputBuilder()
    .setCustomId('position_pct')
    .setLabel('仓位百分比 (1-20)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例如：5')
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<any>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleRemind(
  deliveryId: string,
  _orderToken: string,
  interaction: any
): Promise<void> {
  // 防止重复设置
  if (pendingReminders.has(deliveryId)) {
    await interaction.editReply({ content: '⏰ 提醒已设置，请等待', components: [] });
    return;
  }

  await interaction.editReply({
    content: '⏰ 好的，将在 30 分钟后提醒您此信号',
    components: [],
  });

  const timer = setTimeout(async () => {
    pendingReminders.delete(deliveryId);
    try {
      // 检查信号是否还有效
      const { getDelivery } = await import('../../db/queries');
      const delivery = await getDelivery(deliveryId);
      if (!delivery || delivery.status !== 'pending') return;

      const user = await discordClient.users.fetch(interaction.user.id);
      const dm = await user.createDM();
      await dm.send({
        content: `⏰ **30分钟提醒**\n您之前设置了对信号的提醒，该信号仍待您处理。\n请点击原始消息中的按钮操作，或忽略。`,
      });
    } catch (err) {
      logger.error('Remind callback error:', err);
    }
  }, 30 * 60 * 1000);

  pendingReminders.set(deliveryId, timer);
}

async function confirmOrder(
  deliveryId: string,
  orderToken: string,
  interaction: any,
  overrideWarning: boolean
): Promise<void> {
  const delivery = await getDelivery(deliveryId);
  if (!delivery) {
    await interaction.editReply({ content: '❌ 推送记录不存在或已失效', components: [] });
    return;
  }

  if (!['pending', 'order_failed'].includes(delivery.status)) {
    await interaction.editReply({ content: `⚠️ 当前状态为 ${delivery.status}，无法再次确认`, components: [] });
    return;
  }

  const extra = {
    confirmedAt: new Date(),
    overrideRiskWarning: overrideWarning,
    overrideRiskWarningAt: overrideWarning ? new Date() : undefined,
  };

  await updateDeliveryStatus(deliveryId, 'confirmed', extra);
  const { orderQueue } = await import('../../queues/order-queue');
  await orderQueue.add('place-order', { deliveryId, orderToken });
  await interaction.editReply({ content: '⏳ 已确认，正在执行下单并回写结果...', components: [] });
}

async function sendCopyTradeInfo(deliveryId: string, interaction: any): Promise<void> {
  const delivery = await getDelivery(deliveryId);
  if (!delivery) {
    await interaction.editReply({ content: '❌ 推送记录不存在', components: [] });
    return;
  }

  const signal = await getSignal(delivery.signalId);
  if (!signal) {
    await interaction.editReply({ content: '❌ 信号不存在', components: [] });
    return;
  }

  const text = [
    '📋 交易信息（可复制）',
    `标的: ${signal.symbol}`,
    `市场: ${signal.market.toUpperCase()}`,
    `方向: ${signal.direction === 'long' ? '买入' : '卖出'}`,
    `参考仓位: ${signal.suggestedPositionPct}%`,
    `依据: ${signal.reasoning}`,
  ].join('\n');

  await interaction.editReply({
    content: `\`\`\`\n${text}\n\`\`\`\n请复制后前往券商 App 手动执行。`,
    components: [],
  });
}

// 推送信号给单个用户
export async function sendSignalToUser(
  userId: string,
  message: any
): Promise<{ messageId: string; channelId: string } | null> {
  try {
    const user = await discordClient.users.fetch(userId);
    const dm = await user.createDM();
    const sent = await dm.send(message);
    return {
      messageId: sent.id,
      channelId: sent.channelId,
    };
  } catch (err) {
    logger.error(`Failed to send DM to user ${userId}:`, err);
    return null;
  }
}

// 编辑已发送的消息
export async function editMessage(
  channelId: string,
  messageId: string,
  newContent: any
): Promise<void> {
  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      const message = await (channel as any).messages.fetch(messageId);
      await message.edit(newContent);
    }
  } catch (err) {
    logger.error(`Failed to edit message ${messageId}:`, err);
  }
}
