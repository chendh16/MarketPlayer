# 新闻获取模块

## 架构概览

```
src/services/news/
├── sources/          # 各市场直接 API 调用
│   ├── us-stock.ts   # 美股：Alpha Vantage API
│   ├── hk-stock.ts   # 港股：东方财富 API
│   ├── a-stock.ts    # A股：东方财富 API
│   └── btc.ts        # BTC：CoinGecko API + CoinDesk RSS 备用
├── adapters/         # 可插拔适配器层（新架构）
│   ├── base.ts       # 适配器接口和工厂
│   ├── service.ts    # 统一资讯服务
│   └── mcp.ts        # MCP 协议客户端
└── filter.ts         # 规则预筛选
```

## 当前工作流程

```
定时任务 (Cron)
    ↓
fetchXxxNews()  ← 直接调用各市场 API
    ↓
preFilter()     ← 规则预筛选（去重、关键词过滤）
    ↓
createNewsItem() ← 入库（ON CONFLICT DO NOTHING 去重）
    ↓
newsQueue.add() ← 推入 BullMQ 队列
    ↓
AI 分析 → 信号生成 → Discord 推送
```

## 数据源说明

| 市场 | API | 配置项 | 免费额度 |
|------|-----|--------|---------|
| BTC | CoinGecko | `COINGECKO_API_KEY`（可选） | 30次/分钟 |
| BTC备用 | CoinDesk RSS | 无需配置 | 无限制 |
| 美股 | Alpha Vantage | `ALPHA_VANTAGE_API_KEY` | 25次/天 |
| 港股 | 东方财富 | 无需配置 | 有限制 |
| A股 | 东方财富 | 无需配置 | 有限制 |

## 可插拔适配器（新架构）

通过 `.env` 中的 `NEWS_ADAPTERS` 配置，支持：

```bash
NEWS_ADAPTERS=[
  {
    "name": "btc-mcp",
    "type": "mcp",
    "config": { "server": "http://localhost:3001", "tool": "fetch_news" },
    "markets": ["btc"],
    "priority": 1,
    "enabled": true
  }
]
```

支持的类型：
- `api` - 传统 REST API
- `skill` - Skill 框架调用
- `mcp` - Model Context Protocol
- `custom` - 自定义实现

## 扩展新数据源

1. 在 `sources/` 下创建新文件，实现 `fetchXxxNews()` 函数
2. 返回 `Partial<NewsItem>[]` 格式
3. 在 `scheduler/news-fetcher.ts` 中注册定时任务
4. 或通过适配器配置接入（推荐）

## 预筛选规则

`filter.ts` 中的预筛选逻辑：
- 去重检查（Redis 缓存，60分钟内同标的同类型只处理一次）
- 关键词过滤（广告、无关内容）
- 市场时间检查（非交易时间跳过）

