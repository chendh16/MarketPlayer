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

  // AI 配置（可插拔）
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'azure', 'custom']).default('anthropic'),
  AI_API_KEY: z.string().min(1),
  AI_API_BASE_URL: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().url().optional()
  ), // 自定义 API 地址
  AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  AI_DAILY_CALL_LIMIT: z.coerce.number().default(500),
  AI_HOURLY_COST_ALERT_USD: z.coerce.number().default(5.0),
  AI_HOURLY_COST_BRAKE_USD: z.coerce.number().default(10.0),

  // 兼容旧配置（可选）
  ANTHROPIC_API_KEY: z.string().optional(),

  // 富途
  FUTU_API_HOST: z.string().default('127.0.0.1'),
  FUTU_API_PORT: z.coerce.number().default(11111),
  FUTU_ORDER_MODE: z.enum(['A', 'B', 'C']).default('B'),
  FUTU_TRD_ENV: z.enum(['SIMULATE', 'REAL']).default('SIMULATE'),
  FUTU_TRADE_ACC_ID: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().optional()
  ),
  FUTU_TRADE_ACC_INDEX: z.coerce.number().default(0),
  FUTU_TRADE_PASSWORD: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().optional()
  ),
  FUTU_TRADE_PASSWORD_MD5: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().length(32).optional()
  ),
  FUTU_AUTO_UNLOCK: z.coerce.boolean().default(true),
  FUTU_FALLBACK_TO_PLAN_B: z.coerce.boolean().default(true),
  FUTU_ORDER_PRICE_SLIPPAGE_PCT: z.coerce.number().default(0.01),

  // 加密
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
  ENCRYPTION_IV: z.string().length(32),  // 16 bytes hex

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // 资讯数据源
  YAHOO_FINANCE_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  EASTMONEY_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),

  // 系统
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ADMIN_DISCORD_USER_ID: z.string().optional(),
  COLD_START_MODE: z.coerce.boolean().default(false),
  SENTRY_DSN: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof configSchema>;
