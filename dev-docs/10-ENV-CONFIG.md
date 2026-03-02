# 10 — 环境变量 & 部署配置

> 最后更新：2026-03-02，对应 `.env.example` 当前版本

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
DISCORD_ADMIN_CHANNEL_ID=your_channel_id
TEST_DISCORD_USER_ID=your_test_user_discord_id

# ── Telegram（备用渠道）──
TELEGRAM_BOT_TOKEN=

# ── AI 配置（可插拔，支持多种提供商）──
# AI 提供商：anthropic | openai | azure | custom
AI_PROVIDER=anthropic
AI_API_KEY=your_api_key
# 自定义 API 地址（OpenAI 兼容），anthropic 时留空
AI_API_BASE_URL=
# 模型名：claude-sonnet-4-20250514 / gpt-4-turbo-preview / 你的部署名
AI_MODEL=claude-sonnet-4-20250514
AI_DAILY_CALL_LIMIT=500
AI_HOURLY_COST_ALERT_USD=5.0
AI_HOURLY_COST_BRAKE_USD=10.0
# 兼容旧配置（设置了 AI_API_KEY 则忽略）
ANTHROPIC_API_KEY=

# ── Prompt 配置 ──
# 自定义 prompt 模板目录（默认 ./prompts）
# PROMPT_DIR=/path/to/custom/prompts

# ── 长桥 LongBridge API ──
# 从长桥开发者中心获取：https://open.longbridge.com
LONGPORT_APP_KEY=your_longbridge_app_key
LONGPORT_APP_SECRET=your_longbridge_app_secret
LONGPORT_ACCESS_TOKEN=your_longbridge_access_token
# 下单模式：A=全自动 B=深链接(默认) C=纯通知
LONGBRIDGE_ORDER_MODE=B
LONGBRIDGE_PRICE_SLIPPAGE_PCT=0.01

# ── 富途 API ──
FUTU_API_HOST=127.0.0.1
FUTU_API_PORT=11111
FUTU_ORDER_MODE=B
FUTU_TRD_ENV=SIMULATE
# futu-api JS SDK 使用 WebSocket 连接 OpenD（非 TCP 端口）
FUTU_WEBSOCKET_PORT=33333
FUTU_WEBSOCKET_KEY=your_opend_websocket_key
FUTU_TRADE_ACC_ID=
FUTU_TRADE_ACC_INDEX=0
FUTU_TRADE_PASSWORD=
FUTU_TRADE_PASSWORD_MD5=
FUTU_AUTO_UNLOCK=true
FUTU_FALLBACK_TO_PLAN_B=true
FUTU_ORDER_PRICE_SLIPPAGE_PCT=0.01

# ── 加密密钥 ──
# 生成：openssl rand -hex 32
ENCRYPTION_KEY=your_32_byte_hex_encryption_key
ENCRYPTION_IV=your_16_byte_hex_iv

# ── JWT ──
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

# ── 资讯数据源 ──
NEWS_ADAPTERS=
YAHOO_FINANCE_API_KEY=
ALPHA_VANTAGE_API_KEY=
EASTMONEY_API_KEY=
COINGECKO_API_KEY=

# 监控标的（逗号分隔）
NEWS_SYMBOLS_US=AAPL,GOOGL,MSFT,TSLA,NVDA,AMZN,META,NFLX,SPY,QQQ
NEWS_SYMBOLS_HK=0700.HK,9988.HK,3690.HK,1299.HK,2318.HK,0941.HK,0388.HK,1810.HK

# ── MCP 工具服务器（Agent 调用层）──
# 设置端口后随主服务同时启动，不设置则不启动
MCP_SERVER_PORT=3001

# ── 告警 ──
SENTRY_DSN=
ADMIN_DISCORD_USER_ID=

# ── 系统配置 ──
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
COLD_START_MODE=true
```

---

## 变量分类说明

### 必需变量（缺少则启动失败）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `DISCORD_BOT_TOKEN` | Discord Bot Token |
| `DISCORD_CLIENT_ID` | Discord 应用 Client ID |
| `AI_API_KEY` | AI 服务 API Key |
| `ENCRYPTION_KEY` | AES-256 加密密钥（32 bytes hex） |
| `ENCRYPTION_IV` | 加密 IV（16 bytes hex） |
| `JWT_SECRET` | JWT 签名密钥（≥32字符） |

### 券商配置（按需填写其中一项）

| 变量 | 适用券商 | 说明 |
|------|----------|------|
| `LONGPORT_APP_KEY` | 长桥 | 从 open.longbridge.com 获取 |
| `LONGPORT_APP_SECRET` | 长桥 | 同上 |
| `LONGPORT_ACCESS_TOKEN` | 长桥 | 同上 |
| `LONGBRIDGE_ORDER_MODE` | 长桥 | A/B/C，默认 B |
| `FUTU_WEBSOCKET_PORT` | 富途 | OpenD WebSocket 端口，默认 33333 |
| `FUTU_WEBSOCKET_KEY` | 富途 | OpenD 中配置的 websocket_key |
| `FUTU_TRADE_PASSWORD` | 富途 | 交易密码（UnlockTrade 用） |
| `FUTU_TRD_ENV` | 富途 | SIMULATE / REAL |
| `FUTU_ORDER_MODE` | 富途 | A/B/C，默认 B |

### MCP 工具服务器

| 变量 | 说明 | 默认 |
|------|------|------|
| `MCP_SERVER_PORT` | 启动 MCP server 的端口 | 不设置则不启动 |

MCP server 启动后暴露 11 个工具，供 AI Agent 调用：

```
GET  /tools                   → 列出所有工具
POST /tools/fetch_news        → 抓取资讯
POST /tools/process_pipeline  → 完整管道
POST /tools/analyze_news      → AI 分析
POST /tools/generate_signal   → 生成信号
POST /tools/check_risk        → 风控检查
POST /tools/get_positions     → 查持仓（broker=futu|longbridge）
POST /tools/get_account       → 查账户（broker=futu|longbridge）
POST /tools/get_broker_balance → 直接查余额（broker=futu|longbridge）
POST /tools/get_deliveries    → 查推送记录
POST /tools/get_delivery      → 查单条推送
POST /tools/confirm_order     → 确认下单
GET  /health                  → 健康检查
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
