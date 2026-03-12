# MarketPlayer 模块文档

## 系统架构概览

MarketPlayer 是一个 AI 驱动的量化交易信号系统，核心理念为 Human-in-the-loop：AI 生成信号，用户确认，系统执行。

整体流程：
```
定时调度 → 资讯抓取 → 去重过滤 → AI分析 → 信号生成 → 风控检查 → 多渠道推送
→ 用户确认 → 下单队列 → 券商执行 → 结果通知
```

主要服务进程：
- API Server（端口 3000）：REST API，供前端和外部调用
- MCP Tool Server（端口 3001）：HTTP 工具端点，供 AI Agent 按需调用
- Discord Bot：实时交互，按钮确认下单
- BullMQ Workers：异步队列处理（资讯分析、下单执行、延迟提醒、推送发送）
- node-cron 调度器：定期触发资讯抓取

---

## 模块列表

### 1. 资讯模块 (News)

- 文件：`src/services/news/`
- 功能：从多个数据源抓取市场资讯，经去重过滤后写入数据库，触发 AI 分析队列
- 数据源（内置）：
  - 美股（us）：Alpha Vantage NEWS_SENTIMENT API → Yahoo Finance RSS fallback
  - 港股（hk）：Yahoo Finance RSS（多标的并发抓取）
  - A股（a）：东方财富 API → fallback URL
  - BTC：CoinGecko News API → CoinDesk RSS fallback
- 适配器架构（三层优先级）：
  1. 外部适配器（priority 1-10）：`NEWS_ADAPTERS` 环境变量 JSON 配置，支持 api/skill/mcp/custom 类型
  2. MCP 适配器（priority 50）：`MCP_NEWS_SERVER` 外部 MCP 服务器
  3. 内置源（priority 100）：上述四个内置数据源
- Redis 去重：每个标的 1 小时 TTL，BTC 限流按 4 小时块
- Skill：`/fetch-news`、`/run-pipeline`
- API：无（通过 MCP 工具端点调用）

---

### 2. AI 分析模块 (Analyzer)

- 文件：`src/services/ai/`
- 功能：对资讯进行两阶段 AI 分析，生成交易信号
- 多提供商支持：
  - Anthropic Claude（默认：claude-sonnet-4-20250514）
  - OpenAI GPT-4
  - Azure OpenAI
  - Custom API（OpenAI 兼容接口）
- 两阶段分析：
  1. `analyzeNewsItem()` → 摘要 + 情绪 + 影响分析，结果写入 `news_items.ai_summary`
  2. `generateSignal()` → 方向（long/short）+ 置信度（0-100）+ 仓位% + 推理，置信度 < 40 不生成信号
- 成本控制：
  - Token 计数 + 每日调用限额（默认 500 次，`AI_DAILY_LIMIT` 配置）
  - 小时成本告警：$5 警告 / $10 熔断
  - 所有调用记录到 `ai_cost_logs` 表
- Skill：`/analyze-news`、`/generate-signal`

---

### 3. 风控模块 (Risk)

- 文件：`src/services/risk/engine.ts`
- 功能：在下单前执行多层风险检查，保护资金安全
- 检查项目：
  - 单仓位上限（10-30%，按 riskPreference 动态调整）
  - 总仓位上限（60-95%，保留现金缓冲）
  - 可用现金余额检查
  - 手动持仓合并（24 小时新鲜度校验）
- 返回结果类型：
  - `pass`：正常通过，可直接下单
  - `warning`：显示风险警告，用户可选择覆盖（overrideWarning）后继续
  - `blocked`：直接阻止，不推送信号
- Skill：`/check-risk`

---

### 4. 通知模块 (Notification)

- 文件：`src/services/notification/pusher.ts`
- 支持渠道：Discord / 飞书 / Email（三渠道并行发送）
- 配置方式：用户记录的 `notificationChannels` 数组（默认 `['discord']`）
- 三个对外接口：
  - `pushSignalToUser()`：推送交易信号（正常/警告两种卡片）
  - `pushNewsOnlyToUser()`：推送纯资讯解读（无交易信号）
  - `sendTextToUser()`：发送纯文本消息（目前仅 Discord + 飞书）
- 渠道路由逻辑：按 `notificationChannels` 遍历，各渠道独立发送，单渠道失败不影响其他渠道
- Skill：`/send-email`（Email 渠道）

---

### 5. 邮件模块 (Email)

- 文件：`src/services/email/`
  - `mailer.ts`：SMTP 连接管理 + `sendEmail()` 函数
  - `formatter.ts`：HTML 邮件模板生成
- SMTP：通用 SMTP，通过环境变量配置（`EMAIL_SMTP_HOST/PORT/USER/PASS/SECURE`），默认支持 QQ 邮箱（smtp.qq.com:465）
- 邮件类型：
  - 信号邮件（`buildSignalEmailHtml`）：正常交易信号
  - 警告邮件（`buildWarningSignalEmailHtml`）：风控警告信号
  - 纯资讯邮件（`buildNewsOnlyEmailHtml`）：无交易意向的资讯解读
- 配置检查：`isEmailConfigured()` 在发送前检查 SMTP 是否已配置，未配置时静默跳过
- 发件人：`EMAIL_FROM` 环境变量，未配置时使用 `EMAIL_SMTP_USER`
- Skill：`/send-email`

---

### 6. 飞书模块 (Feishu)

- 文件：`src/services/feishu/`
  - `bot.ts`：飞书 Open API 调用（发送消息 + 更新卡片）
  - `formatter.ts`：交互式卡片消息模板（信号卡片 / 警告卡片 / 纯资讯卡片）
  - `handler.ts`：飞书 Webhook 事件处理
  - `types.ts`：TypeScript 类型定义
- 功能：
  - `sendMessageToUser(openId, message)`：向用户发送文本消息或交互式卡片
  - `updateMessage(messageId, card)`：更新已发送的卡片内容（用于状态更新）
  - Token 缓存：`tenant_access_token` 自动刷新，提前 5 分钟过期
  - Webhook 接收：`POST /api/feishu/webhook` 处理用户交互事件
- 配置：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_VERIFICATION_TOKEN`（可选）
- Skill：暂无独立 Skill（作为通知渠道之一，通过 `pusher.ts` 调用）

---

### 7. Discord 模块 (Discord)

- 文件：`src/services/discord/`
  - `bot.ts`：Discord 机器人，DM 发送
  - `formatter.ts`：Embed 消息 + 交互按钮模板
  - `handler.ts`：按钮交互事件处理
- 按钮交互流程：
  - `confirm` → `stepConfirmOrder()` → 入 orderQueue
  - `ignore` → `stepIgnoreDelivery()`
  - `abandon` → `stepAbandonDelivery()`
  - `adjust` → Modal 输入 → `stepAdjustAndConfirm()`
  - `remind` → remindQueue（30 分钟延迟提醒）
- 配置：`DISCORD_BOT_TOKEN`、`DISCORD_CLIENT_ID`
- Skill：无独立 Skill（作为通知渠道之一，通过 `pusher.ts` 调用）

---

### 8. 账户/持仓模块 (Position)

- 文件：`src/services/futu/`、`src/services/longbridge/`
- 支持券商：
  - 富途（Futu）：需要本地 OpenD 进程 + OpenAPI 权限
  - 长桥（Longbridge）：通过 longport SDK，需 `LONGPORT_APP_KEY/SECRET/ACCESS_TOKEN`
- 三种运行模式（每个券商独立配置）：
  - Mode A：全自动（需完整 SDK 权限）
  - Mode B：生成深链接，跳转 App 手动确认（当前默认）
  - Mode C：纯通知，不执行下单
- 优先券商：`PREFERRED_BROKER` 环境变量（默认 longbridge）
- 持仓缓存：Redis 缓存，避免频繁请求券商 API
- 手动持仓：用户可通过 API 录入 `manual_positions`，与券商持仓合并使用
- Skill：`/get-balance`、`/get-account`、`/get-positions`

---

### 9. 下单模块 (Order)

- 文件：`src/queues/order-queue.ts`、`src/services/futu/order.ts`、`src/services/longbridge/order.ts`
- 下单步骤（`src/queues/steps/`）：
  1. `order-validate.ts`：验证 orderToken、deliveryId 有效性
  2. `order-risk.ts`：执行风控检查
  3. `order-execute.ts`：调用券商 SDK 下单
  4. `order-interact.ts`：处理用户交互（确认/调整/忽略/放弃）
- 下单模式：A（全自动）/ B（深链接，默认）/ C（纯通知）
- 分布式锁：Redis 用户级锁，防止重复下单
- Skill：`/confirm-order`、`/cancel-order`、`/execute-order`

---

### 10. 队列模块 (Queue)

- 文件：`src/queues/`
- 技术栈：BullMQ 5.0（Redis-backed）

| 队列 | 文件 | 并发 | 重试 | 功能 |
|------|------|------|------|------|
| newsQueue | `news-queue.ts` | 3 workers | 3次+指数退避 | 资讯 AI 分析 → 信号生成 → 用户推送 |
| orderQueue | `order-queue.ts` | 5 workers | 3次（可重试错误） | 验证 → 风控 → 执行 → 通知 |
| remindQueue | `remind-queue.ts` | 5 workers | — | 30分钟延迟，DM 提醒待处理信号 |
| deliveryQueue | `delivery-queue.ts` | — | — | 多渠道推送发送 |

---

### 11. API 模块

- 文件：`src/api/`
- 端口：3000
- 认证：Bearer JWT（`JWT_SECRET` 签名，`JWT_EXPIRES_IN` 有效期）

**公开端点**（无需认证）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/users/:discordUserId | 按 Discord 用户ID 查询用户信息 |
| GET | /api/users/:userId/signals | 用户信号推送历史（含信号详情，limit 最大100） |
| GET | /api/users/:userId/positions | 用户手动持仓列表 |
| GET | /api/users/:userId/orders | 用户订单历史（limit 最大100） |
| POST | /api/feishu/webhook | 飞书事件回调接收 |

**管理员端点**（需 Bearer JWT + admin role）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/users | 创建用户（需 discordUserId + discordUsername） |
| POST | /api/admin/token | 凭 ADMIN_DISCORD_USER_ID 生成管理 JWT |
| GET | /api/admin/costs | AI 成本统计（今日/本月/按类型） |
| GET | /api/admin/orders | 所有订单（可按 status 过滤，limit 最大500） |
| GET | /api/admin/dashboard/stats | 四维聚合统计（news/signals/orders/deliveries） |
| GET | /api/admin/dashboard/news | 资讯列表含 AI 处理状态（limit 最大100） |
| GET | /api/admin/dashboard/signals | 信号列表含推送统计，按 symbol 去重（limit 最大100） |
| GET | /api/admin/deliveries | 推送记录（可按 status 过滤，limit 最大500） |
| GET | /api/admin/users | 用户列表含信号数/订单数（limit 最大500） |

- Skill：`/get-health`、`/get-user`、`/get-user-signals`、`/get-user-orders`、`/admin-token`、`/admin-costs`、`/admin-stats`、`/admin-news`、`/admin-signals`、`/admin-deliveries`、`/admin-orders`、`/admin-users`

---

### 12. MCP 工具模块

- 文件：`src/mcp/`
  - `server.ts`：HTTP 工具服务器，注册并路由所有工具
  - `tools/news.ts`：`fetch_news`、`process_pipeline`
  - `tools/analysis.ts`：`analyze_news`、`generate_signal`
  - `tools/risk.ts`：`check_risk`
  - `tools/position.ts`：`get_positions`、`get_account`、`get_broker_balance`
  - `tools/order.ts`：`get_deliveries`、`get_delivery`、`confirm_order`
  - `tools/execute-order.ts`：`execute_longbridge_order`、`cancel_longbridge_order`
- 端口：`MCP_SERVER_PORT`（默认 3001）
- 调用格式：`POST http://localhost:3001/tools/{toolName}`，Body 为 JSON 参数
- 工具列表端点：`GET /tools`（返回所有已注册工具名）
- 健康检查：`GET /health`
- 启动方式：随主服务自动启动，或 `ts-node src/mcp/server.ts` 独立运行

**已注册工具（共 13 个）**：

| 工具 | 分类 | 对应 Skill |
|------|------|-----------|
| `fetch_news` | 资讯 | `/fetch-news` |
| `process_pipeline` | 资讯 | `/run-pipeline` |
| `analyze_news` | AI 分析 | `/analyze-news` |
| `generate_signal` | AI 分析 | `/generate-signal` |
| `check_risk` | 风控 | `/check-risk` |
| `get_positions` | 持仓 | `/get-positions` |
| `get_account` | 持仓 | `/get-account` |
| `get_broker_balance` | 持仓 | `/get-balance` |
| `get_deliveries` | 下单 | `/get-deliveries` |
| `get_delivery` | 下单 | `/get-delivery` |
| `confirm_order` | 下单 | `/confirm-order` |
| `execute_longbridge_order` | 执行 | `/execute-order` |
| `cancel_longbridge_order` | 执行 | `/cancel-order` |

---

### 13. 数据库模块

- 数据库：PostgreSQL 15+（`DATABASE_URL`）
- 缓存：Redis 7+（`REDIS_URL`）

**核心数据表**：

| 表名 | 说明 |
|------|------|
| `users` | 用户信息，含 Discord/飞书/Email、风险偏好、通知渠道配置 |
| `broker_accounts` | 加密存储的券商 API 凭证（AES-256-CBC） |
| `manual_positions` | 用户手动录入持仓，用于风控合并计算 |
| `news_items` | 原始资讯 + AI 分析结果（摘要/情绪/重要性） |
| `signals` | 交易信号，含方向/置信度/仓位建议，15 分钟过期 |
| `signal_deliveries` | 信号推送记录，含 orderToken、用户确认状态 |
| `orders` | 已执行订单 + 券商返回的执行状态 |
| `ai_cost_logs` | AI Token 使用量及成本追踪 |

**迁移文件**（`src/db/migrations/`）：

| 文件 | 内容 |
|------|------|
| `001_initial_schema.sql` | 核心表（users、broker_accounts、manual_positions、news_items） |
| `002_signals_orders.sql` | signals、signal_deliveries、orders 表 |
| `003_orders_logs.sql` | 订单日志 + ai_cost_logs 表 |
| `004_widen_external_id.sql` | 扩展 news_items.external_id 为 TEXT 类型 |
| `005_add_feishu_support.sql` | users 表添加 feishu_open_id 字段 |
| `006_add_email_support.sql` | users 表添加 email 字段及 notificationChannels |

**Redis 用途**：
- 资讯去重（1小时 TTL per symbol）
- BTC 限流（4小时块）
- AI 每日调用计数
- 分布式锁（用户级下单防重）
- orderToken 处理状态
- 持仓缓存（富途/长桥）
