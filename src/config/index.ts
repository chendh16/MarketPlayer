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

  // 飞书 Feishu/Lark
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_CHAT_ID: z.string().optional(),
  FEISHU_ENCRYPT_KEY: z.string().optional(),
  FEISHU_VERIFICATION_TOKEN: z.string().optional(),

  // Email / SMTP
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(465),
  EMAIL_SMTP_SECURE: z.preprocess(v => v === 'true', z.boolean()).default(true),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // AI 配置（可插拔）
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'azure', 'custom', 'zhipu']).default('anthropic'),
  AI_API_KEY: z.string().min(1),
  AI_API_BASE_URL: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().url().optional()
  ), // 自定义 API 地址
  AI_MODEL: z.string().default('claude-sonnet-4-5'),
  AI_DAILY_CALL_LIMIT: z.coerce.number().default(500),
  AI_HOURLY_COST_ALERT_USD: z.coerce.number().default(5.0),
  AI_HOURLY_COST_BRAKE_USD: z.coerce.number().default(10.0),

  // 兼容旧配置（可选）
  ANTHROPIC_API_KEY: z.string().optional(),

  // 长桥 LongBridge
  LONGPORT_APP_KEY: z.string().optional(),
  LONGPORT_APP_SECRET: z.string().optional(),
  LONGPORT_ACCESS_TOKEN: z.string().optional(),
  LONGBRIDGE_ORDER_MODE: z.enum(['A', 'B', 'C']).default('B'),
  LONGBRIDGE_PRICE_SLIPPAGE_PCT: z.coerce.number().default(0.01),

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
  // 美元模拟账户索引 (通常是 accIndex=1)
  FUTU_US_ACC_INDEX: z.coerce.number().default(0),
  // 是否使用美元账户
  FUTU_USE_US_ACCOUNT: z.coerce.boolean().default(false),
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
  FINNHUB_API_KEY: z.string().optional(),
  FRED_API_KEY: z.string().optional(),

  // 外部 MCP 资讯源（设置后自动注册为 priority=50 的 MCP adapter）
  MCP_NEWS_SERVER: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().url().optional(),
  ),
  MCP_NEWS_TOOL: z.string().default('fetch_news'),

  // 监控标的（逗号分隔，支持通过环境变量覆盖）
  NEWS_SYMBOLS_US: z.string()
    .default('AAPL,GOOGL,MSFT,TSLA,NVDA,AMZN,META,NFLX,SPY,QQQ,IWM,AMD,INTC,COIN,SQ,PYPL,UBER,ABNB,COST,AVGO,ORCL,CRM,ADBE,CSCO,PEP,MCD,NKE,UNH,JPM,BAC,GS,V,WFC,C,JPM,JNJU,BA,GE,MMM,CAT,XOM,CVX,PFE,MRK,ABT,TMO,DHR,UNP,LMT,NOC')
    .transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),
  NEWS_SYMBOLS_HK: z.string()
    .default('0700.HK,9988.HK,3690.HK,1299.HK,2318.HK,0941.HK,0388.HK,1810.HK,9618.HK,1024.HK,00267.HK,00175.HK,02219.HK,00101.HK,01093.HK,06878.HK,00001.HK,02318.HK,02333.HK,00981.HK,00939.HK,03988.HK,01336.HK,01810.HK,02647.HK,00119.HK,01169.HK,00388.HK,01928.HK,06098.HK,00883.HK,00151.HK,01833.HK,03968.HK,02570.HK,02588.HK')
    .transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),

  // 默认券商
  PREFERRED_BROKER: z.enum(['futu', 'longbridge']).default('longbridge'),

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
