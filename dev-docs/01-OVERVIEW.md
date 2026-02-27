# 01 — 项目概览 & 技术栈

---

## 项目简介

面向华人个人投资者的 AI 智能交易助手。系统 7×24 监控 A股/港股/美股/BTC，通过 Discord Bot 推送 AI 信号参考，用户人工确认后自动在富途下单。

**核心流程：**
```
资讯抓取 → AI分析 → 风控检查 → Discord推送 → 用户确认 → 富途下单
```

---

## 技术栈

### 后端
- **Runtime:** Node.js 20+ (TypeScript)
- **框架:** Express.js
- **任务队列:** BullMQ (基于 Redis)
- **定时任务:** node-cron

### 数据库
- **主数据库:** PostgreSQL 15+（状态持久化、日志、用户数据）
- **缓存/队列/锁:** Redis 7+（持仓缓存、分布式锁、消息队列）

### AI
- **模型:** Anthropic Claude API
  - 摘要/置信度: claude-haiku-4-5-20251001
  - 影响分析/交易参考: claude-sonnet-4-6
- **SDK:** @anthropic-ai/sdk

### 外部服务
- **推送:** Discord.js v14（主渠道）
- **备用推送:** Telegram Bot API（故障备用）
- **富途:** futu-api（Node.js SDK）
- **资讯数据源:** 待定（见 10-ENV-CONFIG.md）

### 基础设施
- **容器化:** Docker + Docker Compose
- **进程管理:** PM2
- **监控:** Sentry（错误追踪）

---

## 项目目录结构

```
project-root/
├── src/
│   ├── index.ts                  # 入口文件
│   ├── config/
│   │   └── index.ts              # 环境变量读取
│   ├── db/
│   │   ├── postgres.ts           # PostgreSQL 连接
│   │   ├── redis.ts              # Redis 连接
│   │   └── migrations/           # 数据库迁移文件
│   ├── models/                   # 数据模型（TypeScript interfaces）
│   │   ├── signal.ts
│   │   ├── order.ts
│   │   ├── user.ts
│   │   └── position.ts
│   ├── services/
│   │   ├── news/
│   │   │   ├── fetcher.ts        # 资讯抓取
│   │   │   ├── filter.ts         # 规则预筛选
│   │   │   └── sources/          # 各市场数据源
│   │   │       ├── us-stock.ts
│   │   │       ├── hk-stock.ts
│   │   │       ├── a-stock.ts
│   │   │       └── btc.ts
│   │   ├── ai/
│   │   │   ├── analyzer.ts       # AI 分析主逻辑
│   │   │   ├── summarizer.ts     # 摘要生成
│   │   │   ├── signal-generator.ts # 交易参考生成
│   │   │   └── cost-controller.ts  # 调用量控制
│   │   ├── risk/
│   │   │   └── engine.ts         # 风控规则引擎
│   │   ├── discord/
│   │   │   ├── bot.ts            # Discord Bot 主逻辑
│   │   │   ├── formatter.ts      # 消息格式化
│   │   │   └── interactions.ts   # 按钮交互处理
│   │   ├── futu/
│   │   │   ├── connection.ts     # 富途 API 连接管理
│   │   │   ├── position.ts       # 持仓查询
│   │   │   └── order.ts          # 下单执行
│   │   └── telegram/
│   │       └── bot.ts            # Telegram 备用推送
│   ├── queues/
│   │   ├── news-queue.ts         # 资讯处理队列
│   │   ├── ai-queue.ts           # AI 分析队列
│   │   └── order-queue.ts        # 下单队列
│   ├── state/
│   │   └── signal-machine.ts     # 建议状态机
│   ├── api/
│   │   ├── routes/               # REST API 路由
│   │   └── middleware/           # 中间件
│   └── utils/
│       ├── logger.ts
│       ├── encryption.ts         # API 密钥加密
│       └── idempotency.ts        # 幂等性工具
├── tests/
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 核心依赖 package.json

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "discord.js": "^14.14.0",
    "bullmq": "^5.0.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "node-cron": "^3.0.0",
    "express": "^4.18.0",
    "axios": "^1.6.0",
    "dotenv": "^16.0.0",
    "winston": "^3.11.0",
    "@sentry/node": "^7.0.0",
    "zod": "^3.22.0",
    "node-telegram-bot-api": "^0.65.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/pg": "^8.11.0",
    "@types/express": "^4.17.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

---

## docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: trading_bot
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## 启动流程

```typescript
// src/index.ts
async function bootstrap() {
  // 1. 初始化数据库连接
  await initPostgres();
  await initRedis();
  
  // 2. 运行数据库迁移
  await runMigrations();
  
  // 3. 启动 Discord Bot
  await startDiscordBot();
  
  // 4. 启动 BullMQ Workers
  await startNewsWorker();
  await startAIWorker();
  await startOrderWorker();
  
  // 5. 启动资讯抓取定时任务
  await startNewsFetchers();
  
  // 6. 启动富途连接
  await initFutuConnections();
  
  // 7. 启动 Express API
  await startAPIServer();
  
  console.log('System started successfully');
}

bootstrap().catch(console.error);
```
