# openclaw 配置指南 — 通过 Skill 调用 MarketPlayer

## 概述

openclaw 指运行在本地或服务器上的 **Claude Code CLI**。它通过读取 `.claude/commands/` 目录下的 `.md` 文件作为 Skill（斜杠命令），在对话中按需调用 MarketPlayer 的各个功能模块。

调用链：

```
用户指令 → openclaw (Claude Code) → /skill 命令 → HTTP POST → MCP Server (3001) → 业务逻辑
```

---

## 第一步：启动后端服务

Skill 依赖 MCP Server 运行，必须先把后端跑起来。

### 方式 A：Docker Compose（推荐）

```bash
# 复制并填写环境变量
cp .env.example .env
# 编辑 .env，至少填写以下必填项（见第二步）

docker-compose up -d
```

验证服务是否就绪：

```bash
# API Server
curl http://localhost:3000/health

# MCP Server
curl http://localhost:3001/health
```

两个接口都返回 `{"status":"ok"}` 表示成功。

### 方式 B：本地开发模式

```bash
npm install
cp .env.example .env  # 填写环境变量

npm run migrate       # 初始化数据库
npm run dev           # 启动主服务 + MCP server
```

---

## 第二步：配置环境变量

`.env` 中必须填写以下变量，MCP Skill 才能正常工作：

### 必填（服务无法启动）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，如 `postgresql://user:pass@localhost:5432/trading_bot` |
| `REDIS_URL` | Redis 连接串，如 `redis://localhost:6379` |
| `DISCORD_BOT_TOKEN` | Discord Bot Token |
| `DISCORD_CLIENT_ID` | Discord 应用 Client ID |
| `AI_API_KEY` | AI 提供商 API Key（Anthropic / OpenAI / 兼容接口均可） |
| `ENCRYPTION_KEY` | 64位 hex 字符串（32字节），用于加密存储 |
| `ENCRYPTION_IV` | 32位 hex 字符串（16字节） |
| `JWT_SECRET` | 最少32位字符，用于 API 认证 |
| `MCP_SERVER_PORT` | MCP 服务端口，**必须设置才会启动**，建议填 `3001` |

生成加密密钥的方法：

```bash
node scripts/generate-keys.js
```

### 按需填写（影响具体 Skill）

| 变量 | 影响的 Skill |
|------|-------------|
| `LONGPORT_APP_KEY` / `LONGPORT_APP_SECRET` / `LONGPORT_ACCESS_TOKEN` | 所有长桥相关 Skill |
| `LONGBRIDGE_ORDER_MODE` | `execute-order`（A=自动 / B=深链接 / C=纯通知） |
| `ALPHA_VANTAGE_API_KEY` | `fetch-news market=us` |
| `AI_PROVIDER` / `AI_MODEL` | `analyze-news`、`generate-signal`、`run-pipeline` |
| `PREFERRED_BROKER` | `get-balance`、`get-positions`、`check-risk` 的默认券商 |

---

## 第三步：配置 openclaw

openclaw 读取 `.claude/commands/` 目录下的文件作为 Skill。本项目已内置全部命令文件，克隆代码后**无需额外配置**。

验证 Skill 是否加载成功：在 Claude Code 对话中输入 `/skills`，应看到完整的 MarketPlayer 技能索引表。

如果在其他目录使用 openclaw，需要把 `.claude/` 目录复制过去，或者在 `~/.claude/commands/` 下建立软链：

```bash
# 软链方式（全局可用）
ln -s /path/to/MarketPlayer/.claude/commands ~/.claude/commands/marketplayer
```

---

## 可用 Skill 列表

### 资讯层

| 斜杠命令 | 说明 | 最小参数 |
|----------|------|---------|
| `/fetch-news` | 拉取市场资讯（只读，不写库） | `market=us\|hk\|a\|btc` |
| `/run-pipeline` | 触发完整资讯流水线（抓取→分析→Discord推送） | `market=us\|hk\|a\|btc` |

```
/fetch-news market=hk limit=10
/run-pipeline market=us
```

### AI 分析层

| 斜杠命令 | 说明 | 最小参数 |
|----------|------|---------|
| `/analyze-news` | 对已入库资讯做 AI 摘要+情绪分析 | `newsItemId=<uuid>` |
| `/generate-signal` | 基于分析结果生成交易信号 | `newsItemId=<uuid>` |

```
/analyze-news <newsItemId>
/generate-signal <newsItemId>
```

> 注意：必须先用 `/run-pipeline` 或 `fetch_news`（写库模式）把资讯存入数据库，`newsItemId` 才有效。

### 风控层

| 斜杠命令 | 说明 | 最小参数 |
|----------|------|---------|
| `/check-risk` | 检查持仓上限、总仓位，返回 pass/warning/blocked | `userId symbol market direction positionPct` |

```
/check-risk userId=<uuid> symbol=AAPL market=us direction=long positionPct=5
```

### 账户 / 持仓层

| 斜杠命令 | 说明 | 最小参数 |
|----------|------|---------|
| `/get-balance` | 快速查询券商账户余额（无需 userId） | `broker=longbridge\|futu` |
| `/get-account` | 查询账户总资产/现金/持仓比 | `userId=<uuid>` |
| `/get-positions` | 完整持仓列表（含手动持仓，带缓存） | `userId=<uuid>` |

```
/get-balance broker=longbridge
/get-account userId=<uuid>
/get-positions userId=<uuid> broker=longbridge
```

### 下单层

| 斜杠命令 | 说明 | 最小参数 |
|----------|------|---------|
| `/get-deliveries` | 查询信号推送记录列表 | 可选 `userId status limit` |
| `/get-delivery` | 查单条推送详情（含 orderToken） | 直接调 MCP |
| `/confirm-order` | 确认下单（走 BullMQ 队列） | `deliveryId orderToken` |
| `/execute-order` | Agent 直接下单（绕过信号流程） | `userId symbol market direction quantity` |
| `/cancel-order` | 取消长桥已提交订单 | `orderId` |

```
/get-deliveries status=pending limit=10
/confirm-order deliveryId=<uuid> orderToken=<token>
/execute-order userId=<uuid> symbol=700 market=hk direction=buy quantity=100
```

### 研究分析层（不依赖 MCP Server，使用 web search）

| 斜杠命令 | 说明 |
|----------|------|
| `/macro-analysis` | 宏观自上而下分析（FRED、Fed、ECB） |
| `/insider-trades` | 内部人士买入检测（SEC Form 4） |
| `/short-squeeze` | 空头挤压筛选 |
| `/ma-radar` | 并购目标雷达 |
| `/sentiment-divergence` | 情绪vs基本面套利（混合调用 MCP） |
| `/correlation-map` | 跨资产关联性分析 |
| `/dividend-danger` | 分红危险雷达 |
| `/institutional-holdings` | 机构13F持仓追踪 |
| `/portfolio-hedge` | 持仓对冲方案（混合调用 MCP） |
| `/weekly-briefing` | 每周量化简报（混合调用 MCP） |

研究层 Skill 不需要 MCP Server 运行，只需 openclaw 有联网权限。

---

## 典型工作流

### 流程一：资讯→信号→下单（完整链路）

```
1. /run-pipeline market=hk          → 触发港股流水线，AI分析后推送到 Discord
2. /get-deliveries status=pending   → 查看待确认信号
3. /check-risk userId=xxx symbol=700.HK market=hk direction=long positionPct=8
   → 确认风控通过
4. /confirm-order deliveryId=xxx orderToken=xxx
   → 入队下单（Mode B 返回长桥深链接）
```

### 流程二：Agent 主动分析并直接下单

```
1. /fetch-news market=us            → 拉取美股资讯（返回 newsItemId）
2. /analyze-news <newsItemId>       → AI 分析摘要+情绪
3. /generate-signal <newsItemId>    → 生成交易信号（confidence >= 40 才生成）
4. /check-risk ...                  → 风控检查
5. /execute-order ...               → 直接下单（绕过 Discord 确认流程）
```

### 流程三：快速状态探测

```
/get-balance broker=longbridge      → 账户总览
/get-positions userId=xxx           → 持仓明细
/macro-analysis                     → 当前宏观环境评估
```

---

## 故障排查

### Skill 调用返回 connection refused

MCP Server 没启动。检查：
1. `.env` 中 `MCP_SERVER_PORT=3001` 是否已设置
2. `curl http://localhost:3001/health` 是否返回 `{"status":"ok"}`
3. Docker 模式下确认 3001 端口已映射

### newsItemId not found

资讯未写入数据库。`/fetch-news` 是只读预览，`/run-pipeline` 或调用 `process_pipeline` 工具才会写库。

### Risk check blocked

持仓超限。通过 `/get-positions` 查看当前仓位，或调低 `positionPct` 参数后重试。

### 长桥下单返回 deepLink 而非自动下单

`LONGBRIDGE_ORDER_MODE=B`（默认）。改为 `A` 并确保账户有长桥交易权限才能全自动下单。

---

## MCP Server 接口参考

所有 Skill 底层均调用 MCP Server HTTP 接口，可以直接 curl 调试：

```bash
# 列出所有可用工具
curl http://localhost:3001/tools

# 直接调用工具（与 Skill 等价）
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"market":"us","limit":5}'
```

可用工具：`fetch_news` / `process_pipeline` / `analyze_news` / `generate_signal` / `check_risk` / `get_positions` / `get_account` / `get_broker_balance` / `get_deliveries` / `get_delivery` / `confirm_order` / `execute_longbridge_order` / `cancel_longbridge_order`
