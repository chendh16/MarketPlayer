/**
 * 仓位管理服务
 * 智能仓位计算、风险控制
 */

import { logger } from '../../utils/logger';

export interface PositionConfig {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  totalValue: number;
  profit: number;
  profitPct: number;
  weight: number;
}

export interface AccountOverview {
  totalValue: number;
  cash: number;
  positions: PositionConfig[];
  positionCount: number;
  profit: number;
  profitPct: number;
}

const positions: Map<string, PositionConfig> = new Map();
let cash = 1000000;

export function initPositionManager(initialCash: number = 1000000): void {
  cash = initialCash;
  positions.clear();
  logger.info(`[Position] 初始化，现金: ${cash}`);
}

export function setCash(newCash: number): void {
  cash = newCash;
}

export function getCash(): number {
  return cash;
}

export function buy(symbol: string, market: 'a' | 'hk' | 'us', price: number, amount: number): {success: boolean; message: string} {
  const cost = price * amount;
  if (cost > cash) return { success: false, message: `资金不足` };
  
  const key = `${market}-${symbol}`;
  const existing = positions.get(key);
  
  if (existing) {
    const totalCost = existing.avgPrice * existing.quantity + cost;
    existing.avgPrice = totalCost / (existing.quantity + amount);
    existing.quantity += amount;
    existing.currentPrice = price;
  } else {
    positions.set(key, { symbol, market, quantity: amount, avgPrice: price, currentPrice: price, totalValue: cost, profit: 0, profitPct: 0, weight: 0 });
  }
  cash -= cost;
  return { success: true, message: `买入${symbol} ${amount}股` };
}

export function sell(symbol: string, market: 'a' | 'hk' | 'us', price: number, amount: number): {success: boolean; message: string} {
  const key = `${market}-${symbol}`;
  const existing = positions.get(key);
  if (!existing) return { success: false, message: '持仓不存在' };
  if (amount > existing.quantity) return { success: false, message: '持仓不足' };
  
  cash += price * amount;
  if (amount === existing.quantity) {
    positions.delete(key);
  } else {
    existing.quantity -= amount;
    existing.currentPrice = price;
  }
  return { success: true, message: `卖出${symbol} ${amount}股` };
}

export function getAccountOverview(): AccountOverview {
  let totalValue = 0;
  const posList: PositionConfig[] = [];
  
  for (const pos of positions.values()) {
    pos.totalValue = pos.currentPrice * pos.quantity;
    pos.profit = (pos.currentPrice - pos.avgPrice) * pos.quantity;
    pos.profitPct = ((pos.currentPrice - pos.avgPrice) / pos.avgPrice) * 100;
    totalValue += pos.totalValue;
    posList.push(pos);
  }
  
  for (const pos of posList) {
    pos.weight = totalValue > 0 ? (pos.totalValue / totalValue) * 100 : 0;
  }
  
  const total = cash + totalValue;
  return { totalValue: total, cash, positions: posList, positionCount: positions.size, profit: total - 1000000, profitPct: (total - 1000000) / 1000000 * 100 };
}

export function suggestPosition(symbol: string, price: number, riskLevel: 'low' | 'medium' | 'high' = 'medium'): {maxShares: number; suggestedShares: number; positionRatio: number; risk: string} {
  const account = getAccountOverview();
  const ratios = { low: 0.1, medium: 0.2, high: 0.3 };
  const ratio = ratios[riskLevel];
  const max = Math.floor(account.totalValue * ratio / price);
  return { maxShares: max, suggestedShares: Math.floor(max * 0.8), positionRatio: ratio * 100, risk: `${riskLevel}风险` };
}

export function suggestRebalance(targetWeights: Record<string, number>): {actions: Array<{symbol: string; action: 'buy' | 'sell' | 'hold'; shares: number; reason: string}>} {
  const account = getAccountOverview();
  const actions: Array<{symbol: string; action: 'buy' | 'sell' | 'hold'; shares: number; reason: string}> = [];
  const current: Record<string, number> = {};
  for (const p of account.positions) current[p.symbol] = p.weight;
  
  for (const [sym, tw] of Object.entries(targetWeights)) {
    const cw = current[sym] || 0;
    const diff = tw - cw;
    if (diff > 5) actions.push({ symbol: sym, action: 'buy', shares: Math.floor(account.totalValue * diff / 100 / 100), reason: `权重+${diff.toFixed(1)}%` });
    else if (diff < -5) actions.push({ symbol: sym, action: 'sell', shares: Math.floor(account.totalValue * Math.abs(diff) / 100 / 100), reason: `权重${diff.toFixed(1)}%` });
    else actions.push({ symbol: sym, action: 'hold', shares: 0, reason: '合适' });
  }
  return { actions };
}

export function checkRisk(): {warnings: string[]; passed: boolean} {
  const account = getAccountOverview();
  const warnings: string[] = [];
  const posRatio = (account.totalValue - account.cash) / account.totalValue * 100;
  if (posRatio > 80) warnings.push(`仓位过重${posRatio.toFixed(1)}%`);
  for (const p of account.positions) if (p.weight > 30) warnings.push(`${p.symbol}仓位过重${p.weight.toFixed(1)}%`);
  if (account.cash / account.totalValue < 0.1) warnings.push('现金不足');
  return { warnings, passed: warnings.length === 0 };
}
