/**
 * 仓位管理 MCP 工具
 */

import { logger } from '../../utils/logger';
import {
  initPositionManager,
  setCash,
  getCash,
  buy,
  sell,
  getAccountOverview,
  suggestPosition,
  suggestRebalance,
  checkRisk,
} from '../../services/risk/position-manager';

/**
 * 初始化账户
 */
export async function init_account(params: {
  initialCash?: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  initPositionManager(params.initialCash || 1000000);
  return { success: true, message: '账户已初始化' };
}

/**
 * 买入
 */
export async function position_buy(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  price: number;
  amount: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const { symbol, market, price, amount } = params;
  logger.info(`[MCP] position_buy ${symbol} ${amount} @ ${price}`);
  
  const result = buy(symbol, market, price, amount);
  return result;
}

/**
 * 卖出
 */
export async function position_sell(params: {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  price: number;
  amount: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const { symbol, market, price, amount } = params;
  logger.info(`[MCP] position_sell ${symbol} ${amount} @ ${price}`);
  
  const result = sell(symbol, market, price, amount);
  return result;
}

/**
 * 获取账户概览
 */
export async function get_account_overview(): Promise<{
  success: boolean;
  data: ReturnType<typeof getAccountOverview>;
}> {
  const data = getAccountOverview();
  return { success: true, data };
}

/**
 * 建议仓位
 */
export async function suggest_position(params: {
  symbol: string;
  price: number;
  riskLevel?: 'low' | 'medium' | 'high';
}): Promise<{
  success: boolean;
  suggestion: ReturnType<typeof suggestPosition>;
}> {
  const { symbol, price, riskLevel = 'medium' } = params;
  
  const suggestion = suggestPosition(symbol, price, riskLevel);
  return { success: true, suggestion };
}

/**
 * 调仓建议
 */
export async function rebalance_portfolio(params: {
  targetWeights: Record<string, number>;
}): Promise<{
  success: boolean;
  actions: Array<{
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    shares: number;
    reason: string;
  }>;
}> {
  const { targetWeights } = params;
  
  const result = suggestRebalance(targetWeights);
  return { success: true, ...result };
}

/**
 * 风控检查
 */
export async function risk_check(): Promise<{
  success: boolean;
  warnings: string[];
  passed: boolean;
}> {
  const result = checkRisk();
  return { success: true, ...result };
}

/**
 * 获取现金
 */
export async function get_cash(): Promise<{
  success: boolean;
  cash: number;
}> {
  return { success: true, cash: getCash() };
}
