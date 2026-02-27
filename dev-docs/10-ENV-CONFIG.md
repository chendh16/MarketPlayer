# 10 — 环境变量 & 部署配置

---

## .env.example（完整）

```bash
# ── 数据库 ──
DATABASE_URL=postgresql://user:password@localhost:5432/trading_bot
DB_USER=trading_user
DB_PASSWORD=your_secure_password

# ── Redis ──
REDIS_URL=redis://localhost:6379

# ── Discord ──
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
# 用于推送的 Discord 频道（每个用户单独 DM，此为管理频道）
DISCORD_ADMIN_CHANNEL_ID=your_channel_id

# ── Telegram（备用渠道）──
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# ── Anthropic AI ──
ANTHROPIC_API_KEY=your_anthropic_api_key
# 每日 AI 调用上限（超出后降级为规则引擎）
AI_DAILY_CALL_LIMIT=500
# 小时成本告警阈值（美元）
AI_HOURLY_COST_ALERT_USD=5.0
# 小时成本熔断阈值（美元）
AI_HOURLY_COST_BRAKE_USD=10.0

# ── 富途 API（方案A：全自动下单）──
# 注意：富途 API 需要单独申请交易权限
FUTU_API_HOST=127.0.0.1
FUTU_API_PORT=11111
# 方案 A / B / C（A=全自动，B=深链接，C=纯推送）
FUTU_ORDER_MODE=B

# ── 加密密钥（用于加密存储券商 API 凭证）──
# 必须是32字节的随机字符串，生成：openssl rand -hex 32
ENCRYPTION_KEY=your_32_byte_hex_encryption_key
ENCRYPTION_IV=your_16_byte_hex_iv

# ── JWT ──
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

# ── 资讯数据源 ──
# 美股
YAHOO_FINANCE_API_KEY=optional_if_using_free_tier
ALPHA_VANTAGE_API_KEY=your_key
# 港股 / A股（待定）
EASTMONEY_API_KEY=optional
# BTC
COINGECKO_API_KEY=optional_free_tier_available

# ── 告警 ──
SENTRY_DSN=your_sentry_dsn
# 成本告警通知（发到管理员 Discord DM）
ADMIN_DISCORD_USER_ID=your_discord_user_id

# ── 系统配置 ──
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
# 冷启动模式（true=内测期，不对外推送下单按钮）
COLD_START_MODE=true
```

---

## 配置读取模块

```typescript
// src/config/index.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // 数据库
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Discord
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_ADMIN_CHANNEL_ID: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_DAILY_CALL_LIMIT: z.coerce.number().default(500),
  AI_HOURLY_COST_ALERT_USD: z.coerce.number().default(5.0),
  AI_HOURLY_COST_BRAKE_USD: z.coerce.number().default(10.0),

  // 富途
  FUTU_API_HOST: z.string().default('127.0.0.1'),
  FUTU_API_PORT: z.coerce.number().default(11111),
  FUTU_ORDER_MODE: z.enum(['A', 'B', 'C']).default('B'),

  // 加密
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
  ENCRYPTION_IV: z.string().length(32),  // 16 bytes hex

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // 系统
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ADMIN_DISCORD_USER_ID: z.string().optional(),
  COLD_START_MODE: z.coerce.boolean().default(false),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
```

---

## 数据库迁移文件

```sql
-- src/db/migrations/001_initial_schema.sql
-- 按顺序执行

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用户表
CREATE TABLE users ( ... ); -- 见 02-DATA-MODELS.md

-- 券商账户表
CREATE TABLE broker_accounts ( ... );

-- 手动持仓表
CREATE TABLE manual_positions ( ... );

-- 资讯表
CREATE TABLE news_items ( ... );

-- 信号表
CREATE TABLE signals ( ... );

-- 信号推送表
CREATE TABLE signal_deliveries ( ... );

-- 订单表
CREATE TABLE orders ( ... );

-- 风控覆盖日志表
CREATE TABLE risk_override_logs ( ... );

-- AI 成本日志表
CREATE TABLE ai_cost_logs ( ... );

-- 索引（见 02-DATA-MODELS.md 各表定义）
```

```typescript
// src/db/migrations/runner.ts
import { readFileSync } from 'fs';
import path from 'path';

export async function runMigrations() {
  const migrationFiles = [
    '001_initial_schema.sql',
    // 后续迁移文件按顺序添加
  ];

  for (const file of migrationFiles) {
    const sql = readFileSync(
      path.join(__dirname, 'migrations', file), 'utf8'
    );
    try {
      await db.query(sql);
      console.log(`Migration ${file} applied`);
    } catch (err: any) {
      if (err.code === '42P07') { // 表已存在
        console.log(`Migration ${file} already applied, skipping`);
      } else {
        throw err;
      }
    }
  }
}
```

---

## 部署检查清单

```
启动前必须确认：
□ PostgreSQL 连接正常
□ Redis 连接正常
□ Discord Bot Token 有效，Bot 已加入目标服务器
□ Anthropic API Key 有效
□ ENCRYPTION_KEY 已设置且不会变更（变更后所有加密凭证失效）
□ 富途 API 权限已申请（方案A）或跳过（方案B/C）
□ 数据库迁移已执行
□ COLD_START_MODE=true（上线前确认内测模式）

合规确认（上线前）：
□ 已咨询香港/新加坡金融合规律师
□ 风险披露协议文本已审核
□ 免责声明文字已确认
□ 产品名称已确定（影响 Discord Bot 名称）

安全确认：
□ .env 文件不在代码库中（.gitignore 已添加）
□ ENCRYPTION_KEY 安全存储，有备份
□ JWT_SECRET 足够随机（openssl rand -base64 48）
□ 数据库密码足够强
□ Redis 配置了密码（生产环境）
```

---

## 冷启动模式控制

```typescript
// 当 COLD_START_MODE=true 时：
// - 所有信号推送添加 "[测试阶段]" 前缀
// - 下单按钮替换为 "⚠️ 测试阶段，请勿实际下单"
// - 记录所有推送但不执行真实下单

export function applyColdStartMode(message: any, config: AppConfig): any {
  if (!config.COLD_START_MODE) return message;

  // 修改标题
  if (message.embeds?.[0]) {
    const embed = message.embeds[0];
    embed.data.title = `[测试阶段] ${embed.data.title}`;
    if (embed.data.footer) {
      embed.data.footer.text = '⚠️ 测试阶段，信号仅供观察，请勿重仓参考 | ' + embed.data.footer.text;
    }
  }

  // 禁用所有下单按钮
  if (message.components) {
    message.components = message.components.map((row: any) => ({
      ...row,
      components: row.components.map((btn: any) => {
        if (btn.data?.custom_id?.startsWith('confirm')) {
          return { ...btn, data: { ...btn.data, disabled: true, label: '⚠️ 测试阶段不可下单' } };
        }
        return btn;
      })
    }));
  }

  return message;
}
```

---

## PM2 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'trading-bot',
      script: 'dist/index.js',
      instances: 1,          // 单实例（富途连接不支持多实例）
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
```

---

## 快速启动命令

```bash
# 本地开发
npm install
cp .env.example .env
# 编辑 .env 填入实际配置
docker-compose up -d postgres redis
npm run migrate
npm run dev

# 生产部署
docker-compose up -d
npm run build
npm run migrate
pm2 start ecosystem.config.js --env production
pm2 logs trading-bot

# 查看 AI 成本
npm run cost-report

# 手动触发熔断解除（紧急情况）
redis-cli DEL ai:emergency_brake
```
