# MarketPlayer 开发指南

## 快速开始

### 1. 生成加密密钥

```bash
npm run generate-keys
```

将输出的密钥复制到 `.env` 文件中。

### 2. 配置环境变量

编辑 `.env` 文件，填入以下必需配置：

```bash
# 数据库（使用 Docker 的默认配置）
DATABASE_URL=postgresql://trading_user:password@localhost:5432/trading_bot
REDIS_URL=redis://localhost:6379

# Discord Bot（需要在 Discord Developer Portal 创建）
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Anthropic AI（需要在 Anthropic 官网申请）
ANTHROPIC_API_KEY=your_anthropic_api_key

# 加密密钥（使用 npm run generate-keys 生成）
ENCRYPTION_KEY=your_generated_key
ENCRYPTION_IV=your_generated_iv
JWT_SECRET=your_generated_secret
```

### 3. 启动服务

使用快速启动脚本：

```bash
./start.sh
```

或手动启动：

```bash
# 启动数据库
docker-compose up -d postgres redis

# 运行迁移
npm run migrate

# 启动开发服务器
npm run dev
```

## 项目结构

```
src/
├── index.ts                    # 主入口
├── config/                     # 配置管理
├── db/                         # 数据库
│   ├── postgres.ts            # PostgreSQL 连接
│   ├── redis.ts               # Redis 连接
│   ├── queries.ts             # 查询辅助函数
│   └── migrations/            # 数据库迁移
├── models/                     # 数据模型
├── services/                   # 业务服务
│   ├── news/                  # 资讯抓取
│   ├── ai/                    # AI 分析
│   ├── risk/                  # 风控引擎
│   ├── discord/               # Discord Bot
│   ├── futu/                  # 富途对接
│   └── scheduler/             # 定时任务
├── queues/                     # BullMQ 队列
├── api/                        # REST API
└── utils/                      # 工具函数
```

## 开发任务

### 当前状态

✅ 项目骨架已完成
✅ 数据库层已实现
✅ 基础服务已搭建

### 待实现功能

1. **资讯数据源对接**
   - 实现 `src/services/news/sources/us-stock.ts`
   - 实现 `src/services/news/sources/hk-stock.ts`
   - 实现 `src/services/news/sources/a-stock.ts`
   - 实现 `src/services/news/sources/btc.ts`

2. **富途API对接**
   - 实现 `src/services/futu/connection.ts` 中的真实连接
   - 实现 `src/services/futu/position.ts` 中的持仓查询
   - 实现 `src/services/futu/order.ts` 中的下单逻辑

3. **Discord交互完善**
   - 完善 `src/services/discord/bot.ts` 中的按钮处理
   - 实现信号推送逻辑
   - 添加更多消息格式

4. **测试**
   - 编写单元测试
   - 集成测试
   - 端到端测试

## 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run migrate          # 运行数据库迁移

# 工具
npm run generate-keys    # 生成加密密钥
npm run cost-report      # 查看AI成本报告

# 部署
docker-compose up -d     # 启动所有服务
pm2 start ecosystem.config.js  # 使用PM2启动
pm2 logs market-player   # 查看日志
```

## 调试技巧

### 查看日志

```bash
# 实时查看日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log
```

### 数据库调试

```bash
# 连接到 PostgreSQL
docker exec -it marketplayer-postgres-1 psql -U trading_user -d trading_bot

# 查看表
\dt

# 查询数据
SELECT * FROM users;
SELECT * FROM signals ORDER BY created_at DESC LIMIT 10;
```

### Redis 调试

```bash
# 连接到 Redis
docker exec -it marketplayer-redis-1 redis-cli

# 查看所有键
KEYS *

# 查看特定键
GET ai:daily:calls:2026-02-27
```

## 注意事项

1. **安全**
   - 不要提交 `.env` 文件到代码仓库
   - 定期更换 API 密钥
   - 加密密钥一旦设置不要更改（会导致已加密数据无法解密）

2. **成本控制**
   - 监控 AI 调用次数和成本
   - 设置合理的 `AI_DAILY_CALL_LIMIT`
   - 定期运行 `npm run cost-report`

3. **测试模式**
   - 开发阶段保持 `COLD_START_MODE=true`
   - 测试完成后再设置为 `false`

## 获取帮助

- 查看 `dev-docs/` 目录中的详细文档
- 查看 `README.md` 了解项目概览
- 检查日志文件排查问题

