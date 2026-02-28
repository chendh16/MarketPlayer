# 定时任务模块

## 架构概览

```
src/services/scheduler/
└── news-fetcher.ts   # 各市场新闻定时抓取
```

## 定时任务配置

| 市场 | 频率 | Cron 表达式 | 说明 |
|------|------|------------|------|
| 美股 | 每5分钟 | `*/5 * * * *` | 交易时间内 |
| 港股 | 每5分钟 | `*/5 * * * *` | 交易时间内 |
| A股 | 每5分钟 | `*/5 * * * *` | 交易时间内 |
| BTC | 每4小时 | `0 */4 * * *` | 24小时运行 |

## 启动方式

```typescript
import { startAllFetchers } from './news-fetcher';

// 启动所有定时任务
startAllFetchers();

// 或单独启动
startUSStockFetcher();
startBTCFetcher();
```

## 市场时间检查

非交易时间自动跳过（BTC 除外）：

```typescript
if (!isMarketOpen('us')) {
  logger.debug('US market closed, skipping fetch');
  return;
}
```

**市场时间**（UTC）：
- 美股：13:30 - 20:00（夏令时 12:30 - 19:00）
- 港股：01:30 - 08:00
- A股：01:30 - 07:00

## 手动触发

```typescript
import { runUSStockFetch, runBTCFetch } from './news-fetcher';

// 手动触发一次抓取
await runUSStockFetch();
await runBTCFetch();
```

## 启用定时任务

在 `src/index.ts` 中取消注释：

```typescript
// 启动定时任务
startAllFetchers();
```

目前默认关闭，需要手动启用。

