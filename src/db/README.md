# 数据库模块

## 架构概览

```
src/db/
├── postgres.ts     # PostgreSQL 连接池
├── redis.ts        # Redis 客户端（懒加载代理）
├── queries.ts      # 所有数据库查询函数
└── migrations/     # 数据库迁移脚本
```

## 数据表结构

| 表名 | 说明 |
|------|------|
| `users` | 用户信息、Discord ID、风险偏好 |
| `broker_accounts` | 券商账户（富途等） |
| `manual_positions` | 手动录入的持仓（非富途账户） |
| `news_items` | 抓取的新闻记录 |
| `signals` | AI 生成的交易信号 |
| `signal_deliveries` | 信号推送记录（每用户一条） |
| `orders` | 订单记录 |
| `risk_override_logs` | 风控覆盖日志 |
| `ai_cost_logs` | AI 调用成本记录 |

## 使用方式

### 初始化

```typescript
import { initPostgres } from './postgres';
import { initRedis } from './redis';

await initPostgres();  // 必须在使用前调用
await initRedis();     // 必须在使用前调用
```

### 常用查询

```typescript
import { getUserByDiscordId, createSignal, getAllUsers } from './queries';

// 获取用户
const user = await getUserByDiscordId('123456789');

// 创建信号
const signal = await createSignal({ ... });

// 获取所有活跃用户
const users = await getAllUsers();
```

## Redis 懒加载代理

Redis 客户端使用 Proxy 模式，调用前必须初始化：

```typescript
// ❌ 错误：未初始化直接使用
redisClient.get('key');  // Error: Redis client not initialized

// ✅ 正确：先初始化
await initRedis();
redisClient.get('key');  // 正常工作
```

## 数据库迁移

```bash
# 运行迁移
npm run migrate

# 迁移文件位置
src/db/migrations/
```

## 连接配置

```bash
DATABASE_URL=postgresql://trading_user:password@localhost:5432/trading_bot
REDIS_URL=redis://localhost:6379
```

