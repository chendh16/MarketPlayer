MarketPlayer 技能索引 — openclaw 可调用的全部能力

MCP 服务器地址：http://localhost:{MCP_SERVER_PORT}（默认 3001）
健康检查：GET /health

---

## 资讯层

| 技能 | 斜杠命令 | MCP 工具 | 说明 |
|------|----------|----------|------|
| 拉取资讯 | `/fetch-news` | `fetch_news` | 从指定市场拉取最新资讯，不写库 |
| 触发流水线 | `/run-pipeline` | `process_pipeline` | 完整流程：抓取→过滤→写库→入队→AI分析→Discord推送 |

市场代码：us（美股）| hk（港股）| a（A股）| btc（比特币）

---

## AI 分析层

| 技能 | 斜杠命令 | MCP 工具 | 说明 |
|------|----------|----------|------|
| AI分析资讯 | `/analyze-news` | `analyze_news` | 摘要+情绪+重要性分析，结果写库 |
| 生成信号 | `/generate-signal` | `generate_signal` | 生成交易参考信号（需先分析），置信度<40不生成 |

调用顺序：fetch_news（写库）→ analyze_news → generate_signal

---

## 风控层

| 技能 | 斜杠命令 | MCP 工具 | 说明 |
|------|----------|----------|------|
| 风控检查 | `/check-risk` | `check_risk` | 检查持仓上限、总仓位，返回 pass/warning/blocked |

---

## 账户/持仓层

| 技能 | 斜杠命令 | MCP 工具 | 说明 |
|------|----------|----------|------|
| 查余额（快捷） | `/get-balance` | `get_broker_balance` | 直接查券商余额，无需userId，适合状态探测 |
| 查账户概况 | `/get-account` | `get_account` | 总资产/现金/持仓比，按userId查询 |
| 查持仓明细 | `/get-positions` | `get_positions` | 完整持仓列表，含手动持仓，有Redis缓存 |

券商：longbridge（长桥，已验证）| futu（富途，需OpenD+OpenAPI权限）

---

## 下单层

| 技能 | 斜杠命令 | MCP 工具 | 说明 |
|------|----------|----------|------|
| 查推送记录 | `/get-deliveries` | `get_deliveries` | 查 signal_deliveries，可按用户/状态过滤 |
| 查单条推送 | 直接调MCP | `get_delivery` | 查单条推送详情（含orderToken） |
| 确认下单 | `/confirm-order` | `confirm_order` | 确认下单，入BullMQ队列，支持overrideWarning |

下单模式（每个券商独立配置）：
- Mode A：全自动（富途需OpenAPI权限，长桥需交易权限）
- Mode B：生成深链接，跳转App手动确认（当前默认）
- Mode C：纯通知，不执行下单

---

---

## 研究分析层

| 技能 | 斜杠命令 | 核心数据源 | 结合现有工具 |
|------|----------|-----------|------------|
| 宏观自上而下分析 | `/macro-analysis` | FRED、Fed、ECB、BLS | — |
| 内部人士买入检测 | `/insider-trades` | OpenInsider、SEC Form 4 | — |
| 空头挤压筛选 | `/short-squeeze` | Finviz、Shortquote、MarketBeat | — |
| 并购雷达 | `/ma-radar` | Bloomberg、Reuters、SEC 13D/13G | — |
| 情绪vs基本面套利 | `/sentiment-divergence` | Web + Macrotrends | fetch_news + analyze_news |
| 危机关联性地图 | `/correlation-map` | TradingView、Macrotrends、FRED | — |
| 分红危险雷达 | `/dividend-danger` | Seeking Alpha、Dividend.com | — |
| 机构持仓分析 | `/institutional-holdings` | WhaleWisdom、Dataroma、SEC 13F | — |
| 投资组合对冲 | `/portfolio-hedge` | ETF.com、CBOE VIX、Options数据 | get_positions + check_risk |
| 每周量化简报 | `/weekly-briefing` | Investing.com、Earnings Whispers、EPFR | fetch_news + get_positions |

注意：研究层工具均通过 openclaw 的 web search 能力执行，不调用本地 MCP server。
其中 sentiment-divergence、portfolio-hedge、weekly-briefing 会混合调用本地 MCP 工具。

---

## 典型 Agent 编排流程

```
1. /fetch-news market=hk              → 拉取港股资讯
2. 选取感兴趣的 newsItemId
3. /analyze-news <newsItemId>          → AI分析
4. /generate-signal <newsItemId>       → 生成信号（若 generated=true）
5. /check-risk userId symbol direction positionPct  → 风控检查
6. 若 level=pass，通知用户查看 Discord
7. 用户点击确认 → /confirm-order deliveryId orderToken
```
