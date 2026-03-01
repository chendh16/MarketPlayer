# 资讯获取指南

## 架构概览

```
news-fetcher.ts (cron 触发 / MCP 工具调用)
    ↓
newsService.fetchNews({ market })
    ├─ 外部 adapter（NEWS_ADAPTERS 环境变量，priority 1-10）← 优先
    └─ 内置 adapter（sources/ 目录，priority 100）         ← 降级
    ↓
applyPreFilter() → 去重 / 市场时间过滤
    ↓
persistAndQueue() → 写库 → newsQueue → AI 分析 → Discord
```

---

## 内置数据源

### 美股（us）

| 项目 | 说明 |
|------|------|
| 主力来源 | Alpha Vantage NEWS_SENTIMENT API |
| 文件 | `src/services/news/sources/us-stock.ts` |
| 所需 Key | `ALPHA_VANTAGE_API_KEY`（必须，否则降级 Yahoo Finance RSS） |
| 免费层限制 | 25 次/天，延迟 15 分钟 |
| 无 Key 降级 | Yahoo Finance RSS（`feeds.finance.yahoo.com`，无限制，实时） |
| 抓取频率 | 每 5 分钟（仅开盘时段） |
| 监控标的 | `NEWS_SYMBOLS_US` 环境变量（默认 AAPL/GOOGL/MSFT/TSLA/NVDA...） |

**Alpha Vantage 配置：**
```bash
ALPHA_VANTAGE_API_KEY=your_real_key   # 留空或占位符时自动降级 Yahoo RSS
NEWS_SYMBOLS_US=AAPL,GOOGL,MSFT,TSLA,NVDA,AMZN,META,NFLX,SPY,QQQ
```

---

### 港股（hk）

| 项目 | 说明 |
|------|------|
| 来源 | Yahoo Finance RSS |
| 文件 | `src/services/news/sources/hk-stock.ts` |
| 所需 Key | 无（免费公开） |
| 抓取频率 | 每 5 分钟（仅港股开盘时段） |
| 监控标的 | `NEWS_SYMBOLS_HK` 环境变量 |
| 并发策略 | 对每个标的并发抓取 RSS，去重后返回最多 30 条 |

**配置：**
```bash
NEWS_SYMBOLS_HK=0700.HK,9988.HK,3690.HK,1299.HK,2318.HK,0941.HK,0388.HK,1810.HK
```

---

### A 股（a）

| 项目 | 说明 |
|------|------|
| 主力来源 | 东方财富快讯 API（`datacenter-web.eastmoney.com`） |
| 文件 | `src/services/news/sources/a-stock.ts` |
| 所需 Key | 无（公开接口） |
| 备用来源 | `gblobapi.eastmoney.com`（主力失败时自动切换） |
| 抓取频率 | 每 5 分钟（仅 A 股开盘时段） |
| 标的提取 | 从新闻标题自动提取 6 位股票代码（正则匹配），无需配置 |
| **已知问题** | 东方财富 API 有时屏蔽非浏览器请求，返回 HTML；遇到此情况建议配置外部 Skill/MCP 替代 |

---

### 加密货币（btc）

| 项目 | 说明 |
|------|------|
| 主力来源 | CoinGecko News API |
| 文件 | `src/services/news/sources/btc.ts` |
| 所需 Key | `COINGECKO_API_KEY`（可选，免费层无需 key） |
| 备用来源 | CoinDesk RSS（CoinGecko 失败时自动切换） |
| 抓取频率 | 每 4 小时（24 小时运行，无市场时间限制） |
| 标的 | 固定为 `BTC`，无需配置 |

**配置：**
```bash
COINGECKO_API_KEY=your_key   # 可选，不填也能正常工作
```

---

## 各市场状态汇总

| 市场 | 当前状态 | 免费可用 | 备注 |
|------|--------|---------|------|
| 港股 HK | ✅ 稳定 | ✅ 是 | Yahoo Finance RSS 无限制 |
| BTC | ✅ 稳定 | ✅ 是 | CoinGecko 免费层 + CoinDesk 备份 |
| 美股 US | ⚠️ 需配置 | ⚠️ 降级 | 无 Alpha Vantage key 时降级 Yahoo RSS |
| A 股 | ⚠️ 不稳定 | ✅ 是 | 东方财富 API 偶发被屏蔽，建议配置外部源 |

---

## 添加外部数据源（零代码）

通过 `NEWS_ADAPTERS` 环境变量注入，外部 adapter 优先级默认高于内置（priority 1-10 < 内置 100）。

### 方式 A：MCP 服务器

```bash
NEWS_ADAPTERS='[
  {
    "name": "a-stock-mcp",
    "type": "mcp",
    "config": {
      "server": "http://localhost:3001",
      "tool": "fetch_news",
      "timeout": 30000
    },
    "markets": ["a"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 方式 B：Skill 框架

```bash
NEWS_ADAPTERS='[
  {
    "name": "us-stock-skill",
    "type": "skill",
    "config": {
      "skillName": "market-news-fetcher",
      "skillEndpoint": "http://skill-server:3002",
      "timeout": 30000
    },
    "markets": ["us"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 方式 C：多市场混合

```bash
NEWS_ADAPTERS='[
  {"name":"us-ext","type":"mcp","config":{"server":"http://mcp:3001","tool":"fetch_news"},"markets":["us"],"priority":1,"enabled":true},
  {"name":"a-ext","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"http://skill:3002"},"markets":["a"],"priority":1,"enabled":true}
]'
```

**规则：** 未配置的市场自动使用内置 adapter；外部 adapter 失败自动降级到内置。

---

## 手动触发测试

```bash
# 抓取指定市场资讯并发送到 Discord
npx ts-node scripts/send-market-news.ts btc   # BTC（最稳定）
npx ts-node scripts/send-market-news.ts hk    # 港股
npx ts-node scripts/send-market-news.ts us    # 美股
npx ts-node scripts/send-market-news.ts a     # A 股

# 仅抓取（不写库/不入队），通过 MCP 工具
curl -X POST http://localhost:3001/tools/fetch_news \
  -H 'Content-Type: application/json' \
  -d '{"market":"btc","limit":5}'
```

---

## 预过滤规则（filter.ts）

资讯在写库前会经过 `preFilter()`，以下情况会被过滤掉：

| 规则 | 说明 |
|------|------|
| 市场未开盘 | US/HK/A 股在非交易时段跳过（BTC 不受限） |
| 黑名单标的 | 可在 filter.ts 中配置屏蔽某些 symbol |
| 重复资讯 | 同一 `externalId` 已存在（DB UNIQUE 约束） |

---

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/services/news/adapters/service.ts` | 统一资讯服务，管理 adapter 注册/路由/降级 |
| `src/services/news/adapters/base.ts` | NewsAdapter 接口 + 工厂（API/Skill/MCP/Custom） |
| `src/services/news/adapters/mcp.ts` | MCP 调用客户端（`callMCP()`） |
| `src/services/news/sources/us-stock.ts` | 美股：Alpha Vantage + Yahoo RSS fallback |
| `src/services/news/sources/hk-stock.ts` | 港股：Yahoo Finance RSS |
| `src/services/news/sources/a-stock.ts` | A 股：东方财富快讯 API |
| `src/services/news/sources/btc.ts` | BTC：CoinGecko + CoinDesk fallback |
| `src/services/news/filter.ts` | 预过滤逻辑 |
| `src/services/scheduler/news-fetcher.ts` | Cron 调度 + 持久化入队 |
| `scripts/send-market-news.ts` | 手动端到端测试脚本 |
