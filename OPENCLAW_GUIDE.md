# OpenClaw 集成指南

本文档提供 MarketPlayer 与 openclaw（AI Agent）完整集成的配置、测试和使用指南。

## 目录

- [概述](#概述)
- [架构说明](#架构说明)
- [快速开始](#快速开始)
- [MCP 工具列表](#mcp-工具列表)
- [Skill 命令列表](#skill-命令列表)
- [测试验证](#测试验证)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)

---

## 概述

MarketPlayer 提供完整的 MCP（Model Context Protocol）工具服务器，供 AI Agent（如 openclaw/Claude Code）调用。通过 13 个标准化工具端点，Agent 可以：

- 抓取和分析市场资讯
- 执行风控检查
- 查询账户和持仓
- 生成交易信号
- 执行订单操作

### 调用链

```
openclaw (Claude Code)
    ↓
Skill 命令 (.claude/commands/*.md)
    ↓
HTTP POST → MCP Server (localhost:3001)
    ↓
业务逻辑 (src/mcp/tools/*.ts)
    ↓
数据库 / 券商 API / AI 服务
```

---

## 架构说明

### MCP 服务器

- **端口**: 3001 (可配置)
- **协议**: HTTP REST API
- **格式**: JSON
- **认证**: 无（内网调用）
- **启动**: 随主服务自动启动（需设置 `MCP_SERVER_PORT`）

### 工具注册

所有工具在 `src/mcp/server.ts` 中注册：

```typescript
const tools: Record<string, (body: any) => Promise<any>> = {
  fetch_news,
  process_pipeline,
  analyze_news,
  generate_signal,
  check_risk,
  get_positions,
  get_account,
  get_broker_balance,
  get_deliveries,
  get_delivery,
  confirm_order,
  execute_longbridge_order,
  cancel_longbridge_order,
};
```

### Skill 定义

所有 Skill 定义在 `.claude/commands/` 目录：

```
.claude/commands/
├── fetch-news.md          # 抓取资讯
├── run-pipeline.md        # 完整流水线
├── analyze-news.md        # AI 分析
├── generate-signal.md     # 生成信号
├── check-risk.md          # 风控检查
├── get-balance.md         # 查询余额
├── get-positions.md       # 查询持仓
├── get-account.md         # 账户概况
├── get-deliveries.md      # 信号推送记录
├── get-delivery.md        # 单条推送详情
├── confirm-order.md       # 确认下单
├── execute-order.md       # 直接下单
├── cancel-order.md        # 取消订单
└── ... (研究分析类 Skill)
```

---

## 快速开始

### 1. 启动 MarketPlayer

#### 方式 A: Docker Compose（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，确保设置 MCP_SERVER_PORT=3001

# 启动所有服务
docker-compose up -d

# 验证服务
curl http://localhost:3000/health  # API Server
curl http://localhost:3001/health  # MCP Server
```

#### 方式 B: 本地开发

```bash
npm install
cp .env.example .env
# 编辑 .env，设置 MCP_SERVER_PORT=3001

npm run migrate
npm run dev
```

### 2. 验证 MCP 服务器

```bash
# 列出所有工具
curl http://localhost:3001/tools

# 测试单个工具
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"market":"us","limit":1}'
```

### 3. 运行集成测试

```bash
npm run test:openclaw
# 或
npx ts-node scripts/test-openclaw-integration.ts
```

### 4. 在 openclaw 中使用

在 Claude Code 对话中：

```
/fetch-news market=us limit=5
/get-balance broker=longbridge
/check-risk userId=<uuid> symbol=AAPL market=us direction=long positionPct=5
```

---

## MCP 工具列表

### 资讯层

#### `fetch_news`

拉取市场资讯（只读，不写库）

**参数**:
```json
{
  "market": "us | hk | a | btc",
  "symbols": ["AAPL", "TSLA"],  // 可选
  "limit": 10,                   // 可选
  "since": "2026-03-05T00:00:00Z" // 可选
}
```

**返回**:
```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "content": "...",
      "market": "us",
      "symbols": ["AAPL"],
      "publishedAt": "2026-03-05T10:00:00Z"
    }
  ],
  "source": "alpha_vantage",
  "fetchedAt": "2026-03-05T15:00:00Z",
  "total": 10
}
```

#### `process_pipeline`

完整资讯处理流程：抓取 → 过滤 → 写库 → AI 分析 → Discord 推送

**参数**:
```json
{
  "market": "us | hk | a | btc"
}
```

**返回**:
```json
{
  "ok": true,
  "market": "us"
}
```

### AI 分析层

#### `analyze_news`

对已入库资讯执行 AI 分析

**参数**:
```json
{
  "newsItemId": "<uuid>"
}
```

**返回**:
```json
{
  "newsItemId": "...",
  "summary": "...",
  "impact": "...",
  "sentiment": "positive | negative | neutral",
  "importance": "high | medium | low"
}
```

#### `generate_signal`

基于已分析资讯生成交易信号

**参数**:
```json
{
  "newsItemId": "<uuid>"
}
```

**返回**:
```json
{
  "generated": true,
  "signalId": "...",
  "direction": "long | short",
  "confidence": 75,
  "suggestedPositionPct": 8,
  "reasoning": "...",
  "keyRisk": "..."
}
```

### 风控层

#### `check_risk`

执行风控检查

**参数**:
```json
{
  "userId": "<uuid>",
  "symbol": "AAPL",
  "market": "us",
  "direction": "long | short",
  "positionPct": 5.0,
  "broker": "longbridge | futu"  // 可选
}
```

**返回**:
```json
{
  "userId": "...",
  "symbol": "AAPL",
  "direction": "long",
  "positionPct": 5.0,
  "level": "pass | warning | blocked",
  "reasons": ["..."],
  "adjustedPositionPct": 5.0
}
```

### 账户 / 持仓层

#### `get_broker_balance`

直接查询券商账户余额（无需 userId）

**参数**:
```json
{
  "broker": "longbridge | futu",
  "userId": "system"  // 可选
}
```

**返回**:
```json
{
  "broker": "longbridge",
  "positions": [
    {
      "symbol": "700.HK",
      "quantity": 300,
      "marketValue": 79560,
      "positionPct": 12.7
    }
  ],
  "totalPositionPct": 75.1,
  "fetchedAt": "2026-03-05T15:00:00Z"
}
```

#### `get_positions`

获取用户持仓快照（含手动持仓，有缓存）

**参数**:
```json
{
  "userId": "<uuid>",
  "broker": "longbridge | futu",  // 可选
  "forceRefresh": false            // 可选
}
```

**返回**:
```json
{
  "userId": "...",
  "broker": "longbridge",
  "snapshot": {
    "positions": [...],
    "totalPositionPct": 75.1,
    "source": "longbridge_api",
    "fetchedAt": "..."
  },
  "manualPositions": [...],
  "fetchedAt": "..."
}
```

#### `get_account`

获取账户资金概况

**参数**:
```json
{
  "userId": "<uuid>",
  "broker": "longbridge | futu"  // 可选
}
```

**返回**:
```json
{
  "userId": "...",
  "broker": "longbridge",
  "totalPositionPct": 75.1,
  "source": "longbridge_api",
  "fetchedAt": "..."
}
```

### 订单层

#### `get_deliveries`

查询信号推送记录列表

**参数**:
```json
{
  "userId": "<uuid>",  // 可选
  "status": "pending | confirmed | ignored",  // 可选
  "limit": 50  // 可选
}
```

**返回**:
```json
{
  "deliveries": [
    {
      "id": "...",
      "userId": "...",
      "signalId": "...",
      "status": "pending",
      "sentAt": "..."
    }
  ],
  "total": 10
}
```

#### `get_delivery`

查询单条信号推送详情

**参数**:
```json
{
  "deliveryId": "<uuid>"
}
```

**返回**:
```json
{
  "id": "...",
  "userId": "...",
  "signalId": "...",
  "status": "pending",
  "orderToken": "...",
  "sentAt": "..."
}
```

#### `confirm_order`

确认下单（加入下单队列）

**参数**:
```json
{
  "deliveryId": "<uuid>",
  "orderToken": "...",
  "overrideWarning": false  // 可选
}
```

**返回**:
```json
{
  "kind": "queued | not_found | wrong_status | token_mismatch",
  "deliveryId": "...",
  "currentStatus": "..."  // 如果 wrong_status
}
```

### 执行层

#### `execute_longbridge_order`

通过长桥执行下单

**参数**:
```json
{
  "userId": "<uuid>",
  "symbol": "AAPL",
  "market": "us | hk | a",
  "direction": "buy | sell",
  "quantity": 100,
  "referencePrice": 150.0  // 可选
}
```

**返回**:
```json
{
  "success": true,
  "mode": "B",
  "deepLink": "longbridge://...",
  "message": "..."
}
```

#### `cancel_longbridge_order`

取消长桥订单

**参数**:
```json
{
  "userId": "<uuid>",
  "brokerOrderId": "..."
}
```

**返回**:
```json
{
  "success": true,
  "message": "..."
}
```

---

## Skill 命令列表

### 核心交易流程

| Skill | 说明 | 示例 |
|-------|------|------|
| `/fetch-news` | 拉取资讯（只读） | `/fetch-news market=us limit=5` |
| `/run-pipeline` | 完整流水线 | `/run-pipeline market=hk` |
| `/analyze-news` | AI 分析 | `/analyze-news <newsItemId>` |
| `/generate-signal` | 生成信号 | `/generate-signal <newsItemId>` |
| `/check-risk` | 风控检查 | `/check-risk userId=<uuid> symbol=AAPL market=us direction=long positionPct=5` |
| `/get-balance` | 查询余额 | `/get-balance broker=longbridge` |
| `/get-positions` | 查询持仓 | `/get-positions userId=<uuid>` |
| `/get-account` | 账户概况 | `/get-account userId=<uuid>` |
| `/get-deliveries` | 推送记录 | `/get-deliveries status=pending` |
| `/confirm-order` | 确认下单 | `/confirm-order deliveryId=<uuid> orderToken=<token>` |
| `/execute-order` | 直接下单 | `/execute-order userId=<uuid> symbol=AAPL market=us direction=buy quantity=100` |
| `/cancel-order` | 取消订单 | `/cancel-order userId=<uuid> brokerOrderId=<id>` |

### 研究分析类（不依赖 MCP Server）

| Skill | 说明 |
|-------|------|
| `/macro-analysis` | 宏观自上而下分析 |
| `/insider-trades` | 内部人士买入检测 |
| `/short-squeeze` | 空头挤压筛选 |
| `/ma-radar` | 并购目标雷达 |
| `/sentiment-divergence` | 情绪 vs 基本面套利 |
| `/correlation-map` | 跨资产关联性分析 |
| `/dividend-danger` | 分红危险雷达 |
| `/institutional-holdings` | 机构 13F 持仓追踪 |
| `/portfolio-hedge` | 持仓对冲方案 |
| `/weekly-briefing` | 每周量化简报 |

---

## 测试验证

### 自动化测试

```bash
# 运行完整集成测试
npm run test:openclaw

# 或直接运行
npx ts-node scripts/test-openclaw-integration.ts
```

测试覆盖：
- ✅ MCP Server 健康检查
- ✅ 工具列表查询
- ✅ 所有 13 个工具端点
- ✅ 错误处理验证
- ✅ 响应时间统计

### 手动测试

#### 1. 测试资讯抓取

```bash
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"market":"us","limit":3}'
```

#### 2. 测试账户查询

```bash
curl -X POST http://localhost:3001/tools/get_broker_balance \
  -H "Content-Type: application/json" \
  -d '{"broker":"longbridge"}'
```

#### 3. 测试完整流水线

```bash
curl -X POST http://localhost:3001/tools/process_pipeline \
  -H "Content-Type: application/json" \
  -d '{"market":"btc"}'
```

### 在 openclaw 中测试

```
# 1. 验证 Skill 加载
/skills

# 2. 测试资讯抓取
/fetch-news market=us limit=3

# 3. 测试账户查询
/get-balance broker=longbridge

# 4. 测试完整流程
/run-pipeline market=btc
```

---

## 常见问题

### Q1: MCP Server 无法启动

**症状**: `curl http://localhost:3001/health` 连接失败

**解决方案**:
1. 检查 `.env` 中是否设置了 `MCP_SERVER_PORT=3001`
2. 检查主服务是否正常启动：`curl http://localhost:3000/health`
3. 查看日志：`docker logs marketplayer-app-1` 或 `npm run dev` 输出
4. 确认端口未被占用：`lsof -i :3001`

### Q2: Skill 调用返回 "not found"

**症状**: openclaw 提示找不到 Skill

**解决方案**:
1. 确认 `.claude/commands/` 目录存在
2. 检查 Skill 文件是否存在：`ls .claude/commands/`
3. 在 Claude Code 中运行 `/skills` 查看已加载的 Skill
4. 如果在其他目录，需要复制或软链 `.claude/` 目录

### Q3: 工具调用返回 "User not found"

**症状**: 需要 userId 的工具返回用户不存在

**解决方案**:
1. 这是正常的，测试时使用的是假 UUID
2. 实际使用时需要先创建用户：
   ```bash
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{"discordUserId":"your-discord-id","riskProfile":"balanced"}'
   ```
3. 或使用 Discord Bot 自动创建用户

### Q4: 长桥工具返回错误

**症状**: `execute_longbridge_order` 或 `get_broker_balance` 失败

**解决方案**:
1. 检查 `.env` 中长桥配置：
   ```
   LONGPORT_APP_KEY=...
   LONGPORT_APP_SECRET=...
   LONGPORT_ACCESS_TOKEN=...
   ```
2. 验证凭证有效性：`npx ts-node scripts/query-longbridge-balance.ts`
3. 确认账户已开通相应市场权限

### Q5: AI 分析工具失败

**症状**: `analyze_news` 或 `generate_signal` 返回错误

**解决方案**:
1. 检查 AI 配置：
   ```
   AI_PROVIDER=anthropic
   AI_API_KEY=sk-ant-...
   AI_MODEL=claude-sonnet-4-20250514
   ```
2. 确认 API Key 有效且有余额
3. 检查每日调用限制：`AI_DAILY_CALL_LIMIT=500`

### Q6: 工具响应慢

**症状**: 工具调用超时或响应时间过长

**解决方案**:
1. 检查数据库连接：`docker ps | grep postgres`
2. 检查 Redis 连接：`docker exec -it marketplayer-redis-1 redis-cli ping`
3. 使用 `forceRefresh=false` 利用缓存
4. 减少 `limit` 参数值

---

## 最佳实践

### 1. 工作流设计

#### 完整交易流程

```
1. /run-pipeline market=hk
   → 触发港股资讯抓取和分析

2. /get-deliveries status=pending
   → 查看待确认信号

3. /check-risk userId=<uuid> symbol=700.HK market=hk direction=long positionPct=8
   → 验证风控

4. /confirm-order deliveryId=<uuid> orderToken=<token>
   → 确认下单
```

#### Agent 主动分析

```
1. /fetch-news market=us limit=10
   → 获取资讯列表

2. Agent 筛选感兴趣的资讯

3. /analyze-news <newsItemId>
   → AI 深度分析

4. /generate-signal <newsItemId>
   → 生成交易信号

5. /check-risk ...
   → 风控检查

6. /execute-order ...
   → 直接下单
```

### 2. 错误处理

所有工具都返回标准化错误格式：

```json
{
  "error": "User not found: <uuid>"
}
```

Agent 应该：
1. 检查响应中是否有 `error` 字段
2. 根据错误类型决定重试或跳过
3. 记录错误日志供后续分析

### 3. 性能优化

#### 使用缓存

```javascript
// 优先使用缓存（60秒 TTL）
await get_positions({ userId, forceRefresh: false });

// 下单前强制刷新
await get_positions({ userId, forceRefresh: true });
```

#### 批量操作

```javascript
// 一次性获取多个市场资讯
await Promise.all([
  fetch_news({ market: 'us', limit: 5 }),
  fetch_news({ market: 'hk', limit: 5 }),
  fetch_news({ market: 'a', limit: 5 }),
]);
```

#### 限制并发

```javascript
// 避免同时触发多个 AI 分析
for (const newsItemId of newsItemIds) {
  await analyze_news({ newsItemId });
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### 4. 安全建议

1. **不要在日志中输出敏感信息**
   - API Key
   - 订单 Token
   - 用户 ID

2. **验证输入参数**
   - 检查 UUID 格式
   - 验证数值范围
   - 过滤特殊字符

3. **限制调用频率**
   - 使用 Redis 实现速率限制
   - 设置每日调用上限
   - 监控异常调用模式

4. **审计日志**
   - 记录所有工具调用
   - 保存关键操作历史
   - 定期审查异常行为

### 5. 监控和告警

#### 健康检查

```bash
# 定期检查服务状态
*/5 * * * * curl -f http://localhost:3001/health || alert
```

#### 性能监控

```javascript
// 记录工具调用时间
const start = Date.now();
const result = await tool(params);
const duration = Date.now() - start;
logger.info(`Tool ${toolName} took ${duration}ms`);
```

#### 错误告警

```javascript
// 关键工具失败时发送告警
if (criticalTools.includes(toolName) && result.error) {
  await sendAlert(`Critical tool ${toolName} failed: ${result.error}`);
}
```

---

## 附录

### A. 环境变量完整列表

详见 `.env.example` 文件。

### B. 工具端点完整 Schema

详见 `src/mcp/tools/*.ts` 文件中的 TypeScript 类型定义。

### C. Skill 命令完整文档

详见 `.claude/commands/*.md` 文件。

### D. 相关文档

- [OPENCLAW_INTEGRATION.md](OPENCLAW_INTEGRATION.md) - 旧版集成文档
- [dev-docs/11-OPENCLAW-SETUP.md](dev-docs/11-OPENCLAW-SETUP.md) - 开发者设置指南
- [MCP_TEST_GUIDE.md](MCP_TEST_GUIDE.md) - MCP 测试指南
- [README.md](README.md) - 项目总览

---

## 更新日志

### 2026-03-05

- ✅ 创建完整的 openclaw 集成指南
- ✅ 添加自动化测试脚本
- ✅ 验证所有 13 个 MCP 工具端点
- ✅ 补充常见问题和最佳实践
- ✅ 提供完整的工作流示例

---

**如有问题，请查看 [常见问题](#常见问题) 或提交 Issue。**
