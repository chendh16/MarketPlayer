# 资讯数据源文档

## 概述

所有数据源均为**定时主动拉取（Pull）**，由调度器触发，无 Webhook/Push 机制。

按获取机制分为三类：

- **类型 A — REST JSON API**：系统 HTTP GET，服务端返回结构化 JSON
- **类型 B — RSS/XML Feed**：系统 HTTP GET，服务端返回 XML，本地正则解析 `<item>` 块
- **类型 C — Skill / MCP 委托**：通过 `NEWS_ADAPTERS` 配置，将资讯拉取委托给另一个 openclaw 实例或 MCP Server（`SkillNewsAdapter` / `MCPNewsAdapter`）

---

## 实际调用链

```
Cron (每5分钟) / MCP process_pipeline（手动触发）
  ↓
runXxxFetch()  →  fetchXxxNewsRaw()
  ↓
newsService.fetchNews({ market })
  ↓  按 priority 遍历该市场注册的 adapters，第一个成功即返回
  ├── [外部 adapter，priority ≤ 10，需手动配置 NEWS_ADAPTERS]
  │     type=skill → SkillNewsAdapter → HTTP POST {skillEndpoint}（委托给 openclaw）
  │     type=mcp   → MCPNewsAdapter  → HTTP POST {server}/tools/{tool}（委托给另一 MarketPlayer）
  │     type=api   → APINewsAdapter  → HTTP POST {endpoint}（第三方 REST API）
  │
  ├── [MCP_NEWS_SERVER，priority=50，设置后自动注册]
  │     mcp-news-source → MCPNewsAdapter → HTTP POST {MCP_NEWS_SERVER}/tools/{MCP_NEWS_TOOL}
  │     覆盖全部4个市场；内置 source 作为兜底
  │
  └── [内置 adapter，priority=100，始终注册]（custom 类型，包装内置 source 函数）
        us-stock-builtin → fetchUSStockNews()
          ├── 有 ALPHA_VANTAGE_API_KEY → Alpha Vantage API        ← 类型 A
          └── 无 key                  → Yahoo Finance RSS         ← 类型 B（内部降级）
        hk-stock-builtin → fetchHKStockNews()
          └── 始终                    → Yahoo Finance RSS         ← 类型 B（唯一来源）
        a-stock-builtin  → fetchAStockNews()
          ├── 成功                    → 东方财富 DataCenter API   ← 类型 A
          └── 失败                    → 东方财富 globalbao API    ← 类型 A（内部降级）
        btc-builtin      → fetchBTCNews()
          ├── 成功                    → CoinGecko API             ← 类型 A
          └── 失败                    → CoinDesk RSS              ← 类型 B（内部降级）
```

### 关键结论

**优先级顺序（三层）：**

```
NEWS_ADAPTERS (priority 1-10)  →  MCP_NEWS_SERVER (priority 50)  →  内置 source (priority 100)
```

**`MCP_NEWS_SERVER` 是最简单的 MCP 接入方式。** 设置该变量后自动注册，无需手动写 `NEWS_ADAPTERS` JSON，适合接入另一个 MarketPlayer 实例。

**`NEWS_ADAPTERS` 用于更复杂的场景**，支持 `api`/`skill`/`mcp` 三种类型、多市场分别配置、设置 priority。

**Skill adapter 从不自动触发**，只有在 `NEWS_ADAPTERS` 里配置了 `type: "skill"` 才生效。

**RSS（类型 B）的触发发生在 source 函数内部，不是 adapter 层面的 fallback。** newsService 只负责按 priority 选 adapter，RSS 降级逻辑封装在各 `fetchXxxNews()` 函数里。

**Fallback 分两层，职责不同：**

| 层级 | 位置 | 降级单位 | 触发条件 |
|------|------|----------|----------|
| Adapter 层 | `newsService.fetchNews()` | 整个 adapter | 当前 adapter 抛错，尝试下一个 |
| Source 层 | 各 `fetchXxxNews()` 内部 | 单个 API/RSS | 主 URL 请求失败或返回异常格式 |

---

## 汇总对比表

| 市场 | 主源类型 | 主源名称 | 需要 Key | Fallback 类型 | Fallback 名称 | 条数上限 | Symbols 方式 |
|------|----------|----------|----------|---------------|---------------|----------|--------------|
| US | API | Alpha Vantage NEWS_SENTIMENT | 是（`ALPHA_VANTAGE_API_KEY`） | RSS | Yahoo Finance | 20 | env 配置 |
| HK | RSS | Yahoo Finance | 否 | 无 | — | 30 | env 配置 |
| A股 | API | 东方财富 DataCenter | 否（UA 伪装） | API | 东方财富 globalbao | 30 | 正则提取 |
| BTC | API | CoinGecko | 可选（`COINGECKO_API_KEY`） | RSS | CoinDesk | 10 | 硬编码 |

---

## 按获取方式分类

### 类型 A — REST JSON API

| 数据源 | 市场 | 角色 | 认证方式 |
|--------|------|------|----------|
| Alpha Vantage NEWS_SENTIMENT | US | 主源 | `ALPHA_VANTAGE_API_KEY`（query param） |
| CoinGecko News API | BTC | 主源 | `COINGECKO_API_KEY`（header `x-cg-demo-api-key`，可选） |
| 东方财富 DataCenter API | A股 | 主源 | 无需，携带浏览器 UA + Referer |
| 东方财富 globalbao API | A股 | fallback | 无需 |

### 类型 B — RSS/XML Feed

| 数据源 | 市场 | 角色 | 说明 |
|--------|------|------|------|
| Yahoo Finance RSS | US | fallback | 无 Alpha Vantage key 时自动降级 |
| Yahoo Finance RSS | HK | 唯一来源 | HK 无 JSON API，始终走此路径 |
| CoinDesk RSS | BTC | fallback | CoinGecko 失败时自动降级 |

### 类型 C — MCP / Skill 委托

MCP 接入有两种方式：

**方式一：`MCP_NEWS_SERVER` 环境变量（推荐，零配置）**

设置即生效，自动注册 `mcp-news-source`（priority=50），覆盖全部4个市场：

```bash
MCP_NEWS_SERVER=http://other-marketplayer:3001
MCP_NEWS_TOOL=fetch_news   # 可选，默认即为 fetch_news
```

**方式二：`NEWS_ADAPTERS` 配置（灵活，支持按市场分配）**

| Adapter 类型 | 实现类 | 调用协议 | 适用场景 |
|-------------|--------|----------|----------|
| `mcp` | `MCPNewsAdapter` | HTTP POST `{server}/tools/{tool}` | 调用另一个 MarketPlayer MCP Server |
| `skill` | `SkillNewsAdapter` | HTTP POST `{skillEndpoint}` | 委托给另一个 openclaw 实例的 Skill 端点 |

- 内置 adapter（priority=100）、`MCP_NEWS_SERVER`（priority=50），`NEWS_ADAPTERS` 设 `priority ≤ 10` 可覆盖两者
- 所有 4 种类型（`api`、`skill`、`mcp`、`custom`）均由 `NewsAdapterFactory.create()` 统一创建（`src/services/news/adapters/base.ts`）

---

## 按市场详情

### 美股（US）

**源文件：** `src/services/news/sources/us-stock.ts`
**入口函数：** `fetchUSStockNews()`

#### 主路径：Alpha Vantage NEWS_SENTIMENT（API）

- **条件：** `ALPHA_VANTAGE_API_KEY` 存在
- **URL：**
  ```
  https://www.alphavantage.co/query
    ?function=NEWS_SENTIMENT
    &tickers={symbols逗号分隔}
    &time_from={2小时前，格式 YYYYMMDDTHHMM}
    &limit=20
    &apikey={key}
  ```
- **响应：** JSON，主数据在 `feed[]`
- **Rate limit 检测：** 响应含 `data.Information` 字段时跳过（返回空数组）
- **过滤：** `ticker_sentiment[].relevance_score > 0.3`
- **上限：** 20 条

#### Fallback：Yahoo Finance RSS（RSS）

- **条件：** 无 API key（`fetchUSStockNewsViaYahoo()`）
- **URL（每个 symbol 各一条请求）：**
  ```
  https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US
  ```
- **并发：** `Promise.allSettled()` 对所有 symbols 同时请求
- **解析：** 正则提取 `<item>` 块，URL 去重
- **上限：** 20 条

**Symbols 来源：** `config.NEWS_SYMBOLS_US`（env: `NEWS_SYMBOLS_US`，逗号分隔）

---

### 港股（HK）

**源文件：** `src/services/news/sources/hk-stock.ts`
**入口函数：** `fetchHKStockNews()`

#### 唯一来源：Yahoo Finance RSS（RSS）

- **条件：** 始终启用，无 JSON API 替代
- **URL（每个 symbol 各一条请求）：**
  ```
  https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=HK&lang=zh-Hant-HK
  ```
- **并发：** `Promise.allSettled()` 对所有 symbols 同时请求
- **解析：** 正则提取 `<item>` 块，按 URL 去重
- **上限：** 30 条

**Symbols 来源：** `config.NEWS_SYMBOLS_HK`（env: `NEWS_SYMBOLS_HK`，逗号分隔）

---

### A股（A）

**源文件：** `src/services/news/sources/a-stock.ts`
**入口函数：** `fetchAStockNews()`

#### 主路径：东方财富 DataCenter API（API）

- **URL：**
  ```
  https://datacenter-web.eastmoney.com/api/data/v1/get
    ?reportName=RPT_KUAIBAO_NEWS
    &columns=ALL
    &filter=(MARK%3D%221%22)
    &pageNumber=1&pageSize=30
    &sortTypes=-1&sortColumns=ACTIVE_TIME
    &source=WEB&client=WEB
  ```
- **认证：** 无需 key，携带浏览器 UA + `Referer: https://www.eastmoney.com/`
- **防护检测：** 响应以 `<` 开头则判断为 HTML 拦截页，抛错自动转 fallback
- **响应结构：** `result.data[]`，字段 `TITLE`、`ACTIVE_TIME`、`SECURITY_CODE`

#### Fallback：东方财富 globalbao API（API）

- **条件：** DataCenter 请求失败时自动触发
- **URL：**
  ```
  https://gblobapi.eastmoney.com/Information/NewFlash/GetInformationList
    ?client=WAP&type=1&IsGlobalNews=0&count=30
  ```
- **认证：** 无需 key

**Symbols 提取：** 无需预配置，正则 `/\b[036]\d{5}\b/g` 从标题中自动提取
（0 开头 = 深市，3 开头 = 创业板，6 开头 = 沪市）

---

### BTC

**源文件：** `src/services/news/sources/btc.ts`
**入口函数：** `fetchBTCNews()`

#### 主路径：CoinGecko News API（API）

- **URL：**
  ```
  https://api.coingecko.com/api/v3/news?page=1
  ```
- **认证：** 可选；有 key 时 header 加 `x-cg-demo-api-key: {COINGECKO_API_KEY}`；无 key 也可请求，但频率限制更严
- **上限：** 10 条

#### Fallback：CoinDesk RSS（RSS）

- **条件：** CoinGecko 请求失败时自动触发（`fetchBTCNewsFallback()`）
- **URL：**
  ```
  https://www.coindesk.com/arc/outboundfeeds/rss/
  ```
- **解析：** 正则提取 `<item>` 块
- **上限：** 10 条

**Symbols：** 硬编码 `['BTC']`

---

## Adapter 接入方式

### 方式一：`MCP_NEWS_SERVER`（最简，零配置 MCP）

在 `.env` 中设置：

```bash
MCP_NEWS_SERVER=http://other-marketplayer:3001
MCP_NEWS_TOOL=fetch_news   # 可选，默认即为 fetch_news
```

效果：自动注册 `mcp-news-source`（priority=50），覆盖全部4个市场，调用远端 `fetch_news` 工具。内置 source（priority=100）继续作为兜底。

> MCP Server 本身的启动：设置 `MCP_SERVER_PORT=3001` 后随主服务自动启动（`src/index.ts:61-65`），也可独立运行 `src/mcp/server.ts`。

---

### 方式二：`NEWS_ADAPTERS`（灵活，支持按市场/优先级分配）

注入 JSON 数组，`priority ≤ 10` 可覆盖 `MCP_NEWS_SERVER`（50）和内置 source（100）。

**支持的 `type` 值：**

| type | 实现 | 调用协议 | 说明 |
|------|------|----------|------|
| `api` | `APINewsAdapter` | HTTP POST + Bearer | 第三方 REST JSON API |
| `mcp` | `MCPNewsAdapter` | HTTP POST `{server}/tools/{tool}` | 另一个 MarketPlayer MCP Server |
| `skill` | `SkillNewsAdapter` | HTTP POST `{skillEndpoint}` | 另一个 openclaw 实例的 Skill 端点 |
| `custom` | `CustomNewsAdapter` | 代码内注入 | 内置 adapter 使用此类型，一般不在此配置 |

**`api` 类型示例：**

```json
NEWS_ADAPTERS=[
  {
    "name": "my-us-news",
    "type": "api",
    "config": {
      "endpoint": "https://my-news-api.com/v1/news",
      "apiKey": "sk-xxx",
      "timeout": 15000
    },
    "markets": ["us"],
    "priority": 5,
    "enabled": true
  }
]
```

**`mcp` 类型示例（按市场覆盖，比 `MCP_NEWS_SERVER` 更精细）：**

```json
NEWS_ADAPTERS=[
  {
    "name": "remote-mcp-us-hk",
    "type": "mcp",
    "config": {
      "server": "http://remote-marketplayer:3001",
      "tool": "fetch_news",
      "timeout": 30000
    },
    "markets": ["us", "hk"],
    "priority": 3,
    "enabled": true
  }
]
```

- `MCPNewsAdapter` 调用 `{server}/tools/{tool}`，body 为 `{ arguments: params }`

**`skill` 类型示例（openclaw 实例委托）：**

```json
NEWS_ADAPTERS=[
  {
    "name": "openclaw-hk-skill",
    "type": "skill",
    "config": {
      "skillName": "fetch-news",
      "skillEndpoint": "http://openclaw-instance:8080/skill",
      "timeout": 30000
    },
    "markets": ["hk"],
    "priority": 5,
    "enabled": true
  }
]
```

- `SkillNewsAdapter` POST body: `{ skill, action: "fetchNews", parameters, timeout }`
- 响应须为 `{ items: NewsItem[], metadata?: object }`

---

### 内置 adapter 启用条件

（`src/services/news/adapters/service.ts` — `getDefaultAdapters()`）

| Adapter | Priority | 启用条件 |
|---------|----------|----------|
| `mcp-news-source` | 50 | `MCP_NEWS_SERVER` 已设置 |
| `us-stock-builtin` | 100 | `ALPHA_VANTAGE_API_KEY` 已设置 |
| `hk-stock-builtin` | 100 | 始终启用 |
| `a-stock-builtin` | 100 | 始终启用 |
| `btc-builtin` | 100 | 始终启用 |

> `us-stock-builtin` 未启用且无外部 adapter 时，US 市场无数据源（cron 返回空，不报错）。

---

## 关键文件索引

| 文件 | 说明 |
|------|------|
| `src/services/news/sources/us-stock.ts` | `fetchUSStockNews()` + `fetchUSStockNewsViaYahoo()` |
| `src/services/news/sources/hk-stock.ts` | `fetchHKStockNews()` |
| `src/services/news/sources/a-stock.ts` | `fetchAStockNews()` + fallback |
| `src/services/news/sources/btc.ts` | `fetchBTCNews()` + `fetchBTCNewsFallback()` |
| `src/services/news/adapters/base.ts` | `APINewsAdapter`、`SkillNewsAdapter`、`MCPNewsAdapter`、`CustomNewsAdapter`、`NewsAdapterFactory` |
| `src/services/news/adapters/mcp.ts` | `MCPClient` + `callMCP()`，MCP HTTP 调用实现 |
| `src/services/news/adapters/service.ts` | `createNewsService()`、`getDefaultAdapters()`，含 `MCP_NEWS_SERVER` 自动注册逻辑 |
| `src/config/index.ts` | `NEWS_SYMBOLS_US`、`NEWS_SYMBOLS_HK`、`MCP_NEWS_SERVER`、`MCP_NEWS_TOOL` 等 env 解析 |
| `src/index.ts:61-65` | MCP Server 启动逻辑（`MCP_SERVER_PORT` 控制） |

---

## 验证

```bash
# 触发完整 pipeline 并验证数据源可用性
/run-pipeline market=us
/run-pipeline market=hk
/run-pipeline market=a
/run-pipeline market=btc

# 仅拉取（只读，不入库）
/fetch-news market=us
/fetch-news market=hk
```
