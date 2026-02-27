import { Position, AccountSnapshot } from '../../models/position';
import { ManualPosition, User, getRiskLimits } from '../../models/user';
import { RiskCheckResult } from '../../models/signal';
import { logger } from '../../utils/logger';

export interface RiskCheckInput {
  user: User;
  symbol: string;
  market: string;
  suggestedPositionPct: number;
  accountSnapshot: AccountSnapshot;
  manualPositions: ManualPosition[];
}

// 合并持仓：富途 + 用户手动填写
function mergePositions(
  futuPositions: Position[],
  manualPositions: ManualPosition[]
): Position[] {
  const merged = [...futuPositions];
  
  for (const manual of manualPositions) {
    // 检查手动填写的持仓是否更新超过24小时
    const hoursOld = (Date.now() - manual.updatedAt.getTime()) / 3600000;
    if (hoursOld > 24) {
      logger.warn(`User manual position for ${manual.symbol} is ${hoursOld.toFixed(0)}h old, skipping`);
      continue;
    }
    
    const existing = merged.find(
      p => p.symbol === manual.symbol && p.market === manual.market
    );
    
    if (existing) {
      // 相同标的合并市值
      existing.marketValue += manual.quantity * (manual.avgCost ?? 0);
    } else {
      merged.push({
        symbol: manual.symbol,
        market: manual.market as any,
        quantity: manual.quantity,
        marketValue: manual.quantity * (manual.avgCost ?? 0),
        positionPct: 0,
      });
    }
  }
  
  return merged;
}

export async function checkRisk(input: RiskCheckInput): Promise<RiskCheckResult> {
  const { user, symbol, market, suggestedPositionPct, accountSnapshot, manualPositions } = input;
  
  const limits = getRiskLimits(user);
  const warningMessages: string[] = [];
  const blockReasons: string[] = [];
  
  // 合并持仓
  const allPositions = mergePositions(accountSnapshot.positions, manualPositions);
  const totalAssets = accountSnapshot.totalAssets;
  
  // 计算当前该标的持仓占比
  const currentSymbolPosition = allPositions.find(
    p => p.symbol === symbol && p.market === market
  );
  const currentSinglePositionPct = currentSymbolPosition
    ? (currentSymbolPosition.marketValue / totalAssets) * 100
    : 0;
  
  // 计算下单后预计占比
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
      blockReasons.push(
        `${symbol}当前持仓${currentSinglePositionPct.toFixed(1)}%，已达单标的上限${limits.singlePositionLimit}%`
      );
    } else {
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
  let status: 'pass' | 'warning' | 'blocked';
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

