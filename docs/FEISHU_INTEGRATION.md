# 飞书推送集成指南

## 概述

MarketPlayer 现已支持飞书（Feishu/Lark）推送，用户可以选择通过 Discord、飞书或两者同时接收交易信号和资讯推送。

## 功能特性

- ✅ 交易信号推送（支持交互式卡片）
- ✅ 资讯解读推送
- ✅ 风险警告消息
- ✅ 按钮交互（确认下单、忽略、提醒、复制交易信息）
- ✅ 多渠道推送（Discord + 飞书）
- ✅ 用户自定义推送渠道偏好

## 配置步骤

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取以下凭证：
   - App ID
   - App Secret
   - Verification Token（用于验证 webhook 请求）
   - Encrypt Key（可选，用于消息加密）

### 2. 配置应用权限

在飞书开放平台为应用添加以下权限：

**必需权限：**
- `im:message` - 发送消息
- `im:message:send_as_bot` - 以应用身份发送消息
- `im:chat` - 获取群组信息

**可选权限：**
- `contact:user.base:readonly` - 获取用户基本信息

### 3. 配置事件订阅

1. 在飞书开放平台配置事件订阅 URL：
   ```
   https://your-domain.com/api/feishu/webhook
   ```

2. 订阅以下事件：
   - `im.message.receive_v1` - 接收消息（可选）
   - `card.action.trigger` - 卡片按钮点击

### 4. 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 可选
```

### 5. 数据库迁移

运行数据库迁移以添加飞书相关字段：

```bash
npm run migrate
```

这将执行 `005_add_feishu_support.sql` 迁移，添加以下字段：
- `users.feishu_open_id` - 飞书用户 open_id
- `users.feishu_user_id` - 飞书用户 user_id
- `users.feishu_username` - 飞书用户名
- `users.notification_channels` - 推送渠道偏好
- `signal_deliveries.feishu_message_id` - 飞书消息ID

## 使用方法

### 用户绑定飞书账号

用户需要将飞书账号与系统账号绑定。有两种方式：

#### 方式1：通过 API 绑定

```bash
curl -X PATCH https://your-domain.com/api/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "feishuOpenId": "ou_xxxxxxxxxxxxxxxx",
    "feishuUsername": "张三"
  }'
```

#### 方式2：通过飞书机器人命令（需要实现）

用户在飞书中向机器人发送绑定命令，机器人自动获取 open_id 并绑定。

### 设置推送渠道偏好

用户可以选择接收推送的渠道：

```bash
curl -X PATCH https://your-domain.com/api/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "notificationChannels": ["discord", "feishu"]
  }'
```

可选值：
- `["discord"]` - 仅 Discord
- `["feishu"]` - 仅飞书
- `["discord", "feishu"]` - 两者都要（默认）

## 消息格式

### 交易信号卡片

飞书卡片包含以下信息：
- 标的、方向、置信度
- 参考仓位
- 参考依据
- 风控检查结果
- 交互按钮（确认、调整、提醒、忽略）

### 资讯解读卡片

- 摘要
- 市场影响分析
- 相关标的
- 重要性标签
- 查看原文链接

## 技术架构

### 模块结构

```
src/services/feishu/
├── types.ts       # 飞书 API 类型定义
├── bot.ts         # 飞书客户端和消息发送
├── formatter.ts   # 消息卡片格式化
└── handler.ts     # 事件回调处理

src/services/notification/
└── pusher.ts      # 统一推送服务（支持多渠道）
```

### 推送流程

1. `news-queue.ts` 处理资讯分析和信号生成
2. 调用 `pushSignalToUser()` 统一推送服务
3. 根据用户的 `notificationChannels` 配置，分别推送到 Discord 和/或飞书
4. 更新 `signal_deliveries` 表，记录各渠道的消息ID

### 事件处理

1. 用户点击飞书卡片按钮
2. 飞书服务器发送 webhook 请求到 `/api/feishu/webhook`
3. `handler.ts` 解析事件并调用对应的业务逻辑
4. 更新卡片状态，显示处理结果

## API 端点

### POST /api/feishu/webhook

接收飞书事件回调。

**请求体：**
```json
{
  "schema": "2.0",
  "header": {
    "event_id": "xxx",
    "event_type": "card.action.trigger",
    "token": "xxx",
    "app_id": "xxx"
  },
  "event": {
    "open_id": "ou_xxx",
    "action": {
      "value": {
        "action": "confirm",
        "deliveryId": "xxx",
        "orderToken": "xxx"
      }
    }
  }
}
```

**响应：**
```json
{
  "code": 0
}
```

## 注意事项

### 1. 飞书 vs Discord 功能差异

- **Modal 输入**：飞书不支持类似 Discord 的 Modal，因此"调整仓位"功能暂时提示用户使用其他方式
- **消息编辑**：飞书支持更新卡片内容，但需要使用 PATCH 请求
- **按钮样式**：飞书支持 `default`、`primary`、`danger` 三种样式

### 2. 性能考虑

- 飞书 access_token 有效期为 2 小时，系统会自动缓存和刷新
- 推送失败不会影响其他渠道，各渠道独立处理

### 3. 安全性

- 使用 Verification Token 验证 webhook 请求来源
- 可选使用 Encrypt Key 加密消息内容
- 用户 open_id 存储在数据库中，需要妥善保护

## 故障排查

### 推送失败

1. 检查环境变量配置是否正确
2. 检查飞书应用权限是否完整
3. 查看日志：`logger.error('Failed to push signal to Feishu')`
4. 验证用户的 `feishu_open_id` 是否正确

### Webhook 回调失败

1. 检查 webhook URL 是否可访问
2. 验证 Verification Token 是否匹配
3. 查看飞书开放平台的事件日志
4. 检查服务器日志：`logger.error('Error handling Feishu webhook')`

### 按钮无响应

1. 检查 `deliveryId` 和 `orderToken` 是否正确
2. 验证数据库中的推送记录状态
3. 查看 `handler.ts` 中的错误日志

## 开发建议

### 测试飞书推送

1. 创建测试用户并绑定飞书 open_id
2. 设置推送渠道为 `["feishu"]`
3. 手动触发资讯抓取或创建测试信号
4. 检查飞书是否收到消息

### 本地开发

使用 ngrok 或类似工具暴露本地服务器：

```bash
ngrok http 3000
```

然后在飞书开放平台配置 webhook URL：
```
https://your-ngrok-url.ngrok.io/api/feishu/webhook
```

## 未来改进

- [ ] 支持飞书 Modal 输入（通过消息回复实现）
- [ ] 支持飞书群组推送
- [ ] 支持飞书机器人命令（绑定账号、查询持仓等）
- [ ] 支持飞书消息加密
- [ ] 添加飞书推送统计和监控

## 相关文档

- [飞书开放平台文档](https://open.feishu.cn/document/home/index)
- [飞书消息卡片搭建工具](https://open.feishu.cn/tool/cardbuilder)
- [飞书 API 调试工具](https://open.feishu.cn/api-explorer/)
