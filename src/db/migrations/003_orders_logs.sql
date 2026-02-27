-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES signal_deliveries(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  broker VARCHAR(20) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  
  -- 价格
  reference_price DECIMAL(18,6),
  executed_price DECIMAL(18,6),
  
  -- 状态: pending | submitted | filled | partial_filled | failed | cancelled
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- 富途返回的订单 ID
  broker_order_id VARCHAR(100),
  
  -- 失败信息
  failure_type VARCHAR(50),
  failure_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- 下单前的二次风控验证结果快照
  pre_order_risk_check JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_id);

-- 风控覆盖日志
CREATE TABLE IF NOT EXISTS risk_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  delivery_id UUID NOT NULL REFERENCES signal_deliveries(id),
  
  override_type VARCHAR(50) NOT NULL,
  original_risk_status VARCHAR(20),
  
  -- 风控参数快照
  risk_snapshot JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI 成本日志
CREATE TABLE IF NOT EXISTS ai_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  call_type VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  estimated_cost_usd DECIMAL(10,6) NOT NULL,
  
  news_item_id UUID REFERENCES news_items(id),
  user_id UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_logs_date ON ai_cost_logs(created_at);

