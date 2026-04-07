# news_status 表结构文档

## 概述

`news_status` 表用于存储 MarketPlayer 新闻监控系统的新闻状态跟踪数据。

## 表结构

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 唯一标识 |
| news_id | VARCHAR(255) | UNIQUE NOT NULL | 新闻唯一ID |
| source | VARCHAR(50) | NOT NULL | 新闻来源 (reuters, bloomberg, cnbc, wsj) |
| title | TEXT | NOT NULL | 新闻标题 |
| summary | TEXT | NULL | 新闻摘要 |
| url | VARCHAR(500) | NULL | 原文链接 |
| published_at | TIMESTAMP | NOT NULL | 发布时间 |
| category | VARCHAR(50) | NULL | 分类 (macro, equity, sector, risk) |
| alert_level | INT | DEFAULT 4 | 告警级别 (1=CRITICAL, 2=HIGH, 3=MEDIUM, 4=LOW) |
| sentiment | DECIMAL(3,2) | NULL | 情绪分数 (-1.0 ~ 1.0) |
| symbols | JSONB | NULL | 相关股票代码数组，如 ["AAPL", "MSFT"] |
| market_status_id | UUID | REFERENCES market_status(uuid_id) | 关联市场状态ID |
| correlation_id | UUID | NULL | 关联ID（用于新闻关联分析） |
| processed | BOOLEAN | DEFAULT FALSE | 是否已处理 |
| notified_agents | JSONB | NULL | 已通知Agent列表，如 {"market-agent": "2026-04-05T16:30:00Z"} |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

## 索引

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_news_status_alert_level | alert_level | B-Tree |
| idx_news_status_symbols | symbols | GIN |
| idx_news_status_published_at | published_at DESC | B-Tree |
| idx_news_status_category | category | B-Tree |
| idx_news_status_processed | processed | B-Tree |
| idx_news_status_market_status_id | market_status_id | B-Tree |

## 外键关系

```
news_status.market_status_id → market_status.uuid_id
策略: ON DELETE SET NULL
```

当 market_status 记录被删除时，关联的 news_status 记录的 market_status_id 会被设为 NULL，新闻数据保留。

## 数据示例

```sql
-- 查看所有新闻
SELECT news_id, source, title, alert_level, sentiment, processed 
FROM news_status ORDER BY alert_level, published_at DESC;

-- 查看未处理的新闻
SELECT * FROM news_status WHERE processed = FALSE;

-- 查看CRITICAL级别新闻
SELECT * FROM news_status WHERE alert_level = 1;

-- 按股票查询新闻
SELECT * FROM news_status 
WHERE symbols ? 'AAPL';
```

## 迁移文件

- Up: `database/migrations/add_news_status_table.sql`
- Down: `database/migrations/rollback_news_status_table.sql`

## 测试数据

- 位置: `database/seeds/news_status_test_data.sql`
- 记录数: 5条

## 验证脚本

- 位置: `database/scripts/verify_news_status_schema.py`
