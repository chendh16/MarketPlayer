# 飞书推送快速开始

## 5分钟快速配置

### 步骤1: 创建飞书应用

1. 访问 https://open.feishu.cn/
2. 点击"创建企业自建应用"
3. 填写应用名称和描述
4. 记录以下信息：
   - App ID: `cli_xxxxxxxxxxxxxxxx`
   - App Secret: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 步骤2: 配置应用权限

在应用管理页面，添加以下权限：

**必需权限：**
- ✅ `im:message` - 发送消息
- ✅ `im:message:send_as_bot` - 以应用身份发送消息
- ✅ `im:chat` - 获取群组信息

点击"发布版本"使权限生效。

### 步骤3: 配置事件订阅

1. 在应用管理页面，找到"事件订阅"
2. 配置请求地址：
   ```
   https://your-domain.com/api/feishu/webhook
   ```
3. 订阅以下事件：
   - `card.action.trigger` - 卡片按钮点击
4. 记录 Verification Token

### 步骤4: 配置环境变量

编辑 `.env` 文件，添加：

```bash
# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 步骤5: 运行数据库迁移

```bash
npm run migrate
```

### 步骤6: 重启服务

```bash
npm run restart
```

## 测试推送

### 方法1: 使用测试脚本

```bash
# 获取你的 open_id（在飞书中向机器人发送消息，查看日志）
npx ts-node scripts/test-feishu-push.ts ou_xxxxxxxxxxxxxxxx
```

### 方法2: 绑定用户并触发推送

```bash
# 1. 绑定飞书账号
curl -X PATCH http://localhost:3000/api/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "feishuOpenId": "ou_xxxxxxxxxxxxxxxx",
    "notificationChannels": ["feishu"]
  }'

# 2. 手动触发资讯抓取（会自动推送）
npm run fetch-news
```

## 获取 open_id

有两种方式获取用户的 open_id：

### 方式1: 通过飞书开放平台

1. 在飞书开放平台，找到"用户管理"
2. 搜索用户，查看 open_id

### 方式2: 通过机器人消息

1. 在飞书中搜索你的机器人
2. 向机器人发送任意消息
3. 查看服务器日志，会显示发送者的 open_id

## 常见问题

### Q: 推送失败，提示 "Invalid access token"

A: 检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确。

### Q: Webhook 验证失败

A: 检查 `FEISHU_VERIFICATION_TOKEN` 是否与飞书开放平台配置一致。

### Q: 按钮点击无响应

A:
1. 检查 webhook URL 是否可访问
2. 查看服务器日志是否有错误
3. 确认事件订阅已配置

### Q: 如何同时使用 Discord 和飞书？

A: 设置用户的 `notificationChannels` 为 `["discord", "feishu"]`：

```bash
curl -X PATCH http://localhost:3000/api/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "notificationChannels": ["discord", "feishu"]
  }'
```

## 下一步

- 查看完整文档：[FEISHU_INTEGRATION.md](./FEISHU_INTEGRATION.md)
- 了解实现细节：[FEISHU_IMPLEMENTATION.md](./FEISHU_IMPLEMENTATION.md)
- 自定义消息格式：编辑 `src/services/feishu/formatter.ts`
- 添加新的交互功能：编辑 `src/services/feishu/handler.ts`

## 技术支持

如有问题，请：
1. 查看服务器日志
2. 查看飞书开放平台的事件日志
3. 提交 GitHub Issue
