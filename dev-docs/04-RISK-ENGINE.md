# 04 — 风控引擎

---

## 风控规则定义

```typescript
// src/services/risk/engine.ts

export const RISK_LIMITS_BY_PREFERENCE = {
  conservative: { singlePositionLimit: 10, totalPositionLimit: 60, singleOrderLimit: 5 },
  balanced:     { singlePositionLimit: 20, totalPositionLimit: 80, singleOrderLimit: 10 },
  aggressive:   { singlePositionLimit: 30, totalPositionLimit: 95, singleOrderLimit: 20 },
};

export type RiskStatus = 'pass' | 'warning' | 'blocked';

export interface RiskCheckInput {
  user: User;
  symbol: string;
  market: string;
  suggestedPositionPct: number;
  accountSnapshot: AccountSnapshot;        // 富途持仓快照
  manualPositions: ManualPosition[];       // 用户手动填写的其他平台持仓
}

export interface RiskCheckResult {
  status: RiskStatus;
  currentSinglePositionPct: number;        // 当前该标的持仓占比
  projectedSinglePositionPct: number;      // 下单后预计占比
  currentTotalPositionPct: number;         // 当前总仓位占比
  projectedTotalPositionPct: number;       // 下单后预计总仓位占比
  availableCash: number;
  singlePositionLimit: number;
  totalPositionLimit: number;
  warningMessages: string[];
  blockReasons: string[];
  dataSource: 'live' | 'cache';
  checkedAt: Date;
  coverageNote: string;                    // "风控仅覆盖富途账户，请手动确认其他平台仓位"
}
```

---

## 核心风控检查逻辑

```typescript
export async function checkRisk(input: RiskCheckInput): Promise<RiskCheckResult> {
  const { user, symbol, market, suggestedPositionPct, accountSnapshot, manualPositions } = input;

  const limits = getRiskLimits(user);
  const warningMessages: string[] = [];
  const blockReasons: string[] = [];

  // 合并持仓：富途 + 用户手动填写
  const allPositions = mergePositions(accountSnapshot.positions, manualPositions);
  const totalAssets = accountSnapshot.totalAssets;

  // 计算当前该标的持仓占比
  const currentSymbolPosition = allPositions.find(
    p => p.symbol === symbol && p.market === market
  );
  const currentSinglePositionPct = currentSymbolPosition
    ? (currentSymbolPosition.marketValue / totalAssets) * 100
    : 0;

  // 计算下单后预计占比（简化：假设以当前价买入 suggestedPositionPct 仓位）
  const orderValue = totalAssets * (suggestedPositionPct / 100);
  const projectedSinglePositionPct = currentSinglePositionPct +
    (orderValue / totalAssets * 100);

  // 当前总仓位
  const currentTotalPositionPct = allPositions.reduce(
    (sum, p) => sum + (p.marketValue / totalAssets * 100), 0
  );
  const projectedTotalPositionPct = currentTotalPositionPct + suggestedPositionPct;

  // 可用资金
  const availableCash = accountSnapshot.availableCash;
  const requiredCash = totalAssets * (suggestedPositionPct / 100);

  // ---- 风控规则检查 ----

  // 规则1：单标的上限
  if (projectedSinglePositionPct > limits.singlePositionLimit) {
    if (currentSinglePositionPct >= limits.singlePositionLimit) {
      // 已经超出，拦截
      blockReasons.push(
        `${symbol}当前持仓${currentSinglePositionPct.toFixed(1)}%，已达单标的上限${limits.singlePositionLimit}%`
      );
    } else {
      // 下单后会超出，警告
      warningMessages.push(
        `确认后${symbol}将达${projectedSinglePositionPct.toFixed(1)}%，超出上限${limits.singlePositionLimit}%`
      );
    }
  }

  // 规则2：总仓位上限
  if (projectedTotalPositionPct > limits.totalPositionLimit) {
    if (currentTotalPositionPct >= limits.totalPositionLimit) {
      blockReasons.push(
        `当前总仓位${currentTotalPositionPct.toFixed(1)}%，已达上限${limits.totalPositionLimit}%`
      );
    } else {
      warningMessages.push(
        `确认后总仓位将达${projectedTotalPositionPct.toFixed(1)}%，超出上限${limits.totalPositionLimit}%`
      );
    }
  }

  // 规则3：可用资金检查
  if (requiredCash > availableCash) {
    blockReasons.push(
      `可用资金不足，需要约$${requiredCash.toFixed(0)}，当前可用$${availableCash.toFixed(0)}`
    );
  }

  // 确定最终状态
  let status: RiskStatus;
  if (blockReasons.length > 0) {
    status = 'blocked';
  } else if (warningMessages.length > 0) {
    status = 'warning';
  } else {
    status = 'pass';
  }

  return {
    status,
    currentSinglePositionPct,
    projectedSinglePositionPct,
    currentTotalPositionPct,
    projectedTotalPositionPct,
    availableCash,
    singlePositionLimit: limits.singlePositionLimit,
    totalPositionLimit: limits.totalPositionLimit,
    warningMessages,
    blockReasons,
    dataSource: accountSnapshot.source,
    checkedAt: new Date(),
    coverageNote: '风控仅覆盖富途账户，如您在其他平台持有相同标的，请在确认前手动核查总仓位',
  };
}
```

---

## 持仓合并逻辑

```typescript
function mergePositions(
  futuPositions: Position[],
  manualPositions: ManualPosition[]
): Position[] {
  const merged = [...futuPositions];

  for (const manual of manualPositions) {
    // 检查手动填写的持仓是否更新超过24小时
    const hoursOld = (Date.now() - manual.updatedAt.getTime()) / 3600000;
    if (hoursOld > 24) {
      // 超过24小时的手动持仓忽略，但记录警告
      console.warn(`User manual position for ${manual.symbol} is ${hoursOld.toFixed(0)}h old, skipping`);
      continue;
    }

    const existing = merged.find(
      p => p.symbol === manual.symbol && p.market === manual.market
    );

    if (existing) {
      // 相同标的合并市值（富途 + 其他平台）
      existing.marketValue += manual.quantity * (manual.avgCost ?? 0);
    } else {
      merged.push({
        symbol: manual.symbol,
        market: manual.market as any,
        quantity: manual.quantity,
        marketValue: manual.quantity * (manual.avgCost ?? 0),
        positionPct: 0, // 后续重算
      });
    }
  }

  return merged;
}
```

---

## 持仓缓存管理

```typescript
// src/services/futu/position.ts

const POSITION_CACHE_TTL = 60; // 60秒

// 获取持仓（优先缓存，缓存失效则实时拉取）
export async function getAccountSnapshot(
  userId: string,
  broker: string,
  forceRefresh = false
): Promise<AccountSnapshot> {
  const cacheKey = `position:cache:${userId}:${broker}`;

  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const snapshot = JSON.parse(cached) as AccountSnapshot;
      snapshot.source = 'cache';
      return snapshot;
    }
  }

  // 实时拉取
  const snapshot = await fetchLivePositions(userId, broker);
  snapshot.source = 'live';

  // 写入缓存
  await redis.setEx(cacheKey, POSITION_CACHE_TTL, JSON.stringify(snapshot));

  return snapshot;
}

// 下单前强制实时拉取（二次验证，不用缓存）
export async function getAccountSnapshotForOrder(
  userId: string,
  broker: string
): Promise<AccountSnapshot> {
  return getAccountSnapshot(userId, broker, true); // forceRefresh = true
}

// 下单成功后立即更新缓存
export async function invalidatePositionCache(userId: string, broker: string) {
  const cacheKey = `position:cache:${userId}:${broker}`;
  await redis.del(cacheKey);
  // 下次读取时会实时拉取
}
```

---

## BTC 专属风控规则

```typescript
// BTC 特殊处理：仓位计算独立，置信度门槛更高
export function getBTCRiskConfig() {
  return {
    confidenceThreshold: 80,           // BTC 置信度要求更高
    maxSignalsPerDay: 6,               // 每天最多6条（每4小时1条）
    positionCalculationMode: 'separate', // 与股票仓位分开计算
  };
}

// BTC 持仓单独计算，不与股票合并
export function calculateBTCPositionPct(
  btcPositions: Position[],
  totalAssets: number
): number {
  return btcPositions
    .filter(p => p.market === 'btc')
    .reduce((sum, p) => sum + (p.marketValue / totalAssets * 100), 0);
}
```
