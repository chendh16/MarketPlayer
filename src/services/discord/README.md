# Discord Bot 模块

## 架构概览

```
src/services/discord/
├── bot.ts         # Discord 客户端和交互处理
└── formatter.ts   # 消息格式化
```

## 核心功能

### 1. Bot 初始化 (`startDiscordBot`)

```typescript
await startDiscordBot();
// Discord Bot online: MarketPlayer#1234
```

**配置**：
```bash
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
```

### 2. 消息推送 (`sendSignalToUser`)

发送交易信号到用户私信：
```typescript
const result = await sendSignalToUser(userId, message);
// { messageId: '123', channelId: '456' }
```

### 3. 按钮交互处理

**支持的按钮**：
- ✅ **确认下单** - 创建订单记录
- ⚙️ **调整仓位** - 弹出 Modal 输入框
- 🔕 **忽略信号** - 更新推送状态
- ⏰ **30分钟后提醒** - 延迟推送

**3秒 ACK 规则**：
```typescript
// 必须在 3 秒内响应 Discord
await interaction.deferReply({ ephemeral: true });
// 然后执行业务逻辑
await processOrder(...);
// 最后更新响应
await interaction.editReply({ content: '✅ 订单已创建' });
```

## 消息格式

### 交易信号消息 (`buildNormalSignalMessage`)

```
🔔 交易信号参考

📊 标的：AAPL (美股)
📈 方向：做多
💰 建议仓位：5.0%
🎯 置信度：85%

📝 AI 分析
苹果发布革命性 AI 芯片...

💡 交易依据
技术突破带来长期增长...

─────────────────
🛡️ 风控检查（仅富途账户）
AAPL 当前持仓：2.0%  ✅
当前总仓位：45.0%  ✅
可用资金：$10000  ✅
确认后预计总仓位：50.0%  ✅

⚠️ *仅包含富途账户持仓，其他平台请手动核对*

[确认下单] [调整仓位] [30分钟后提醒] [忽略]
```

### 纯资讯消息 (`buildNewsOnlyMessage`)

置信度 < 70% 时，不显示交易按钮：
```
📰 市场资讯解读

📊 标的：BTC
🎯 置信度：65%（仅供参考）

📝 AI 分析
比特币价格波动...

⚠️ 置信度较低，仅供参考，不建议交易
```

### 风险警告消息 (`buildWarningSignalMessage`)

风控未通过时：
```
⚠️ 风控警告

📊 标的：TSLA (美股)
❌ 风控检查未通过

🛡️ 风控详情
- 单标的持仓超限：当前 15.0%，限制 10.0%
- 总仓位接近上限：当前 85.0%，限制 80.0%

💡 建议
请先调整现有持仓，或手动评估风险后操作
```

## 按钮交互流程

### 确认下单

```
用户点击 [确认下单]
    ↓
3秒内 ACK (deferReply)
    ↓
验证订单 Token（幂等性）
    ↓
二次风控检查
    ↓
创建订单记录
    ↓
生成富途深链接 / 纯文本指令
    ↓
更新消息（editReply）
    ↓
禁用所有按钮
```

### 调整仓位

```
用户点击 [调整仓位]
    ↓
弹出 Modal 输入框
    ↓
用户输入新仓位（1-20%）
    ↓
验证输入范围
    ↓
重新计算风控
    ↓
更新消息显示新仓位
```

### 30分钟提醒

```
用户点击 [30分钟后提醒]
    ↓
创建内存定时器
    ↓
禁用当前消息按钮
    ↓
30分钟后重新推送
    ↓
清理定时器
```

## 错误处理

### Token 未配置
```
Error: Expected token to be set for this request
```
**解决**：配置 `DISCORD_BOT_TOKEN`

### 用户 DM 关闭
```
Error: Cannot send me to this user
```
**解决**：用户需要开启私信权限

### 3秒超时
```
Error: Interaction has already been acknowledged
```
**解决**：使用 `deferReply()` 立即响应

## 权限要求

Bot 需要以下权限：
- ✅ Send Messages
- ✅ Read Messages
- ✅ Use Slash Commands
- ✅ Send Messages in Threads
- ✅ Embed Links
- ✅ Attach Files

## 扩展新按钮

1. 在 `formatter.ts` 中添加按钮：
```typescript
new ButtonBuilder()
  .setCustomId(`new_action:${deliveryId}:${orderToken}`)
  .setLabel('新操作')
  .setStyle(ButtonStyle.Primary)
```

2. 在 `bot.ts` 中处理交互：
```typescript
if (action === 'new_action') {
  await interaction.defermeral: true });
  // 处理逻辑
  await interaction.editReply({ content: '完成' });
}
```

## 测试

```bash
# 测试 Bot 连接
npm run dev

# 测试消息推送
npm run test-real
```

