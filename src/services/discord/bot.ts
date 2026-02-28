import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  stepConfirmOrder,
  stepIgnoreDelivery,
  stepAbandonDelivery,
  stepAdjustAndConfirm,
  stepGetCopyTradeInfo,
} from '../../queues/steps/order-interact';
import type { ConfirmOrderResult } from '../../queues/steps/order-interact';

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

// 提醒记录（内存中，重启会丢失，符合预期）
const pendingReminders = new Map<string, ReturnType<typeof setTimeout>>();
let startPromise: Promise<void> | null = null;
let handlersRegistered = false;

export async function startDiscordBot(): Promise<void> {
  if (discordClient.isReady()) {
    return;
  }

  if (startPromise) {
    return startPromise;
  }

  if (!handlersRegistered) {
    registerDiscordHandlers();
    handlersRegistered = true;
  }

  const loginPromise = new Promise<void>((resolve, reject) => {
    discordClient.once('ready', () => {
      logger.info(`Discord Bot online: ${discordClient.user?.tag}`);
      resolve();
    });

    discordClient.login(config.DISCORD_BOT_TOKEN).catch(reject);
  }).finally(() => {
    if (!discordClient.isReady()) {
      startPromise = null;
    }
  });

  startPromise = loginPromise;
  return loginPromise;
}

function registerDiscordHandlers(): void {
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
          const result = await stepAdjustAndConfirm(deliveryId, orderToken, positionPctStr);

          if (result.kind === 'validation_error') {
            await interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
            return;
          }

          await interaction.deferUpdate();
          await replyConfirmResult(result as ConfirmOrderResult, interaction);
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
      if (action === 'remind') {
        await handleRemind(deliveryId, orderToken, interaction);
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

async function replyConfirmResult(
  result: ConfirmOrderResult,
  interaction: any
): Promise<void> {
  switch (result.kind) {
    case 'queued':
      await interaction.editReply({ content: '⏳ 已确认，正在执行下单并回写结果...', components: [] });
      break;
    case 'not_found':
      await interaction.editReply({ content: '❌ 推送记录不存在或已失效', components: [] });
      break;
    case 'wrong_status':
      await interaction.editReply({ content: `⚠️ 当前状态为 ${result.currentStatus}，无法再次确认`, components: [] });
      break;
    case 'token_mismatch':
      await interaction.editReply({ content: '⚠️ 该按钮已过期，请使用最新消息操作', components: [] });
      break;
  }
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
    case 'retry_order': {
      const result = await stepConfirmOrder(deliveryId, orderToken, false);
      await replyConfirmResult(result, interaction);
      break;
    }
    case 'confirm_warn': {
      const result = await stepConfirmOrder(deliveryId, orderToken, true);
      await replyConfirmResult(result, interaction);
      break;
    }
    case 'ignore': {
      const result = await stepIgnoreDelivery(deliveryId);
      await interaction.editReply({
        content: result.kind === 'ok' ? '已忽略本次信号参考' : '❌ 推送记录不存在或已失效',
        components: [],
      });
      break;
    }
    case 'abandon': {
      const result = await stepAbandonDelivery(deliveryId);
      await interaction.editReply({
        content: result.kind === 'ok' ? '❌ 已放弃本次交易' : '❌ 推送记录不存在或已失效',
        components: [],
      });
      break;
    }
    case 'copy_trade': {
      const result = await stepGetCopyTradeInfo(deliveryId);
      if (result.kind === 'not_found') {
        await interaction.editReply({ content: '❌ 推送记录或信号不存在', components: [] });
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
      await interaction.editReply({
        content: `\`\`\`\n${text}\n\`\`\`\n请复制后前往券商 App 手动执行。`,
        components: [],
      });
      break;
    }
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
    await interaction.reply({ content: '⏰ 提醒已设置，请等待', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '⏰ 好的，将在 30 分钟后提醒您此信号', ephemeral: true });

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
