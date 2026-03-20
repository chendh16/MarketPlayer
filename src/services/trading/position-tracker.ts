/**
 * 实盘操作跟踪服务
 * 
 * 跟踪仓位、止盈止损、持股天数
 * 与富途账户同步
 * 支持虚拟盘自动交易
 */

import { logger } from '../../utils/logger';
import { syncFutuAccount, placeFutuOrder } from '../futu/python-api';
import { getHistoryKLine } from '../market/quote-service';
import { execSync } from 'child_process';

export interface Position {
  code: string;
  name: string;
  qty: number;
  avgCost: number;       // 持仓成本
  entryDate: string;      // 入场日期
  holdDays: number;       // 持股天数
  stopLoss: number;      // 止损价
  targetPrice: number;   // 止盈价
  status: 'holding' | 'sold';
  pnl: number;            // 盈亏金额
  pnlPct: number;        // 盈亏比例
}

export interface TradeRecord {
  time: string;
  code: string;
  name: string;
  direction: 'buy' | 'sell';
  price: number;
  qty: number;
  amount: number;
  reason: string;
}

// 内存中的持仓记录
const positions: Map<string, Position> = new Map();
const tradeHistory: TradeRecord[] = [];

// 虚拟盘配置
const VIRTUAL_CONFIG = {
  enabled: true,  // 虚拟盘直接交易
  initialCapital: 100000,  // 初始资金10万
};

let virtualCash = VIRTUAL_CONFIG.initialCapital;

/**
 * 获取虚拟盘资金
 */
export function getVirtualCash(): number {
  return virtualCash;
}

/**
 * 虚拟盘买入 (同步到富途模拟盘)
 */
async function virtualBuy(code: string, name: string, price: number, qty: number): Promise<boolean> {
  const amount = price * qty;
  
  // 检查虚拟资金
  if (virtualCash < amount) {
    logger.warn(`[Virtual] 资金不足: 需要¥${amount}, 当前¥${virtualCash}`);
    return false;
  }
  
  // 虚拟资金扣减
  virtualCash -= amount;
  
  // 富途模拟盘下单
  try {
    const symbol = code.replace('US.', '');
    const futuCode = `US.${symbol}`;
    
    const { spawn } = require('child_process');
    
    const pythonCode = `
from futu import *
import sys
trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host='127.0.0.1', port=11111, security_firm=SecurityFirm.FUTUSECURITIES)
trd_ctx.unlock_trade('602602')
ret, data = trd_ctx.place_order(${price}, ${qty}, '${futuCode}', TrdSide.BUY, order_type=OrderType.NORMAL, trd_env=TrdEnv.SIMULATE)
print('ORDER_RESULT:', ret)
trd_ctx.close()
`;
    
    const child = spawn('python3', ['-c', pythonCode], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });
    
    let stdout = '';
    child.stdout.on('data', (d: any) => { stdout += d.toString(); });
    
    child.on('close', () => {
      if (stdout.includes('ORDER_RESULT: 0')) {
        logger.info(`[Virtual] ✅ 富途模拟盘买入成功: ${name} ${qty}股 @ ¥${price}`);
      } else {
        logger.warn(`[Virtual] ⚠️ 富途下单返回: ${stdout}`);
      }
    });
  } catch (e) {
    logger.error(`[Virtual] ❌ 富途下单失败:`, e);
  }
  
  logger.info(`[Virtual] 🟢 买入 ${name} ${qty}股 @ ¥${price} = ¥${amount}`);
  logger.info(`[Virtual] 剩余虚拟资金: ¥${virtualCash.toFixed(2)}`);
  
  return true;
}

/**
 * 虚拟盘卖出 (同步到富途模拟盘)
 */
async function virtualSell(code: string, name: string, price: number, qty: number): Promise<boolean> {
  const amount = price * qty;
  virtualCash += amount;
  
  // 富途模拟盘下单
  try {
    const symbol = code.replace('US.', '');
    const futuCode = `US.${symbol}`;
    
    const { spawn } = require('child_process');
    
    const pythonCode = `
from futu import *
import sys
trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host='127.0.0.1', port=11111, security_firm=SecurityFirm.FUTUSECURITIES)
trd_ctx.unlock_trade('602602')
ret, data = trd_ctx.place_order(${price}, ${qty}, '${futuCode}', TrdSide.SELL, order_type=OrderType.NORMAL, trd_env=TrdEnv.SIMULATE)
print('ORDER_RESULT:', ret)
trd_ctx.close()
`;
    
    const child = spawn('python3', ['-c', pythonCode], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });
    
    let stdout = '';
    child.stdout.on('data', (d: any) => { stdout += d.toString(); });
    
    child.on('close', () => {
      if (stdout.includes('ORDER_RESULT: 0')) {
        logger.info(`[Virtual] ✅ 富途模拟盘卖出成功: ${name} ${qty}股 @ ¥${price}`);
      }
    });
  } catch (e) {
    logger.error(`[Virtual] ❌ 富途卖出失败:`, e);
  }
  
  logger.info(`[Virtual] 🔴 卖出 ${name} ${qty}股 @ ¥${price} = ¥${amount}`);
  logger.info(`[Virtual] 当前虚拟资金: ¥${virtualCash.toFixed(2)}`);
  
  return true;
}

/**
 * 同步实盘持仓 (从富途获取)
 */
export async function syncPositions(): Promise<Position[]> {
  logger.info('[Trade] 同步实盘持仓...');
  
  try {
    const { account, positions: futuPositions } = await syncFutuAccount();
    
    // 更新持仓
    for (const pos of futuPositions) {
      const existing = positions.get(pos.code);
      
      if (existing) {
        // 更新现有持仓
        existing.qty = pos.qty;
      } else {
        // 新持仓
        positions.set(pos.code, {
          code: pos.code,
          name: pos.name,
          qty: pos.qty,
          avgCost: pos.qty, // 简化：使用当前价格作为成本
          entryDate: new Date().toISOString().split('T')[0],
          holdDays: 0,
          stopLoss: 0,
          targetPrice: 0,
          status: 'holding',
          pnl: 0,
          pnlPct: 0,
        });
      }
    }
    
    // 移除已清仓的
    const currentCodes = new Set(futuPositions.map(p => p.code));
    for (const [code, pos] of positions) {
      if (!currentCodes.has(code) && pos.status === 'holding') {
        pos.status = 'sold';
        logger.info(`[Trade] ${pos.name}已清仓`);
      }
    }
    
    // 计算盈亏
    for (const [code, pos] of positions) {
      if (pos.status === 'holding' && pos.qty > 0) {
        const klines = await getHistoryKLine(code.replace('US.', ''), 'us', '1d', '1mo');
        if (klines.length > 0) {
          const currentPrice = klines[klines.length - 1].close;
          pos.pnl = (currentPrice - pos.avgCost) * pos.qty;
          pos.pnlPct = ((currentPrice - pos.avgCost) / pos.avgCost) * 100;
          
          // 计算持股天数
          const entry = new Date(pos.entryDate);
          const now = new Date();
          pos.holdDays = Math.floor((now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
    }
    
    logger.info(`[Trade] 同步完成: ${positions.size}个持仓`);
    return Array.from(positions.values());
    
  } catch (e) {
    logger.error('[Trade] 同步持仓失败:', e);
    return Array.from(positions.values());
  }
}

/**
 * 开仓买入 (虚拟盘自动交易)
 */
export async function openPosition(
  code: string,
  name: string,
  price: number,
  qty: number,
  strategy: string
): Promise<boolean> {
  logger.info(`[Trade] 开仓信号: ${name} ${qty}股 @ ¥${price}`);
  
  // 计算止损止盈
  const stopLoss = price * 0.95;   // 5%止损
  const targetPrice = price * 1.08; // 8%止盈
  
  // 记录持仓
  positions.set(code, {
    code,
    name,
    qty,
    avgCost: price,
    entryDate: new Date().toISOString().split('T')[0],
    holdDays: 0,
    stopLoss,
    targetPrice,
    status: 'holding',
    pnl: 0,
    pnlPct: 0,
  });
  
  // 记录交易
  tradeHistory.push({
    time: new Date().toISOString(),
    code,
    name,
    direction: 'buy',
    price,
    qty,
    amount: price * qty,
    reason: strategy,
  });
  
  // 虚拟盘直接成交
  if (VIRTUAL_CONFIG.enabled) {
    await virtualBuy(code, name, price, qty);
  }
  
  // 如果是实盘，可以调用富途下单
  // await placeFutuOrder(code, 'buy', qty, price);
  
  logger.info(`[Trade] ✅ 开仓成功: ${name}`);
  return true;
}

/**
 * 平仓卖出 (虚拟盘自动交易)
 */
export async function closePosition(
  code: string,
  price: number,
  reason: string
): Promise<boolean> {
  const pos = positions.get(code);
  if (!pos) {
    logger.warn(`[Trade] 持仓不存在: ${code}`);
    return false;
  }
  
  logger.info(`[Trade] 平仓信号: ${pos.name} ${pos.qty}股 @ ¥${price}`);
  
  // 更新状态
  pos.status = 'sold';
  pos.pnl = (price - pos.avgCost) * pos.qty;
  pos.pnlPct = ((price - pos.avgCost) / pos.avgCost) * 100;
  
  // 记录交易
  tradeHistory.push({
    time: new Date().toISOString(),
    code: pos.code,
    name: pos.name,
    direction: 'sell',
    price,
    qty: pos.qty,
    amount: price * pos.qty,
    reason,
  });
  
  // 虚拟盘直接成交
  if (VIRTUAL_CONFIG.enabled) {
    await virtualSell(code, pos.name, price, pos.qty);
  }
  
  // 如果是实盘，可以调用富途下单
  // await placeFutuOrder(code, 'sell', pos.qty, price);
  
  logger.info(`[Trade] ✅ 平仓完成: ${pos.name}, 盈亏: ¥${pos.pnl.toFixed(2)} (${pos.pnlPct.toFixed(1)}%)`);
  return true;
}

/**
 * 检查持仓状态 (止盈/止损/到期)
 */
export async function checkPositions(): Promise<{
  toClose: Position[];  // 需要平仓的
  toAlert: Position[]; // 需要提醒的
}> {
  const toClose: Position[] = [];
  const toAlert: Position[] = [];
  
  for (const [code, pos] of positions) {
    if (pos.status !== 'holding') continue;
    
    // 获取当前价格
    const klines = await getHistoryKLine(code.replace('US.', ''), 'us', '1d', '1mo');
    if (klines.length === 0) continue;
    
    const currentPrice = klines[klines.length - 1].close;
    
    // 检查止损
    if (currentPrice <= pos.stopLoss) {
      toClose.push(pos);
      logger.info(`[Trade] 触发止损: ${pos.name} @ ¥${currentPrice}`);
      continue;
    }
    
    // 检查止盈
    if (currentPrice >= pos.targetPrice) {
      toClose.push(pos);
      logger.info(`[Trade] 触发止盈: ${pos.name} @ ¥${currentPrice}`);
      continue;
    }
    
    // 检查持股到期 (5天)
    const entry = new Date(pos.entryDate);
    const now = new Date();
    pos.holdDays = Math.floor((now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
    
    if (pos.holdDays >= 5) {
      toClose.push(pos);
      logger.info(`[Trade] 持股到期: ${pos.name} 持有${pos.holdDays}天`);
      continue;
    }
    
    // 检查接近止损线 (提醒)
    if (currentPrice <= pos.stopLoss * 1.02) {
      toAlert.push(pos);
    }
  }
  
  return { toClose, toAlert };
}

/**
 * 获取当前持仓
 */
export function getPositions(): Position[] {
  return Array.from(positions.values()).filter(p => p.status === 'holding');
}

/**
 * 获取交易历史
 */
export function getTradeHistory(): TradeRecord[] {
  return tradeHistory;
}

/**
 * 生成持仓报告
 */
export function generatePositionReport(): string {
  const holding = getPositions();
  
  let report = `📊 实盘/虚拟盘持仓报告\n`;
  report += `━━━━━━━━━━━━━━━━━━━━\n`;
  report += `时间: ${new Date().toLocaleString('zh-CN')}\n`;
  report += `虚拟盘资金: ¥${virtualCash.toFixed(2)}\n`;
  report += `持仓数: ${holding.length}\n\n`;
  
  if (holding.length === 0) {
    report += `无持仓\n`;
  } else {
    for (const pos of holding) {
      const emoji = pos.pnlPct > 0 ? '📈' : '📉';
      report += `${emoji} ${pos.name} (${pos.code})\n`;
      report += `   持仓: ${pos.qty}股 | 成本: ¥${pos.avgCost.toFixed(2)}\n`;
      report += `   持股: ${pos.holdDays}天 | 止损: ¥${pos.stopLoss.toFixed(2)}\n`;
      report += `   盈亏: ¥${pos.pnl.toFixed(2)} (${pos.pnlPct.toFixed(1)}%)\n\n`;
    }
  }
  
  return report;
}
