-- 信号表
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id UUID REFERENCES news_items(id),
  
  -- 信号内容
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  confidence DECIMAL(5,2) NOT NULL,
  suggested_position_pct DECIMAL(5,2),
  reasoning TEXT NOT NULL,
  
  -- 状态: generated | sent | expired | cancelled
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);

-- 信号推送记录表
CREATE TABLE IF NOT EXISTS signal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- 推送到 Discord 的消息 ID
  discord_message_id VARCHAR(32),
  discord_channel_id VARCHAR(32),
  
  -- 唯一下单 Token（幂等性保障）
  order_token UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- 风控快照
  risk_check_result JSONB NOT NULL,
  
  -- 状态: pending | confirmed | ignored | expired | order_placed | order_failed | completed
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- 用户操作记录
  confirmed_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  
  -- 用户是否忽略了风控警告
  override_risk_warning BOOLEAN DEFAULT FALSE,
  override_risk_warning_at TIMESTAMPTZ,
  
  -- 调整后的仓位
  adjusted_position_pct DECIMAL(5,2),
  
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(signal_id, user_id),
  UNIQUE(order_token)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_user ON signal_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON signal_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_token ON signal_deliveries(order_token);

