# MarketPlayer × OpenClaw 接入指南

> 本文档描述各模块当前状态，以及如何作为 agent tool 接入 OpenClaw 多 agent 编排框架。

---

## 一、整体架构映射

```
OpenClaw Orchestrator
    │
    ├─ NewsAgent          ← runUSStockFetch / runHKStockFetch / runAStockFetch / runBTCFetch
    ├─ AnalysisAgent      ← processAnalysis(newsItemId)
    ├─ SignalAgent         ← processSignal(newsItemId, analysis)
    ├─ RiskAgent           ← checkRisk(input) / stepPreOrderRisk(user, signal, delivery)
    ├─ NotifyAgent         ← processDelivery(signalId) / sendSignalToUser()
    ├─ OrderAgent          ← stepValidateDelivery → stepPreOrderRisk → stepExecuteOrder
    └─ InteractAgent       ← stepConfirmOrder / stepAdjustAndConfirm / stepGetCopyTradeInfo
```

---

## 二、各模块接入状态

### ✅ 可直接注册为 Tool（接口已就绪）

#### 1. AI 分析模块
**文件：** `src/services/ai/analyzer.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `analyzeNewsItem` | `(newsItem) → Promise<AnalysisResult>` | 生成摘要、影响、情绪、重要性 |
| `generateSignal` | `(newsItem, analysis) → Promise<SignalResult \| null>` | 生成交易信号，置信度 <40 返回 null |

**接入方式：**
```typescript
// 注册为 OpenClaw tool
{
  name: "analyze_news",
  description: "对单条资讯进行 AI 分析，返回摘要和市场影响",
  inputSchema: { newsItemId: "string" },
  handler: async ({ newsItemId }) => {
    const item = await getNewsItem(newsItemId);
    return analyzeNewsItem(item);
  }
}
```

**注意：** 内置每日调用上限（`AI_DAILY_CALL_LIMIT`，默认 500），超限自动抛错。

---

#### 2. 风控引擎
**文件：** `src/services/risk/engine.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `checkRisk` | `(RiskCheckInput) → Promise<RiskCheckResult>` | 纯函数，无副作用，最适合做 tool |

**RiskCheckInput：**
```typescript
{
  user: User,
  symbol: string,
  market: string,
  suggestedPositionPct: number,
  accountSnapshot: AccountSnapshot,
  manualPositions: ManualPosition[]
}
```

**返回：** `status: 'pass' | 'warning' | 'blocked'` + 详细原因列表

**接入方式：** 直接 1:1 注册为 tool，零改造。

---

#### 3. 富途下单模块
**文件：** `src/services/futu/order.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `executeFutuOrder` | `(user, order) → Promise<FutuOrderResult>` | 路由到 A/B/C 模式 |
| `executeFutuOrderPlanA` | `(user, order) → Promise<FutuOrderResult>` | 全自动 SDK 下单 |
| `executeFutuOrderPlanB` | `(order) → Promise<FutuOrderResult>` | 深链接（MVP 默认） |
| `cancelFutuOrder` | `(user, brokerOrderId) → Promise<FutuOrderResult>` | 撤单 |

**接入方式：**
```typescript
{
  name: "place_order",
  description: "通过富途执行股票下单",
  handler: async ({ userId, orderId }) => {
    const user = await getUserById(userId);
    const order = await getOrder(orderId);
    return executeFutuOrder(user, order);
  }
}
```

---

#### 4. 持仓查询
**文件：** `src/services/futu/position.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `getAccountSnapshot` | `(userId, broker, forceRefresh?) → Promise<AccountSnapshot>` | 优先缓存（60s TTL） |
| `getAccountSnapshotForOrder` | `(userId, broker) → Promise<AccountSnapshot>` | 强制实时拉取 |

**接入方式：** 直接注册为 context 获取 tool，用于为风控 agent 提供实时账户数据。

---

#### 5. News 流水线步骤（拆分后）
**文件：** `src/queues/news-queue.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `processAnalysis` | `(newsItemId) → Promise<AnalysisResult>` | AI 分析并写库 |
| `processSignal` | `(newsItemId, analysis) → Promise<string \| null>` | 生成信号写库，返回 signalId |
| `processDelivery` | `(signalId) → Promise<void>` | 推送给所有用户 |
| `processNewsOnly` | `(newsItemId, analysis) → Promise<void>` | 低置信度纯资讯推送 |

**接入方式：** 每个函数对应一个 agent step，可由 Orchestrator 按需编排：
```
AnalysisAgent.run(newsItemId)
  → if signal: SignalAgent.run(newsItemId, analysis) → DeliveryAgent.run(signalId)
  → else:      NewsOnlyAgent.run(newsItemId, analysis)
```

---

#### 6. Discord 通知
**文件：** `src/services/discord/bot.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `sendSignalToUser` | `(userId, message) → Promise<{messageId, channelId} \| null>` | DM 推送 |
| `editMessage` | `(channelId, messageId, content) → Promise<void>` | 编辑已发消息 |

**接入方式：** 注册为 notify tool，OrderAgent 下单成功/失败后回调。

---

#### 9. Order 流水线步骤（已完整拆分）
**文件目录：** `src/queues/steps/`

| 函数 | 签名 | 说明 |
|---|---|---|
| `stepValidateDelivery` | `(deliveryId) → Promise<{delivery, signal, user}>` | 验证 delivery/signal/user，失败抛出 |
| `stepPreOrderRisk` | `(user, signal, delivery) → Promise<{liveSnapshot, riskCheck}>` | 拉取持仓 + 风控，blocked 时通知用户并抛出 |
| `stepExecuteOrder` | `(user, signal, delivery, liveSnapshot, riskCheck) → Promise<void>` | 下单 + 重试 + 通知 |
| `notifyOrderRetry` | `(delivery, orderId, retryCount, maxRetries, reason?) → Promise<void>` | 重试通知 |
| `notifyOrderSucceeded` | `(delivery, orderId, status, executedPrice?, deepLink?) → Promise<void>` | 成功通知 |
| `notifyOrderFailed` | `(delivery, orderId, failureType?, reason?) → Promise<void>` | 失败通知 |

所有函数均从 `order-queue.ts` 统一 re-export：
```typescript
import { stepValidateDelivery, stepPreOrderRisk, stepExecuteOrder } from './queues/order-queue';
```

**接入方式：** 每个函数对应 agent 一个 step，Orchestrator 可跳过 BullMQ 直接调用。

---

#### 10. Discord 交互业务层（已完整拆分）
**文件：** `src/queues/steps/order-interact.ts`

| 函数 | 签名 | 返回类型 |
|---|---|---|
| `stepConfirmOrder` | `(deliveryId, orderToken, overrideWarning) → Promise<ConfirmOrderResult>` | `queued \| not_found \| wrong_status \| token_mismatch` |
| `stepIgnoreDelivery` | `(deliveryId) → Promise<IgnoreDeliveryResult>` | `ok \| not_found` |
| `stepAbandonDelivery` | `(deliveryId) → Promise<AbandonDeliveryResult>` | `ok \| not_found` |
| `stepAdjustAndConfirm` | `(deliveryId, orderToken, positionPctInput: unknown) → Promise<AdjustAndConfirmResult>` | `queued \| validation_error \| not_found \| wrong_status \| token_mismatch` |
| `stepGetCopyTradeInfo` | `(deliveryId) → Promise<CopyTradeResult>` | `ok{payload} \| not_found` |

**设计亮点：**
- 全部返回 discriminated union，agent 通过 `switch result.kind` 处理所有业务路径，无需 try/catch
- `positionPctInput: unknown` — 同时接受字符串（Discord Modal）或数字（API 调用），内部归一化并验证范围（1-20）
- 无 discord.js 依赖，纯业务层，可在非 Discord 环境中直接调用
- 同样从 `order-queue.ts` re-export

**接入方式：**
```typescript
import { stepConfirmOrder, stepAdjustAndConfirm, type ConfirmOrderResult } from './queues/order-queue';

// agent 处理确认下单
const result = await stepConfirmOrder(deliveryId, orderToken, false);
switch (result.kind) {
  case 'queued':        /* 已入队，继续等待 */ break;
  case 'not_found':     /* delivery 不存在 */ break;
  case 'wrong_status':  /* 状态不对，当前 result.currentStatus */ break;
  case 'token_mismatch': /* token 不匹配 */ break;
}
```

---

### ⚡ 需少量改造后可接入

#### 7. 资讯抓取调度
**文件：** `src/services/scheduler/news-fetcher.ts`

| 函数 | 签名 | 说明 |
|---|---|---|
| `runUSStockFetch` | `() → Promise<void>` | 命令式触发美股抓取（已含市场开闭检查） |
| `runHKStockFetch` | `() → Promise<void>` | 港股 |
| `runAStockFetch` | `() → Promise<void>` | A股 |
| `runBTCFetch` | `() → Promise<void>` | BTC（无时间限制） |

**当前状态：** 函数已导出，可直接调用。
**改造点：** 函数目前将所有结果推入 BullMQ，如果 OpenClaw 需要拿到抓取的资讯列表（而非通过队列异步处理），需要提取一个返回 `NewsItem[]` 的版本：

```typescript
// 建议增加的纯抓取函数（不写库、不入队）
export async function fetchUSStockNewsRaw(): Promise<NewsItem[]>
```

---

#### 8. 资讯适配器（MCP/Skill 接入口）
**文件：** `src/services/news/adapters/base.ts`

| 适配器类型 | 状态 | 说明 |
|---|---|---|
| `APINewsAdapter` | ✅ 可用 | REST API 拉取资讯 |
| `MCPNewsAdapter` | ✅ 已实现 | 通过 `mcp.ts` 的 `callMCP()` 调用 MCP server |
| `SkillNewsAdapter` | ✅ 已实现 | POST 调用 skill 服务端点 |
| `CustomNewsAdapter` | ✅ 可用 | 注入自定义函数 |

**OpenClaw 作为 MCP server 接入方式：**
```typescript
// 在 NewsService 配置中注册 OpenClaw 的 MCP server
const adapter = NewsAdapterFactory.create('mcp', {
  server: 'http://openclaw-mcp-server:8080',
  tool: 'fetch_news',
  timeout: 30000,
});
NewsAdapterFactory.register('openclaw-news', adapter);
```

**MCP 调用格式（`mcp.ts`）：**
```
POST {server}/tools/{tool}
Body: { arguments: NewsFetchParams }
```

---

---

## 三、AI Provider 接口（OpenClaw 使用 Claude 时）

**文件：** `src/services/ai/base.ts`

`AIProvider` 接口标准化了所有 AI 调用，OpenClaw 可以直接复用：

```typescript
export interface AIProvider {
  sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse>;
  getProviderName(): string;
  estimateCost(inputTokens: number, outputTokens: number): number;
}
```

**支持的 Provider：** `anthropic` | `openai` | `azure` | `custom`（兼容 OpenAI 格式）

通过 `AIProviderFactory.create(provider, apiKey, baseUrl, model)` 创建实例，OpenClaw 可将同一实例注入到 AnalysisAgent 中。

---

## 四、REST API（供 OpenClaw Orchestrator 远程调用）

所有端点 base URL：`http://localhost:3000/api`

| 端点 | 认证 | 用途 |
|---|---|---|
| `GET /health` | 无 | 健康检查 |
| `GET /admin/dashboard/stats` | Admin JWT | 系统聚合统计 |
| `GET /admin/dashboard/news` | Admin JWT | 最近资讯列表 |
| `GET /admin/dashboard/signals` | Admin JWT | 最近信号列表 |
| `GET /admin/orders` | Admin JWT | 所有订单 |
| `GET /admin/costs` | Admin JWT | AI 成本统计 |
| `GET /users/:userId/signals` | 无 | 用户信号历史 |
| `GET /users/:userId/orders` | 无 | 用户订单历史 |

**获取 Admin JWT：**
```bash
POST /api/admin/token
Body: { "discordUserId": "<ADMIN_DISCORD_USER_ID>" }
```

---

## 五、优先接入顺序建议

```
第一批（零改造，全部就绪）：
  checkRisk → executeFutuOrder → getAccountSnapshot
  analyzeNewsItem → generateSignal
  stepValidateDelivery → stepPreOrderRisk → stepExecuteOrder（order-queue steps）
  stepConfirmOrder → stepIgnoreDelivery → stepAbandonDelivery
  stepAdjustAndConfirm → stepGetCopyTradeInfo（order-interact）

第二批（少量适配）：
  processAnalysis → processSignal → processDelivery（流水线编排）
  runUSStockFetch 等（需要 raw 版本返回 NewsItem[]，当前只入队）

MCP server 接入口（已就绪）：
  MCPNewsAdapter → callMCP() → 配置 openclaw-mcp-server 地址即可
```
