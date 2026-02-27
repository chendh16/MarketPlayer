import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

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
      if (!interaction.isButton()) return;
      
      try {
        // ⚡ 必须立即 ACK，否则 Discord 3秒后显示"交互失败"
        await interaction.deferUpdate();
        
        // 解析 customId: "action:deliveryId:orderToken"
        const [action, deliveryId, orderToken] = interaction.customId.split(':');
        
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
  _orderToken: string,
  interaction: any
): Promise<void> {
  logger.info(`Button action: ${action}, delivery: ${deliveryId}`);
  
  switch (action) {
    case 'confirm':
      // TODO: 实现确认下单逻辑
      await interaction.editReply({ content: '⏳ 正在处理...', components: [] });
      break;
    case 'ignore':
      // TODO: 实现忽略逻辑
      await interaction.editReply({ content: '已忽略本次信号参考', components: [] });
      break;
    case 'adjust':
      // TODO: 实现调整仓位逻辑
      await interaction.editReply({ content: '请输入调整后的仓位百分比', components: [] });
      break;
    case 'remind':
      // TODO: 实现提醒逻辑
      await interaction.editReply({ content: '⏰ 将在30分钟后提醒您', components: [] });
      break;
    default:
      await interaction.editReply({ content: '未知操作', components: [] });
  }
}

// 推送信号给单个用户
export async function sendSignalToUser(
  userId: string,
  message: any
): Promise<string | null> {
  try {
    const user = await discordClient.users.fetch(userId);
    const dm = await user.createDM();
    const sent = await dm.send(message);
    return sent.id;
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

