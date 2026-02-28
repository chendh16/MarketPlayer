# 风控引擎模块

## 架构概览

```
src/services/risk/
└── engine.ts       # 风控检查核心逻辑
```

## 核心功能

### 风控检查 (`checkRisk`)

**输入**：
```typescript
{
  userId: string;
  symbol: string;
  market: string;
  direction: 'long' | 'short';
  positionPct: number;  // 建议仓位百分比
}
```

**输出**：
```typescript
{
  pass: boolean;                    // 是否通过
  warnings: string[];               // 警告信息
  currentSinglePositionPct: number; // 当前单标的仓位%
  currentTotalPositionPct: number;  // 当前总仓位%
  projectedTotalPositionPct: number;// 预计总仓位%
  availableCash: number;            // 可用资金
  coverageNote: string;             // 覆盖说明
}
```

## 风控规则

### 1. 单标的持仓限制

```typescript
const SINGLE_POSITION_LIMIT = 10;  // 单标的最多 10%
```

**检查逻辑**：
- 获取该标的当前持仓百分比
- 如果 `currentSinglePositionPct + positionPct > 10%`，不通过

### 2. 总仓位限制

```typescript
const TOTAL_POSITION_LIMIT = 80;  // 总仓位最多 80%
```

**检查逻辑**：
- 计算所有持仓的总百分比
- 如果 `currentTotalPositionPct + positionPct > 80%`，不通过

### 3. 可用资金检查

**检查逻辑**：
- 获取账户总资产
- 计算需要的资金：`totalAssets * positionPct / 100`
- 如果 `availableCash < requiredCash`，不通过

## 持仓数据来源

### 富途账户（自动）

```typescript
const snapshot = await getAccountSnapshot(userId);
// 实时查询富途 API 获取持仓
```

**包含**：
- 实时持仓
- 可用资金
- 总资产

### 其他平台（手动）

```typescript
const manualPositions = await getManualPositions(userId);
// 从 manual_positions 表读取
```

**用户需要手动录入**：
- 标的代码
- 持仓数量
- 成本价
- 当前市值

## 多平台持仓合并

```typescript
// 1. 富途持仓
const futuPositions = snapshot.positions;

// 2. 手动持仓
const manualPositions = await getManualPositions(userId);

// 3. 合并计算总仓位
const totalPositionPct = 
  futuPositions.reduce(...) + 
  manualPositions.reduce(...);
```

## 风控覆盖

管理员可以覆盖风控规则：

```typescript
await createRiskOverride({
  userId,
  signalId,
  reason: '特殊情况，手动批准',
  approvedBy: 'admin_user_id',
});
```

**记录到 `risk_override_logs` 表**，用于审计。

## 二次风控

订单执行前会再次检查：

```
用户点击确认
    ↓
一次风控（推送时）
    ↓
用户确认
    ↓
二次风控（执行前）← 防止持仓变化
    ↓
执行订单
```

## 配置

```bash
# 风控参数（未来可配置）
SINGLE_POSITION_LIMIT=10    # 单标的限制 10%
TOTAL_POSITION_LIMIT=80     # 总仓位限制 80%
MIN_AVAILABLE_CASH=1000     # 最小可用资金 $1000
```

## 扩展风控规则

在 `engine.ts` 中添加新规则：

```typescript
// 4. 新规则：单日交易次数限制
const dailyTradeCount = await getDailyTradeCount(userId);
if (dailyTradeCount >= 10) {
  warnings.push('今日交易次数已达上限');
  pass = false;
}
```

