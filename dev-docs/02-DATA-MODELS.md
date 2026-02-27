# 02 — 数据模型 & 数据库 Schema

---

## PostgreSQL 表结构

### users（用户表）

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id VARCHAR(32) UNIQUE NOT NULL,
  discord_username VARCHAR(100) NOT NULL,
  
  -- 风险偏好: conservative | balanced | aggressive
  risk_preference VARCHAR(20) NOT NULL DEFAULT 'balanced',
  
  -- 自定义风控参数（NULL 则使用风险偏好默认值）
  custom_single_position_limit DECIMAL(5,2),  -- 单标的上限 %
  custom_total_position_limit DECIMAL(5,2),   -- 总仓位上限 %
  custom_single_order_limit DECIMAL(5,2),     -- 单次下单上限 %
  
  -- 每日推送上限
  daily_signal_limit INT NOT NULL DEFAULT 20,
  
  -- 风险协议
  risk_agreement_signed BOOLEAN NOT NULL DEFAULT FALSE,
  risk_agreement_signed_at TIMESTAMPTZ,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### broker_accounts（券商账户绑定表）

```sql
CREATE TABLE broker_accounts (
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
```

### manual_positions（用户手动填写的其他平台持仓）

```sql
CREATE TABLE manual_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  symbol VARCHAR(20) NOT NULL,      -- 标的代码，如 NVDA, 00700.HK
  market VARCHAR(10) NOT NULL,      -- us | hk | a | btc
  quantity DECIMAL(18,6) NOT NULL,
  avg_cost DECIMAL(18,6),
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, symbol, market)
);
```

### news_items（资讯表）

```sql
CREATE TABLE news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 原始资讯
  source VARCHAR(50) NOT NULL,         -- yahoo_finance | east_money | etc
  external_id VARCHAR(200),            -- 原始 ID，用于去重
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  
  -- 分类
  market VARCHAR(10) NOT NULL,         -- us | hk | a | btc
  symbols TEXT[],                      -- 相关标的，如 ['NVDA', 'AMD']
  trigger_type VARCHAR(50),            -- earnings | policy | anomaly | rating | macro | event | chain
  
  -- AI 处理结果
  ai_summary TEXT,                     -- 中文摘要
  ai_impact_analysis TEXT,             -- 市场影响分析
  ai_processed BOOLEAN DEFAULT FALSE,
  ai_processed_at TIMESTAMPTZ,
  
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(source, external_id)
);

CREATE INDEX idx_news_market ON news_items(market);
CREATE INDEX idx_news_published ON news_items(published_at DESC);
CREATE INDEX idx_news_symbols ON news_items USING gin(symbols);
```

### signals（AI 信号参考表）

```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id UUID REFERENCES news_items(id),
  
  -- 信号内容
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,
  direction VARCHAR(10) NOT NULL,        -- long | short
  confidence DECIMAL(5,2) NOT NULL,      -- 0-100
  suggested_position_pct DECIMAL(5,2),   -- 建议仓位 %
  reasoning TEXT NOT NULL,               -- AI 决策依据
  
  -- 状态: generated | sent | expired | cancelled
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL  -- 一般为 created_at + 4小时（市场开盘重推前）
);

CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_status ON signals(status);
```

### signal_deliveries（信号推送记录表 — 每个用户一条）

```sql
CREATE TABLE signal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- 推送到 Discord 的消息 ID（用于后续编辑消息状态）
  discord_message_id VARCHAR(32),
  discord_channel_id VARCHAR(32),
  
  -- 唯一下单 Token（幂等性保障）
  order_token UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- 风控快照（推送时刻的持仓状态）
  risk_check_result JSONB NOT NULL,
  -- {
  --   status: 'pass' | 'warning' | 'blocked',
  --   single_position_pct: 15.5,
  --   total_position_pct: 65.0,
  --   available_cash: 48000,
  --   warning_messages: [],
  --   data_source: 'futu_cache',
  --   checked_at: '2026-02-27T10:00:00Z'
  -- }
  
  -- 状态: pending | confirmed | ignored | expired | order_placed | order_failed | completed
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- 用户操作记录
  confirmed_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  
  -- 用户是否忽略了风控警告（审计用）
  override_risk_warning BOOLEAN DEFAULT FALSE,
  override_risk_warning_at TIMESTAMPTZ,
  
  -- 调整后的仓位（用户自定义）
  adjusted_position_pct DECIMAL(5,2),
  
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(signal_id, user_id),
  UNIQUE(order_token)
);

CREATE INDEX idx_deliveries_user ON signal_deliveries(user_id);
CREATE INDEX idx_deliveries_status ON signal_deliveries(status);
CREATE INDEX idx_deliveries_token ON signal_deliveries(order_token);
```

### orders（下单记录表）

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES signal_deliveries(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  broker VARCHAR(20) NOT NULL,           -- futu | longbridge
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,
  direction VARCHAR(10) NOT NULL,        -- buy | sell
  quantity DECIMAL(18,6) NOT NULL,
  
  -- 价格
  reference_price DECIMAL(18,6),        -- 信号生成时的参考价
  executed_price DECIMAL(18,6),         -- 实际成交价
  
  -- 状态: pending | submitted | filled | partial_filled | failed | cancelled
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- 富途返回的订单 ID
  broker_order_id VARCHAR(100),
  
  -- 失败信息
  failure_type VARCHAR(50),             -- retryable | price_deviation | insufficient_funds | system_error
  failure_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- 下单前的二次风控验证结果快照
  pre_order_risk_check JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery ON orders(delivery_id);
```

### risk_override_logs（风控覆盖日志 — 审计表）

```sql
CREATE TABLE risk_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  delivery_id UUID NOT NULL REFERENCES signal_deliveries(id),
  
  override_type VARCHAR(50) NOT NULL,   -- ignore_warning | adjust_limit | force_order
  original_risk_status VARCHAR(20),     -- warning | blocked
  
  -- 风控参数快照
  risk_snapshot JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### ai_cost_logs（AI 调用成本日志）

```sql
CREATE TABLE ai_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  call_type VARCHAR(50) NOT NULL,        -- summary | analysis | signal | confidence | personalized
  model VARCHAR(50) NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  estimated_cost_usd DECIMAL(10,6) NOT NULL,
  
  news_item_id UUID REFERENCES news_items(id),
  user_id UUID REFERENCES users(id),    -- NULL 表示非个性化调用
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_logs_date ON ai_cost_logs(created_at);
```

---

## TypeScript 数据模型

```typescript
// src/models/user.ts
export interface User {
  id: string;
  discordUserId: string;
  discordUsername: string;
  riskPreference: 'conservative' | 'balanced' | 'aggressive';
  customSinglePositionLimit?: number;
  customTotalPositionLimit?: number;
  customSingleOrderLimit?: number;
  dailySignalLimit: number;
  riskAgreementSigned: boolean;
  isActive: boolean;
}

// 根据风险偏好返回仓位限制
export function getRiskLimits(user: User): RiskLimits {
  if (user.customSinglePositionLimit) {
    return {
      singlePositionLimit: user.customSinglePositionLimit,
      totalPositionLimit: user.customTotalPositionLimit!,
      singleOrderLimit: user.customSingleOrderLimit!,
    };
  }
  const defaults: Record<string, RiskLimits> = {
    conservative: { singlePositionLimit: 10, totalPositionLimit: 60, singleOrderLimit: 5 },
    balanced:     { singlePositionLimit: 20, totalPositionLimit: 80, singleOrderLimit: 10 },
    aggressive:   { singlePositionLimit: 30, totalPositionLimit: 95, singleOrderLimit: 20 },
  };
  return defaults[user.riskPreference];
}

export interface RiskLimits {
  singlePositionLimit: number;  // 单标的上限 %
  totalPositionLimit: number;   // 总仓位上限 %
  singleOrderLimit: number;     // 单次下单上限 %
}
```

```typescript
// src/models/signal.ts
export interface Signal {
  id: string;
  newsItemId?: string;
  symbol: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  direction: 'long' | 'short';
  confidence: number;           // 0-100
  suggestedPositionPct: number;
  reasoning: string;
  status: 'generated' | 'sent' | 'expired' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}

export interface SignalDelivery {
  id: string;
  signalId: string;
  userId: string;
  discordMessageId?: string;
  discordChannelId?: string;
  orderToken: string;
  riskCheckResult: RiskCheckResult;
  status: DeliveryStatus;
  confirmedAt?: Date;
  ignoredAt?: Date;
  expiredAt?: Date;
  overrideRiskWarning: boolean;
  adjustedPositionPct?: number;
  sentAt: Date;
}

export type DeliveryStatus =
  | 'pending'
  | 'confirmed'
  | 'ignored'
  | 'expired'
  | 'order_placed'
  | 'order_failed'
  | 'completed';
```

```typescript
// src/models/position.ts
export interface Position {
  symbol: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  quantity: number;
  marketValue: number;      // 当前市值（港元/美元）
  positionPct: number;      // 占总资产百分比
}

export interface AccountSnapshot {
  broker: string;
  totalAssets: number;
  availableCash: number;
  positions: Position[];
  totalPositionPct: number;
  fetchedAt: Date;
  source: 'live' | 'cache';  // live=实时拉取, cache=缓存
}
```

```typescript
// src/models/risk.ts
export interface RiskCheckResult {
  status: 'pass' | 'warning' | 'blocked';
  currentSinglePositionPct: number;
  projectedSinglePositionPct: number;
  currentTotalPositionPct: number;
  projectedTotalPositionPct: number;
  availableCash: number;
  singlePositionLimit: number;
  totalPositionLimit: number;
  warningMessages: string[];
  blockReasons: string[];
  dataSource: 'live' | 'cache';
  checkedAt: Date;
  // 仅覆盖富途账户（MVP 阶段声明）
  coverageNote: string;
}
```

---

## Redis Key 设计

```
# 持仓缓存（60秒TTL）
position:cache:{userId}:{broker}  →  JSON(AccountSnapshot)

# 建议有效期追踪（15分钟TTL）
delivery:active:{deliveryId}  →  "1"

# OrderToken 去重（24小时TTL）
order:token:{orderToken}  →  "processed" | "processing"

# 用户今日推送计数（当日 23:59 过期）
user:daily:signals:{userId}:{date}  →  数字

# AI 调用今日计数
ai:daily:calls:{date}  →  数字

# 分布式锁（下单时）
lock:order:{userId}  →  锁标识（3秒TTL）

# Discord 故障标记
system:discord:down  →  "1"（故障时设置）
```
