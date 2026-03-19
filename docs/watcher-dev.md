# 实时看盘服务开发文档

## 一、需求概述

开发一套实时看盘服务，实现：
1. **实时行情监控** - 通过富途 WebSocket 获取美股实时价格
2. **技术指标计算** - 使用 pandas-ta 计算 RSI、MACD、均线等
3. **条件告警** - 监控涨跌幅、均线突破、技术形态等
4. **飞书推送** - 实时推送告警通知给用户

---

## 二、技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         富途牛牛                                  │
│                   (WebSocket 实时行情)                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MarketPlayer 系统                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ 行情订阅    │  │ 指标计算    │  │ 告警检测                │  │
│  │ (futu-api) │─▶│ (pandas-ta) │─▶│ (规则引擎)              │  │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘  │
│                                                │                │
│                        ┌────────────────────────┘                │
│                        ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    飞书通知服务                               ││
│  │              (webhook 卡片消息)                               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、技术选型

| 模块 | 技术方案 | 说明 |
|------|----------|------|
| 实时行情 | **futu-api** | 已安装，支持 WebSocket 实时推送 |
| 技术指标 | **pandas-ta** | 150+指标，纯 Python 易安装 |
| 规则引擎 | 自研 | 支持涨跌幅、均线、RSI、MACD 等 |
| 消息推送 | **飞书 Webhook** | 已集成，支持卡片消息 |
| 后端服务 | Node.js/TypeScript | 现有项目 |

---

## 四、现有代码结构

```
src/services/
├── futu/                    # 富途交易服务
│   ├── api.ts              # API 调用
│   ├── connection.ts       # 连接管理
│   ├── order.ts            # 下单
│   ├── position.ts         # 持仓查询
│   └── python-api.ts      # Python API 封装
│
├── market/                 # 市场数据服务
│   ├── watcher/            # 看盘服务 (待开发)
│   │   ├── index.ts        # 入口
│   │   ├── detector.ts     # 告警检测
│   │   ├── notifier.ts     # 通知发送
│   │   └── database.ts    # 数据库
│   ├── quote-service.ts   # 行情服务
│   └── price-alert.ts     # 价格提醒
│
└── notify/                 # 通知服务
    └── feishu-bot.ts      # 飞书机器人
```

---

## 五、核心模块设计

### 5.1 行情订阅模块 (MarketWatcher)

```typescript
// src/services/market/watcher/market-feed.ts

interface MarketFeedConfig {
  symbols: string[];        // 订阅股票列表
  onPriceUpdate: (quote: Quote) => void;
  onError: (error: Error) => void;
}

interface Quote {
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: Date;
}
```

**功能**:
- 连接富途 WebSocket
- 订阅/取消订阅股票行情
- 解析行情数据
- 自动重连

### 5.2 指标计算模块 (IndicatorEngine)

```typescript
// src/services/market/watcher/indicators.ts

interface IndicatorConfig {
  symbol: string;
  period: '1min' | '5min' | '15min' | '1hour' | '1day';
  indicators: Array<{
    name: 'RSI' | 'MACD' | 'MA' | 'EMA' | 'BOLL';
    params?: Record<string, number>;
  }>;
}

interface IndicatorResult {
  symbol: string;
  timestamp: Date;
  values: {
    rsi?: number;
    macd?: { line: number; signal: number; histogram: number };
    ma5?: number;
    ma20?: number;
    ma60?: number;
    boll?: { upper: number; middle: number; lower: number };
  };
}
```

**支持指标**:
- RSI (相对强弱指数)
- MACD (指数平滑异同移动平均线)
- MA/EMA (移动平均线)
- BOLL (布林带)
- KDJ、威廉指标等

### 5.3 告警检测模块 (AlertDetector)

```typescript
// src/services/market/watcher/detector.ts

interface WatchRule {
  id: number;
  userId: string;
  symbol: string;
  conditions: AlertCondition[];
  enabled: boolean;
}

interface AlertCondition {
  type: 'price_change' | 'rsi_overbought' | 'rsi_oversold' | 
        'ma_cross' | 'volume_surge' | 'breakout';
  threshold: number;           // 阈值
  direction?: 'above' | 'below';
}

interface WatchAlert {
  id: string;
  ruleId: number;
  symbol: string;
  type: string;
  message: string;
  value: number;
  timestamp: Date;
}
```

**告警类型**:

| 类型 | 说明 | 触发条件 |
|------|------|----------|
| `price_change` | 涨跌幅告警 | 涨跌幅超过阈值 |
| `rsi_overbought` | RSI 超买 | RSI > 70 |
| `rsi_oversold` | RSI 超卖 | RSI < 30 |
| `ma_cross` | 均线金叉/死叉 | MA5 上穿/下穿 MA20 |
| `volume_surge` | 成交量异动 | 成交量放大 N 倍 |
| `breakout` | 突破告警 | 突破前期高点/低点 |

### 5.4 通知模块 (Notifier)

```typescript
// src/services/market/watcher/notifier.ts

interface NotificationPayload {
  title: string;
  content: string;
  symbol?: string;
  alertType: string;
  timestamp: Date;
  actions?: Array<{
    type: 'buy' | 'sell' | 'dismiss';
    label: string;
    value: string;
  }>;
}
```

---

## 六、数据流设计

```
富途WebSocket
      │
      ▼
┌─────────────────┐
│   MarketFeed    │  解析行情数据
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Price Cache   │  内存缓存 (Redis)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│指标计算│ │条件检测│
│ (ta)  │ │ (规则) │
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│  AlertQueue     │  告警队列
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Feishu Bot     │  飞书推送
└─────────────────┘
```

---

## 七、API 接口设计

### 7.1 用户看盘配置

```typescript
// POST /api/watcher/subscribe
{
  "symbols": ["US.TSLA", "US.AAPL", "US.NVDA"],
  "alerts": [
    {
      "type": "price_change",
      "threshold": 5,        // 5%
      "direction": "both"
    },
    {
      "type": "rsi_oversold",
      "threshold": 30
    }
  ]
}

// GET /api/watcher/status
{
  "watching": ["US.TSLA", "US.AAPL"],
  "alerts_today": 5,
  "last_alert": "2026-03-18T22:30:00Z"
}
```

### 7.2 告警历史

```typescript
// GET /api/watcher/alerts?limit=20
{
  "alerts": [
    {
      "id": "alert_001",
      "symbol": "US.TSLA",
      "type": "price_change",
      "message": "TSLA 涨幅达 5.2%",
      "value": 5.2,
      "timestamp": "2026-03-18T22:30:00Z"
    }
  ]
}
```

---

## 八、配置文件

```typescript
// src/config/watcher.ts

export const watcherConfig = {
  // 行情刷新间隔 (毫秒)
  refreshInterval: 1000,
  
  // 指标计算周期
  indicatorPeriods: ['1min', '5min', '15min', '1hour', '1day'],
  
  // 告警冷却时间 (秒) - 避免同一标的重复告警
  alertCooldown: 300,
  
  // 最大同时监控标的数
  maxWatchSymbols: 50,
  
  // 飞书通知开关
  feishuNotify: true,
  
  // 告警级别
  alertLevels: {
    urgent: ['price_change'],    // 立即推送
    normal: ['rsi_overbought'],  // 批量推送
    info: ['ma_cross']           // 仅记录
  }
};
```

---

## 九、开发计划

### Phase 1: 基础功能
- [ ] 富途 WebSocket 行情订阅
- [ ] 实时价格缓存
- [ ] 基础涨跌幅告警

### Phase 2: 技术指标
- [ ] pandas-ta 集成
- [ ] RSI/MACD/均线计算
- [ ] 技术指标告警

### Phase 3: 高级功能
- [ ] 均线金叉/死叉检测
- [ ] 成交量异动检测
- [ ] 飞书卡片消息优化

### Phase 4: 优化
- [ ] 性能优化 (批量处理)
- [ ] 告警去重
- [ ] 历史记录查询

---

## 十、参考资源

- [futu-api 文档](https://github.com/FutunnOpen/futu-api-python)
- [pandas-ta 文档](https://twopirllc.github.io/pandas-ta/)
- [飞书 Webhook](https://open.feishu.cn/document/ukTMukTMukTM/uADOwUjLwgDM14CM4ATN)

---

## 十一、注意事项

1. **富途 WebSocket 限制**: 每个连接最多订阅 500 只股票
2. **行情延迟**: 模拟账户可能有延迟
3. **API 限流**: 注意请求频率限制
4. **飞书限制**: 每分钟最多 20 条消息

---

*文档版本: 1.0*  
*创建时间: 2026-03-18*
