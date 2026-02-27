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

