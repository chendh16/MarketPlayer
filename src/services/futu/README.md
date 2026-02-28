# 富途 API 模块

## 架构概览

```
src/services/futu/
├── connection.ts   # 富途 API 连接管理
├── position.ts     # 持仓查询
└── order.ts        # 订单执行
```

## 订单执行方案

### Plan A：全自动下单（需要 futu-api）

```bash
npm install futu-api
```

**配置**：
```bash
FUTU_ORDER_MODE=A              # 全自动模式
FUTU_API_HOST=127.0.0.1
FUTU_API_PORT=11111
FUTU_TRD_ENV=SIMULATE          # SIMULATE | REAL
FUTU_TRADE_ACC_ID=your_acc_id
FUTU_TRADE_PASSWORD=your_pwd
```

**流程**：
```
用户确认
    ↓
连接富途 OpenD
    ↓
解锁交易账户
    ↓
下单（市价单/限价单）
    ↓
返回订单号
    ↓
更新订单状态
```

### Plan B：深链接跳转（推荐，无需权限）

```bash
FUTU_ORDER_MODE=B              # 深链接模式
FUTU_FALLBACK_TO_PLAN_B=true   # Plan A 失败时自动切换
```

**流程**：
```
用户确认
    ↓
生成富途 App 深链接
    ↓
Discord 消息显示链接
    ↓
用户点击跳转到富途 App
    ↓
手动确认下单
```

**深链接格式**：
```
futunn://trade?
  symbol=AAPL
  &market=US
  &action=BUY
  &quantity=10
  &price=150.00
```

### Plan C：纯文本指令（最简单）

```bash
FUTU_ORDER_MODE=C              # 纯文本模式
```

**输出**：
```
📋 交易指令

标的: AAPL (美股)
方向: 买入
数量: 10 股
参考价: $150.00
建议仓位: 5.0%
依据: AI 分析显示...

请复制后前往富途 App 手动执行
```

## 持仓查询

### 实时持仓 (`getAccountSnapshot`)

```typescript
const snapshot = await getAccountSnapshot(userId);
// {
//   totalAssets: 100000,
//   availableCash: 50000,
//   positions: [
//     { symbol: 'AAPL', quantity: 100, marketValue: 15000, ... }
//   ]
// }
```

**数据来源**：
- Plan A：富途 API 实时查询
- Plan B/C：返回空快照（使用手动持仓）

### 手动持仓

用户在 `manual_positions` 表中录入其他平台持仓：
```sql
INSERT INTO manual_positions (user_id, symbol, market, quantity, cost_price)
VALUES ('user_id', 'AAPL', 'us', 100, 145.50);
```

## 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `FUTU_ORDER_MODE` | A=全自动, B=深链接, C=纯文本 | B |
| `FUTU_TRD_ENV` | SIMULATE=模拟, REAL=真实 | SIMULATE |
| `FUTU_FALLBACK_TO_PLAN_B` | Plan A 失败时切换 Plan B | true |
| `FUTU_AUTO_UNLOCK` | 自动解锁交易账户 | true |
| `FUTU_ORDER_PRICE_SLIPPAGE_PCT` | 限价单滑点百分比 | 0.01 (1%) |

## 安全机制

### 1. 冷启动模式

```bash
COLD_START_MODE=true   # 禁用真实下单
```

测试期间建议开启，防止意外交易。

### 2. 模拟环境

```bash
FUTU_TRD_ENV=SIMULATE  # 使用富途模拟账户
```

### 3. 幂等性

每个订单有唯一 `orderToken`，防止重复下单：
```typescript
const existing = await getOrderByToken(orderToken);
if (existing) return;  // 已存在，跳过
```

### 4. 二次风控

执行前再次检查持仓和资金。

## 扩展其他券商

1. 创建新文件 `src/services/broker/xxx.ts`
2. 实现统一接口：
```typescript
interface BrokerAPI {
  gns(userId): Promise<Position[]>;
  placeOrder(order): Promise<OrderResult>;
  getOrderStatus(orderId): Promise<OrderStatus>;
}
```

3. 在 `order-queue.ts` 中根据券商类型调用对应 API

