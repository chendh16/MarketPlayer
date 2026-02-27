-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id VARCHAR(32) UNIQUE NOT NULL,
  discord_username VARCHAR(100) NOT NULL,
  
  -- 风险偏好: conservative | balanced | aggressive
  risk_preference VARCHAR(20) NOT NULL DEFAULT 'balanced',
  
  -- 自定义风控参数（NULL 则使用风险偏好默认值）
  custom_single_position_limit DECIMAL(5,2),
  custom_total_position_limit DECIMAL(5,2),
  custom_single_order_limit DECIMAL(5,2),
  
  -- 每日推送上限
  daily_signal_limit INT NOT NULL DEFAULT 20,
  
  -- 风险协议
  risk_agreement_signed BOOLEAN NOT NULL DEFAULT FALSE,
  risk_agreement_signed_at TIMESTAMPTZ,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 券商账户绑定表
CREATE TABLE IF NOT EXISTS broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- broker: futu | longbridge | a_stock
  broker VARCHAR(20) NOT NULL,
  
  -- 加密存储的 API 凭证（AES-256 加密）
  encrypted_credentials TEXT NOT NULL,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, broker)
);

-- 用户手动填写的其他平台持仓
CREATE TABLE IF NOT EXISTS manual_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  avg_cost DECIMAL(18,6),
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, symbol, market)
);

-- 资讯表
CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 原始资讯
  source VARCHAR(50) NOT NULL,
  external_id VARCHAR(200),
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  
  -- 分类
  market VARCHAR(10) NOT NULL,
  symbols TEXT[],
  trigger_type VARCHAR(50),
  
  -- AI 处理结果
  ai_summary TEXT,
  ai_impact_analysis TEXT,
  ai_processed BOOLEAN DEFAULT FALSE,
  ai_processed_at TIMESTAMPTZ,
  
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_news_market ON news_items(market);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_symbols ON news_items USING gin(symbols);

