# 05 — Discord Bot 交互设计

---

## 核心原则

- **3秒 ACK 规则**：所有按钮交互必须在 3 秒内调用 `deferUpdate()`，再异步处理业务逻辑
- **消息可编辑**：推送后保存 `messageId`，状态变化时编辑原消息（不发新消息）
- **按钮即时禁用**：用户点击任意按钮后，立即将该消息所有按钮设为 disabled

---

## Bot 初始化

```typescript
// src/services/discord/bot.ts
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

discordClient.once('ready', () => {
  console.log(`Discord Bot online: ${discordClient.user?.tag}`);
});

// 所有按钮交互的统一入口
discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // ⚡ 必须立即 ACK，否则 Discord 3秒后显示"交互失败"
  await interaction.deferUpdate();

  // 解析 customId: "action:deliveryId:orderToken"
  const [action, deliveryId, orderToken] = interaction.customId.split(':');

  // 立即禁用所有按钮（防止重复点击）
  await disableAllButtons(interaction);

  // 异步处理业务逻辑
  try {
    await handleButtonAction(action, deliveryId, orderToken, interaction);
  } catch (err) {
    console.error('Button handler error:', err);
    await interaction.editReply({ content: '❌ 处理失败，请重试或手动操作', components: [] });
  }
});

async function handleButtonAction(
  action: string,
  deliveryId: string,
  orderToken: string,
  interaction: any
) {
  switch (action) {
    case 'confirm':      return handleConfirm(deliveryId, orderToken, interaction);
    case 'adjust':       return handleAdjust(deliveryId, interaction);
    case 'remind':       return handleRemind(deliveryId, interaction);
    case 'ignore':       return handleIgnore(deliveryId, interaction);
    case 'confirm_warn': return handleConfirmWithWarning(deliveryId, orderToken, interaction);
    case 'retry_order':  return handleRetryOrder(deliveryId, interaction);
    case 'market_price': return handleMarketPrice(deliveryId, interaction);
    case 'open_remind':  return handleOpenRemind(deliveryId, interaction);
    default:
      await interaction.editReply({ content: '未知操作', components: [] });
  }
}
```

---

## 消息格式化

```typescript
// src/services/discord/formatter.ts
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// ── 正常交易参考 ──
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

// ── 风控警告参考 ──
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

// ── 风控拦截通知 ──
export function buildBlockedSignalMessage(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult
) {
  const blockLines = riskCheck.blockReasons.map(r => `• ${r}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle('🚫 信号已拦截')
    .setDescription([
      `**标的：** ${signal.symbol} ${signal.direction === 'long' ? '看多' : '看空'} 信号`,
      '',
      blockLines,
      '',
      '💡 **您可以：**',
    ].join('\n'));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`reduce:${delivery.id}`)
      .setLabel('📉 查看可减仓建议')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`alternatives:${delivery.id}`)
      .setLabel('🔍 查看其他符合条件标的')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`adjust_limit:${delivery.id}`)
      .setLabel('⚙️ 临时调整风控上限')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`news_only:${delivery.id}`)
      .setLabel('📰 仅查看资讯解读')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── 非交易时段推送 ──
export function buildClosedMarketMessage(
  newsItem: NewsItem,
  analysis: AnalysisResult
) {
  const embed = new EmbedBuilder()
    .setColor(0x888888)
    .setTitle('📰 资讯解读（非交易时段）')
    .setDescription([
      `**标的：** ${newsItem.symbols?.join(', ')}`,
      `⏰ *${getMarketClosedText(newsItem.market)}，以下内容仅供参考，开盘后请重新评估行情*`,
      '',
      `**AI解读：** ${analysis.summary}`,
      `**市场展望：** ${analysis.impact}`,
    ].join('\n'))
    .setFooter({ text: '免责声明：本内容仅供信息参考，不构成投资建议' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_remind:${newsItem.id}`)
      .setLabel('🔔 设置开盘提醒')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── A股参考建议（手动执行）──
export function buildAStockSignalMessage(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult
) {
  const tradeInfo = `标的：${signal.symbol}\n方向：${signal.direction === 'long' ? '买入' : '卖出'}\n参考仓位：${signal.suggestedPositionPct}%`;

  const embed = new EmbedBuilder()
    .setColor(0x0088FF)
    .setTitle('📋 A股信号参考（需手动执行）')
    .setDescription([
      `**标的：** ${signal.symbol}`,
      `**信号方向：** ${signal.direction === 'long' ? '看多 📈' : '看空 📉'}`,
      `**参考仓位：** 账户 ${signal.suggestedPositionPct}%`,
      '',
      '⚠️ *A股暂不支持自动下单，请前往券商App手动执行*',
      '',
      `**参考依据：** ${signal.reasoning}`,
    ].join('\n'))
    .setFooter({ text: '免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`copy_trade:${delivery.id}`)
      .setLabel('📋 复制交易信息')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ignore:${delivery.id}:${delivery.orderToken}`)
      .setLabel('❌ 忽略')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── 下单失败通知 ──
export function buildOrderFailedMessage(
  order: Order,
  failureType: string,
  currentPrice?: number
) {
  const failureTexts: Record<string, string> = {
    price_deviation: `价格偏移 — 当前价 $${currentPrice}，超出参考价 5%`,
    insufficient_funds: `资金不足 — 请调整下单金额`,
    retryable: '网络超时 — 请重试',
    system_error: '系统异常 — 请前往富途App手动处理',
  };

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle('❌ 下单失败')
    .setDescription([
      `**标的：** ${order.symbol} ${order.direction === 'buy' ? '买入' : '卖出'}`,
      `**失败原因：** ${failureTexts[failureType] ?? failureType}`,
    ].join('\n'));

  const buttons: ButtonBuilder[] = [];

  if (failureType === 'price_deviation') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`market_price:${order.id}`)
        .setLabel(`📈 按市价确认（$${currentPrice}）`)
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (failureType === 'insufficient_funds') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`adjust:${order.id}`)
        .setLabel('✏️ 调整仓位重新确认')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (failureType === 'retryable') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`retry_order:${order.id}`)
        .setLabel('🔄 重试下单')
        .setStyle(ButtonStyle.Primary),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`cancel_order:${order.id}`)
      .setLabel('❌ 放弃本次交易')
      .setStyle(ButtonStyle.Danger),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  return { embeds: [embed], components: [row] };
}

// ── 建议失效通知 ──
export function buildExpiredMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x888888)
    .setTitle('⏱️ 参考已失效')
    .setDescription('本参考已超过15分钟未确认，市场行情可能已发生变化，请重新评估。');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('re_evaluate')
      .setLabel('🔄 重新生成评估')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('close_expired')
      .setLabel('❌ 关闭')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}
```

---

## 按钮处理器实现

```typescript
// src/services/discord/interactions.ts

// 用户点击「确认下单」
async function handleConfirm(
  deliveryId: string,
  orderToken: string,
  interaction: any
) {
  const delivery = await getDelivery(deliveryId);

  // 检查是否已过期
  if (isExpired(delivery)) {
    await interaction.editReply(buildExpiredMessage());
    return;
  }

  // 更新状态为 confirmed
  await updateDeliveryStatus(deliveryId, 'confirmed', { confirmedAt: new Date() });

  // 通知用户：正在处理
  await interaction.editReply({
    content: '⏳ 正在执行风控二次验证，请稍候...',
    embeds: [], components: [],
  });

  // 推入下单队列（异步处理）
  await orderQueue.add('place-order', {
    deliveryId,
    orderToken,
    discordInteraction: {
      channelId: interaction.channelId,
      messageId: interaction.message.id,
    },
  });
}

// 用户点击「仍然确认（忽略警告）」
async function handleConfirmWithWarning(
  deliveryId: string,
  orderToken: string,
  interaction: any
) {
  // 记录风控覆盖日志（审计）
  await logRiskOverride({
    deliveryId,
    overrideType: 'ignore_warning',
    userId: await getUserIdFromDelivery(deliveryId),
  });

  await updateDeliveryStatus(deliveryId, 'confirmed', {
    confirmedAt: new Date(),
    overrideRiskWarning: true,
    overrideRiskWarningAt: new Date(),
  });

  await interaction.editReply({
    content: '⚠️ 已记录风控警告覆盖，正在执行下单...',
    embeds: [], components: [],
  });

  await orderQueue.add('place-order', { deliveryId, orderToken });
}

// 用户点击「忽略」
async function handleIgnore(deliveryId: string, interaction: any) {
  await updateDeliveryStatus(deliveryId, 'ignored', { ignoredAt: new Date() });

  await interaction.editReply({
    content: '已忽略本次信号参考。',
    embeds: [], components: [],
  });
}

// 用户点击「30分钟后提醒」
async function handleRemind(deliveryId: string, interaction: any) {
  // 注意：不重置15分钟有效期，只是延迟提醒
  await scheduleReminder(deliveryId, 30 * 60 * 1000);

  await interaction.editReply({
    content: '⏰ 将在30分钟后提醒您（参考有效期不变）。',
    embeds: [], components: [],
  });
}
```

---

## 推送工具函数

```typescript
// src/services/discord/bot.ts（推送部分）

// 推送信号给单个用户
export async function sendSignalToUser(
  userId: string,
  message: any
): Promise<string | null> {
  try {
    const user = await discordClient.users.fetch(userId);
    const dm = await user.createDM();
    const sent = await dm.send(message);
    return sent.id; // 返回消息 ID，保存到 delivery 表
  } catch (err) {
    console.error(`Failed to send DM to user ${userId}:`, err);
    // Discord 失败时尝试 Telegram 备用渠道
    await telegramFallback(userId, message);
    return null;
  }
}

// 编辑已发送的消息（状态更新）
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
    console.error(`Failed to edit message ${messageId}:`, err);
  }
}

// 禁用消息中所有按钮
async function disableAllButtons(interaction: any) {
  const disabledComponents = interaction.message.components.map((row: any) => {
    const newRow = new ActionRowBuilder<ButtonBuilder>();
    newRow.addComponents(
      ...row.components.map((btn: any) =>
        ButtonBuilder.from(btn.toJSON()).setDisabled(true)
      )
    );
    return newRow;
  });

  await interaction.editReply({ components: disabledComponents });
}

// Telegram 备用推送
async function telegramFallback(userId: string, message: any) {
  const telegramId = await getTelegramId(userId);
  if (!telegramId) return;
  const text = extractTextFromEmbed(message);
  await telegramBot.sendMessage(telegramId, text);
}

function getMarketClosedText(market: string): string {
  const texts: Record<string, string> = {
    a: 'A股已休市', hk: '港股已休市', us: '美股已休市', btc: 'BTC市场'
  };
  return texts[market] ?? '市场已休市';
}
```

---

## 15分钟有效期定时检查

```typescript
// src/queues/expiry-checker.ts
import cron from 'node-cron';

// 每分钟检查一次过期的 delivery
cron.schedule('* * * * *', async () => {
  const expiredDeliveries = await db.query<SignalDelivery>(`
    SELECT * FROM signal_deliveries
    WHERE status = 'pending'
      AND sent_at < NOW() - INTERVAL '15 minutes'
  `);

  for (const delivery of expiredDeliveries) {
    await updateDeliveryStatus(delivery.id, 'expired', { expiredAt: new Date() });

    // 编辑 Discord 消息为失效状态
    if (delivery.discordMessageId && delivery.discordChannelId) {
      await editMessage(
        delivery.discordChannelId,
        delivery.discordMessageId,
        buildExpiredMessage()
      );
    }
  }
});
```
