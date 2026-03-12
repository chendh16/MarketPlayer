# OpenClaw 快速参考卡

MarketPlayer MCP 工具快速查询手册

---

## 🚀 快速启动

```bash
# 1. 启动服务
docker-compose up -d
# 或
npm run dev

# 2. 验证 MCP Server
curl http://localhost:3001/health

# 3. 运行测试
npm run test:openclaw
```

---

## 📋 工具速查表

### 资讯层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `fetch_news` | 拉取资讯 | market, limit |
| `process_pipeline` | 完整流水线 | market |

**示例**:
```bash
# openclaw
/fetch-news market=us limit=5

# curl
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"market":"us","limit":5}'
```

### AI 分析层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `analyze_news` | AI 分析 | newsItemId |
| `generate_signal` | 生成信号 | newsItemId |

**示例**:
```bash
# openclaw
/analyze-news <newsItemId>

# curl
curl -X POST http://localhost:3001/tools/analyze_news \
  -H "Content-Type: application/json" \
  -d '{"newsItemId":"<uuid>"}'
```

### 风控层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `check_risk` | 风控检查 | userId, symbol, market, direction, positionPct |

**示例**:
```bash
# openclaw
/check-risk userId=<uuid> symbol=AAPL market=us direction=long positionPct=5

# curl
curl -X POST http://localhost:3001/tools/check_risk \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","symbol":"AAPL","market":"us","direction":"long","positionPct":5}'
```

### 账户/持仓层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `get_broker_balance` | 查询余额 | broker |
| `get_positions` | 查询持仓 | userId, broker? |
| `get_account` | 账户概况 | userId, broker? |

**示例**:
```bash
# openclaw
/get-balance broker=longbridge
/get-positions userId=<uuid>

# curl
curl -X POST http://localhost:3001/tools/get_broker_balance \
  -H "Content-Type: application/json" \
  -d '{"broker":"longbridge"}'
```

### 订单层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `get_deliveries` | 推送记录 | userId?, status?, limit? |
| `get_delivery` | 推送详情 | deliveryId |
| `confirm_order` | 确认下单 | deliveryId, orderToken |

**示例**:
```bash
# openclaw
/get-deliveries status=pending limit=10
/confirm-order deliveryId=<uuid> orderToken=<token>

# curl
curl -X POST http://localhost:3001/tools/get_deliveries \
  -H "Content-Type: application/json" \
  -d '{"status":"pending","limit":10}'
```

### 执行层

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `execute_longbridge_order` | 长桥下单 | userId, symbol, market, direction, quantity |
| `cancel_longbridge_order` | 取消订单 | userId, brokerOrderId |

**示例**:
```bash
# openclaw
/execute-order userId=<uuid> symbol=AAPL market=us direction=buy quantity=100

# curl
curl -X POST http://localhost:3001/tools/execute_longbridge_order \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","symbol":"AAPL","market":"us","direction":"buy","quantity":100}'
```

---

## 🔄 常用工作流

### 流程 1: 完整交易链路

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

### 流程 2: Agent 主动分析

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

### 流程 3: 快速状态探测

```
1. /get-balance broker=longbridge
   → 账户总览

2. /get-positions userId=<uuid>
   → 持仓明细

3. /get-deliveries status=pending
   → 待处理信号
```

---

## 🎯 市场代码

| 市场 | 代码 | 示例标的 |
|------|------|---------|
| 美股 | `us` | AAPL, TSLA, NVDA |
| 港股 | `hk` | 700.HK, 9988.HK |
| A股 | `a` | 600519, 000001 |
| BTC | `btc` | BTC |

---

## 🔧 故障排查

### MCP Server 无法连接

```bash
# 检查服务状态
curl http://localhost:3001/health

# 检查端口占用
lsof -i :3001

# 查看日志
docker logs marketplayer-app-1
```

### 工具调用失败

```bash
# 列出所有工具
curl http://localhost:3001/tools

# 测试单个工具
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"market":"us","limit":1}'
```

### 需要有效 ID

某些工具需要有效的数据库 ID：
- `analyze_news` / `generate_signal` → 需要 newsItemId
- `check_risk` / `get_positions` / `get_account` → 需要 userId
- `get_delivery` / `confirm_order` → 需要 deliveryId

**解决方案**:
1. 先运行 `/run-pipeline` 创建资讯
2. 使用 Discord Bot 创建用户
3. 或通过 API 创建测试数据

---

## 📊 性能参考

| 工具 | 平均响应时间 |
|------|-------------|
| `fetch_news` | 4-7ms |
| `process_pipeline` | 2ms |
| `get_broker_balance` | 1ms |
| `get_positions` | 2-3ms |
| `get_account` | 1ms |
| `get_deliveries` | 2-9ms |
| `confirm_order` | 1-2ms |

---

## 🔗 相关文档

- [OPENCLAW_GUIDE.md](OPENCLAW_GUIDE.md) - 完整集成指南
- [OPENCLAW_CHECKLIST.md](OPENCLAW_CHECKLIST.md) - 兼容性检查清单
- [dev-docs/11-OPENCLAW-SETUP.md](dev-docs/11-OPENCLAW-SETUP.md) - 开发者设置
- [README.md](README.md) - 项目总览

---

## 💡 提示

1. **使用缓存**: `get_positions` 默认有 60 秒缓存，下单前使用 `forceRefresh=true`
2. **批量操作**: 可以并行调用多个工具提升效率
3. **错误处理**: 所有工具都返回统一的错误格式 `{ error: string }`
4. **日志查看**: 所有调用都会记录日志，便于调试

---

**快速开始**: `npm run test:openclaw` 验证环境后即可使用！
