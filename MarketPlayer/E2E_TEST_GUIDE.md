# 端到端测试指南：新闻获取 → Discord 推送

## 🎯 测试目标

验证完整的新闻处理流程：
1. MCP 服务器提供新闻数据
2. AI 分析新闻并生成交易信号
3. 风控检查
4. 推送到 Discord 用户

---

## 📋 前置准备

### 1. 配置环境变量

编辑 `.env` 文件：

```bash
# Discord Bot Token（必需）
DISCORD_BOT_TOKEN=your_real_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# AI API Key（必需）
AI_PROVIDER=anthropic
AI_API_KEY=your_anthropic_api_key

# 测试用户 Discord ID（必需）
TEST_DISCORD_USER_ID=your_discord_user_id

# MCP 服务器（使用测试服务器）
MCP_NEWS_SERVER=http://localhost:3001
MCP_NEWS_TOOL=fetch_news

# 数据库（应该已配置）
DATABASE_URL=postgresql://trading_user:password@localhost:5432/trading_bot
REDIS_URL=redis://localhost:6379
```

### 2. 获取你的 Discord User ID

1. 在 Discord 中启用开发者模式：
   - 设置 → 高级 → 开发者模式 → 开启
2. 右键点击你的用户名 → 复制 ID
3. 将 ID 填入 `.env` 的 `TEST_DISCORD_USER_ID`

### 3. 确保服务运行

```bash
# 检查 PostgreSQL
psql -U trading_user -d trading_bot -c "SELECT 1"

# 检查 Redis
redis-cli ping

# 检查数据库表
psql -U trading_user -d trading_bot -c "\dt"
```

---

## 🚀 测试步骤

### 步骤 1: 启动 MCP 测试服务器

在**第一个终端**：

```bash
npm run mcp-server
```

你应该看到：
```
=== MCP 新闻服务器已启动 ===
端口: 3001
健康检查: http://localhost:3001/health
新闻接口: http://localhost:3001/tools/fetch_news
```

**保持这个终端运行！**

---

### 步骤 2: 运行端到端测试

在**第二个终端**：

```bash
npm run test-e2e
```

---

## 📊 预期结果

### 成功的输出示例：

```
=== 端到端测试：新闻 → Discord 推送 ===

📊 初始化数据库连接...
✅ 数据库连接成功

👤 创建测试用户...
✅ 测试用户已创建: uuid-xxx

📰 创建测试新闻...
✅ 新闻已创建: uuid-yyy
   标题: Apple announces revolutionary AI chip
   市场: us
   标的: AAPL

🔄 推入 AI 处理队列...
✅ 任务已创建: 1

⏳ 等待 AI 分析和 Discord 推送...
   (这可能需要 10-30 秒)

✅ 处理完成！

📋 处理结果:
{
  "signalId": "uuid-zzz",
  "deliveries": 1,
  "status": "success"
}

🎉 测试成功！

💡 提示：
   1. 检查 Discord 私信是否收到信号推送
   2. 查看日志文件: logs/combined.log
   3. 检查数据库中的 signals 和 signal_deliveries 表
```

### Discord 中应该收到的消息：

```
📊 AI信号参考｜置信度 85%

标的：AAPL
信号方向：📈 看多
参考仓位：账户 5%（约 $2500）
参考依据：Apple 发布革命性 AI 芯片，预期将推动股价上涨

─────────────────
🛡️ 风控检查（仅富途账户）
AAPL 当前持仓：0.0%  ✅
当前总仓位：0.0%  ✅
可用资金：$50000  ✅
确认后预计总仓位：5.0%  ✅

⚠️ 风控仅覆盖富途账户，请手动确认其他平台持仓

免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负

⏱️ 本参考将于 15 分钟后失效

[✅ 确认下单] [✏️ 调整仓位] [⏰ 30分钟后提醒] [❌ 忽略]
```

---

## 🔍 故障排查

### 问题 1: Discord Bot Token 无效

**错误信息：**
```
Error [TokenInvalid]: An invalid token was provided.
```

**解决方案：**
1. 检查 `.env` 中的 `DISCORD_BOT_TOKEN` 是否正确
2. 确保 Bot 已创建并获取了正确的 Token
3. 参考 README.md 中的 Discord Bot 配置指南

---

### 问题 2: AI API 调用失败

**错误信息：**
```
Failed to analyze news: Invalid API key
```

**解决方案：**
1. 检查 `.env` 中的 `AI_API_KEY` 是否正确
2. 确认 API Key 有足够的额度
3. 检查网络连接

---

### 问题 3: 数据库连接失败

**错误信息：**
```
Failed to connect to PostgreSQL
```

**解决方案：**
```bash
# 检查 PostgreSQL 状态
brew services list | grep postgresql

# 重启 PostgreSQL
brew services restart postgresql@15

# 测试连接
psql -U trading_user -d trading_bot -c "SELECT 1"
```

---

### 问题 4: Redis 连接失败

**错误信息：**
```
Redis connection failed
```

**解决方案：**
```bash
# 检查 Redis 状态
brew services list | grep redis

# 重启 Redis
brew services restart redis

# 测试连接
redis-cli ping
```

---

### 问题 5: MCP 服务器未运行

**错误信息：**
```
MCP server not available
```

**解决方案：**
1. 确保第一个终端中 MCP 服务器正在运行
2. 检查端口 3001 是否被占用：`lsof -i :3001`
3. 重启 MCP 服务器：`npm run mcp-server`

---

### 问题 6: 没有收到 Discord 消息

**可能原因：**
1. Discord User ID 不正确
2. Bot 没有权限发送私信
3. 用户关闭了私信功能

**解决方案：**
1. 确认 `TEST_DISCORD_USER_ID` 是你的真实 Discord ID
2. 确保你和 Bot 在同一个服务器中
3. 检查 Discord 隐私设置，允许服务器成员发送私信

---

## 📝 查看日志

### 实时查看日志

```bash
# 查看所有日志
tail -f logs/combined.log

# 只看错误
tail -f logs/error.log

# 过滤特定关键词
tail -f logs/combined.log | grep "Signal"
```

### 查看数据库记录

```bash
# 查看新闻记录
psql -U trading_user -d trading_bot -c "SELECT * FROM news_items ORDER BY created_at DESC LIMIT 5;"

# 查看信号记录
psql -U trading_user -d trading_bot -c "SELECT * FROM signals ORDER BY created_at DESC LIMIT 5;"

# 查看推送记录
psql -U trading_user -d trading_bot -c "SELECT * FROM signal_deliveries ORDER BY sent_at DESC LIMIT 5;"

# 查看用户记录
psql -U trading_user -d trading_bot -c "SELECT * FROM users;"
```

---

## 🎯 测试检查清单

- [ ] MCP 服务器已启动
- [ ] Discord Bot Token 已配置
- [ ] AI API Key 已配置
- [ ] 测试用户 Discord ID 已配置
- [ ] PostgreSQL 正在运行
- [ ] Redis 正在运行
- [ ] 数据库迁移已完成
- [ ] 运行 `npm run test-e2e`
- [ ]n- [ ] 检查 Discord 私信
- [ ] 检查数据库记录
- [ ] 检查日志文件

---

## 🎉 测试成功标志

1. ✅ 终端显示 "测试成功！"
2. ✅ Discord 收到信号推送消息
3. ✅ 消息包含按钮（确认下单、调整仓位等）
4. ✅ 数据库中有对应的记录
5. ✅ 日志中没有错误信息

---

## 📚 下一步

测试成功后，你可以：

1. **配置真实的 MCP 服务器**
   - 替换 `MCP_NEWS_SERVER` 为真实地址
   - 实现真实的新闻获取逻辑

2. **添加更多用户**
   - 在 Discord 中邀请用户
   - 用户使用 `/register` 命令注册

3. **启用定时任务**
   - 修改 `src/services/scheduler/news-fetcher.ts`
   - 启用自动新闻抓取

4. **完善 Discord 交互**
   - 实现按钮点击处理
   - 添加订单执行逻辑

---

**需要帮助？** 查看 `logs/combined.log` n
