# 飞书推送集成说明

## 概述

本次更新为 MarketPlayer 添加了完整的飞书（Feishu/Lark）推送支持，用户可以选择通过 Discord、飞书或两者同时接收交易信号和资讯推送。

## 新增文件

### 核心服务模块

1. **src/services/feishu/types.ts**
   - 飞书 API 类型定义
   - 包含消息、卡片、事件等类型

2. **src/services/feishu/bot.ts**
   - 飞书客户端实现
   - access_token 管理（自动缓存和刷新）
   - 消息发送和更新功能

3. **src/services/feishu/formatter.ts**
   - 消息卡片格式化
   - 三种卡片类型：正常信号、警告信号、纯资讯解读
   - 交互式按钮构建

4. **src/services/feishu/handler.ts**
   - 飞书事件回调处理
   - 按钮点击事件处理
   - 与业务逻辑集成

### 统一推送服务

5. **src/services/notification/pusher.ts**
   - 统一的多渠道推送服务
   - 支持 Discord 和飞书
   - 根据用户偏好自动选择推送渠道

### 数据库迁移

6. **src/db/migrations/005_add_feishu_support.sql**
   - 添加飞书用户字段（open_id, user_id, username）
   - 添加推送渠道偏好字段
   - 添加飞书消息ID字段

### 文档

7. **docs/FEISHU_INTEGRATION.md**
   - 完整的集成指南
   - 配置步骤
   - API 文档
   - 故障排查

## 修改的文件

### 配置

1. **src/config/index.ts**
   - 添加飞书配置项（APP_ID, APP_SECRET, VERIFICATION_TOKEN, ENCRYPT_KEY）

2. **.env.example**
   - 添加飞书配置示例

### 模型

3. **src/models/user.ts**
   - 添加飞书用户字段
   - 添加推送渠道偏好字段

4. **src/models/signal.ts**
   - 添加飞书消息ID字段到 SignalDelivery

### 业务逻辑

5. **src/queues/news-queue.ts**
   - 使用统一推送服务替代直接调用 Discord
   - 支持多渠道推送
   - 记录各渠道的消息ID

### API

6. **src/api/routes/index.ts**
   - 添加飞书 webhook 端点 `/api/feishu/webhook`
   - 处理飞书事件回调

## 功能特性

### 1. 多渠道推送

- 用户可以选择接收推送的渠道：Discord、飞书或两者
- 各渠道独立处理，互不影响
- 推送失败不会影响其他渠道

### 2. 交互式卡片

飞书卡片支持以下交互：
- ✅ 确认下单
- ✏️ 调整仓位（提示使用其他方式）
- ⏰ 30分钟后提醒
- ❌ 忽略
- 📋 复制交易信息（A股）

### 3. 消息类型

- **正常信号**：绿色卡片，包含完整信息和交互按钮
- **警告信号**：橙色卡片，风控警告，限制操作
- **纯资讯解读**：根据重要性显示不同颜色，无交易按钮

### 4. 自动化

- access_token 自动刷新（提前5分钟）
- 按钮点击后自动禁用，防止重复操作
- 处理结果实时更新到卡片

## 集成点

### 推送流程

```
news-queue.ts
  ↓
pushSignalToUser() (统一推送服务)
  ↓
├─→ Discord: sendDiscordMessage() + buildNormalSignalMessage()
└─→ Feishu:  sendFeishuMessage()  + buildNormalSignalCard()
  ↓
updateSignalDelivery() (记录消息ID)
```

### 事件处理流程

```
飞书服务器
  ↓
POST /api/feishu/webhook
  ↓
handleFeishuEvent()
  ↓
handleCardAction()
  ↓
stepConfirmOrder() / stepIgnoreDelivery() / etc.
  ↓
updateCardMessage() (更新卡片状态)
```

## 配置要求

### 必需配置

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 可选配置

```bash
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # webhook 验证
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx        # 消息加密
```

### 数据库

运行迁移：
```bash
npm run migrate
```

### 用户绑定

用户需要绑定飞书账号：
```bash
curl -X PATCH /api/users/{userId} \
  -d '{"feishuOpenId": "ou_xxx", "notificationChannels": ["discord", "feishu"]}'
```

## 使用示例

### 1. 仅使用飞书推送

```typescript
// 用户配置
{
  "feishuOpenId": "ou_xxxxxxxxxxxxxxxx",
  "notificationChannels": ["feishu"]
}
```

### 2. 同时使用 Discord 和飞书

```typescript
// 用户配置
{
  "discordUserId": "123456789",
  "feishuOpenId": "ou_xxxxxxxxxxxxxxxx",
  "notificationChannels": ["discord", "feishu"]
}
```

### 3. 手动推送测试

```typescript
import { sendMessageToUser } from './services/feishu/bot';
import { buildNormalSignalCard } from './services/feishu/formatter';

const card = buildNormalSignalCard(signal, delivery, riskCheck, account);
await sendMessageToUser('ou_xxxxxxxxxxxxxxxx', { card });
```

## 注意事项

### 1. 功能差异

- 飞书不支持 Modal 输入，"调整仓位"功能需要通过其他方式实现
- 飞书卡片更新使用 PATCH 请求，与 Discord 的 edit 不同

### 2. 性能

- access_token 缓存有效期 2 小时
- 推送超时时间 10 秒
- 各渠道并行推送，不会相互阻塞

### 3. 安全

- 使用 Verification Token 验证 webhook 请求
- 用户 open_id 存储在数据库中
- 支持消息加密（可选）

## 测试建议

### 1. 单元测试

```bash
# 测试飞书消息发送
npm test -- feishu/bot.test.ts

# 测试卡片格式化
npm test -- feishu/formatter.test.ts

# 测试统一推送服务
npm test -- notification/pusher.test.ts
```

### 2. 集成测试

1. 配置飞书应用和 webhook
2. 创建测试用户并绑定 open_id
3. 手动触发资讯抓取
4. 验证飞书收到消息
5. 点击按钮测试交互

### 3. 本地开发

使用 ngrok 暴露本地服务：
```bash
ngrok http 3000
# 配置 webhook: https://xxx.ngrok.io/api/feishu/webhook
```

## 未来改进

- [ ] 支持飞书群组推送
- [ ] 支持飞书机器人命令（绑定、查询等）
- [ ] 实现飞书 Modal 替代方案（消息回复）
- [ ] 添加飞书推送统计和监控
- [ ] 支持飞书消息加密
- [ ] 添加飞书用户管理界面

## 相关资源

- [飞书开放平台](https://open.feishu.cn/)
- [飞书 API 文档](https://open.feishu.cn/document/home/index)
- [卡片搭建工具](https://open.feishu.cn/tool/cardbuilder)
- [API 调试工具](https://open.feishu.cn/api-explorer/)

## 技术支持

如有问题，请查看：
1. `docs/FEISHU_INTEGRATION.md` - 完整集成指南
2. 服务器日志 - 查看错误信息
3. 飞书开放平台 - 查看事件日志
4. GitHub Issues - 提交问题
