# 新闻获取模块

## 架构概览

```
src/services/news/
├── sources/          # 各市场直接 API 调用
│   ├── config.ts     # 各市场抓取频率与交易时段配置
│   ├── us-stock.ts   # 美股：Alpha Vantage NEWS_SENTIMENT API（降级：Yahoo Finance RSS）
│   ├── hk-stock.ts   # 港股：Yahoo Finance RSS（并发抓取8个标的）
│   ├── a-stock.ts    # A股：东方财富 DataCenter API（降级：东方财富 WAP API）
│   └── btc.ts        # BTC：CoinGecko /api/v3/news（降级：CoinDesk RSS）
├── adapters/         # 可插拔适配器层
│   ├── base.ts       # 适配器接口、工厂函数、四种实现
│   ├── service.ts    # NewsService 单例（按市场分组、按优先级调用）
│   └── mcp.ts        # MCP 协议客户端
└── filter.ts         # 规则预筛选（四层过滤）
```

## 数据源详情

| 市场 | 主数据源 | 获取方式 | 认证 | 备用方案 | 频率 |
|------|---------|---------|------|---------|------|
| 美股 (us) | Alpha Vantage NEWS_SENTIMENT | REST API + JSON | `ALPHA_VANTAGE_API_KEY` query param | Yahoo Finance RSS（无需 key） | 每5分钟 |
| 港股 (hk) | Yahoo Finance RSS | RSS XML 解析 | User-Agent 伪造 | 无 | 每5分钟 |
| A股 (a)   | 东方财富 DataCenter API | REST API + JSON | Referer 伪造 | 东方财富 WAP API | 每5分钟 |
| BTC (btc) | CoinGecko /api/v3/news | REST API + JSON | `COINGECKO_API_KEY` header（可选） | CoinDesk RSS | 每4小时 |

### 关键 URL

```
美股主: https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=...&apikey=xxx
美股备: https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US
港股:   https://feeds.finance.yahoo.com/rss/2.0/headline?s=0700.HK&region=HK&lang=zh-Hant-HK
A股主:  https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_KUAIBAO_NEWS&...
A股备:  https://gblobapi.eastmoney.com/Information/NewFlash/GetInformationList?...
BTC主:  https://api.coingecko.com/api/v3/news?page=1
BTC备:  https://www.coindesk.com/arc/outboundfeeds/rss/
```

### 默认监控标的

| 市场 | 默认标的 | 配置项 |
|------|---------|--------|
| 美股 | AAPL, GOOGL, MSFT, TSLA, NVDA, AMZN, META, NFLX, SPY, QQQ | `NEWS_SYMBOLS_US` |
| 港股 | 0700.HK, 9988.HK, 3690.HK, 1299.HK, 2318.HK, 0941.HK, 0388.HK, 1810.HK | `NEWS_SYMBOLS_HK` |
| A股 | 从新闻标题正则提取（`[036]\d{5}` 格式） | 无 |
| BTC | bitcoin | 无 |

## 当前工作流程

```
定时任务 (Cron)
    ↓
newsService.fetchNews({market, symbols})
    ├─ 遍历该市场已注册 adapter（按 priority 升序）
    └─ 返回第一个成功 adapter 的结果
    ↓
preFilter()     ← 规则预筛选（4层，不调用 AI）
    ↓
createNewsItem() ← 入库（ON CONFLICT (externalId, market) DO NOTHING 去重）
    ↓
markAsProcessed() ← 设置 Redis 去重标记（1小时）
    ↓
newsQueue.add('process-news', { newsItemId }) ← 推入 BullMQ 队列
    ↓
AI 分析 → 信号生成 → Discord 推送
```

## 预筛选规则（filter.ts）

在调用 AI 之前过滤，减少无效调用：

| 规则 | 触发条件 | Redis Key | TTL |
|------|---------|-----------|-----|
| 涨跌幅过滤 | `triggerType='anomaly'` 且变化 < 3% | 无 | N/A |
| 1小时去重 | 同标的同市场 1小时内已处理 | `news:recent:{symbol}:{market}` | 3600s |
| BTC 频率限制 | BTC 每4小时区块已有 ≥1 条 | `btc:signal:count:{date}-{hourBlock}` | 14400s |
| AI 日调用上限 | 当日调用次数 ≥ 上限（默认500） | `ai:daily:calls:{YYYY-MM-DD}` | — |

## 可插拔适配器

通过 `NEWS_ADAPTERS` 环境变量注入外部数据源（优先级 < 内置 adapter 的 100）：

```bash
NEWS_ADAPTERS='[
  {
    "name": "us-mcp",
    "type": "mcp",
    "config": { "server": "http://localhost:3001", "tool": "fetch_news" },
    "markets": ["us"],
    "priority": 5,
    "enabled": true
  }
]'
```

支持的适配器类型：

| 类型 | 说明 |
|------|------|
| `api` | 传统 REST API，POST 请求 + Bearer token |
| `skill` | Skill 服务器调用（`/skill/...`） |
| `mcp` | Model Context Protocol（`/tools/fetch_news`） |
| `custom` | 直接传入 `fetchFunction` 函数引用 |

## 扩展新数据源

1. 在 `sources/` 下创建新文件，实现 `fetchXxxNews()` 并返回 `Partial<NewsItem>[]`
2. 在 `adapters/service.ts` 中注册为 `CustomNewsAdapter`（推荐），或
3. 在 `scheduler/news-fetcher.ts` 中注册 Cron 定时任务
