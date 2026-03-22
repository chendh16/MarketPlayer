/**
 * 每日汇报系统
 * - 板块研报
 * - PB估值监控
 * - 交易记录
 * - 回测结果
 */

import * as fs from 'fs';
import * as path from 'path';

const projectRoot = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer';
const TRADING_LOG = path.join(projectRoot, 'memory/trading-log.md');

// ==================== 交易记录 ====================

interface TradeRecord {
  date: string;
  strategy: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  stocks: string[];
  reason: string;
 收益率?: number;
  胜率?: number;
}

/**
 * 记录交易
 */
export function recordTrade(record: TradeRecord) {
  const content = `| ${record.date} | ${record.signal} | ${record.stocks.join(', ')} | ${record.reason} |`;
  
  let md = fs.readFileSync(TRADING_LOG, 'utf8');
  
  // 找到表格位置插入
  const lines = md.split('\n');
  const insertIdx = lines.findIndex(l => l.includes('---'));
  
  if (insertIdx > 0) {
    // 找到表格末尾
    let endIdx = insertIdx + 1;
    while (endIdx < lines.length && !lines[endIdx].includes('---')) {
      endIdx++;
    }
    lines.splice(endIdx, 0, content);
    fs.writeFileSync(TRADING_LOG, lines.join('\n'));
  }
  
  console.log('[交易记录]', record.signal, record.stocks.join(', '));
}

// ==================== 汇报生成 ====================

/**
 * 生成每日汇报
 */
export function generateDailyReport(data: {
  pbA?: { percentile: number; signal: string };
  pbHK?: { percentile: number; signal: string };
  pbUS?: { percentile: number; signal: string };
  modules?: { short: string[]; medium: string[]; long: string[] };
}): string {
  let msg = '📊 每日交易汇报\n\n';
  msg += `📅 ${new Date().toLocaleDateString('zh-CN')}\n\n`;
  
  // PB估值
  if (data.pbA) {
    msg += '【A股 PB估值】\n';
    msg += `  分位: ${data.pbA.percentile}%\n`;
    msg += `  信号: ${data.pbA.signal}\n\n`;
  }
  
  if (data.pbHK) {
    msg += '【港股 PB估值】\n';
    msg += `  分位: ${data.pbHK.percentile}%\n`;
    msg += `  信号: ${data.pbHK.signal}\n\n`;
  }
  
  if (data.pbUS) {
    msg += '【美股 PB估值】\n';
    msg += `  分位: ${data.pbUS.percentile}%\n`;
    msg += `  信号: ${data.pbUS.signal}\n\n`;
  }
  
  // 板块推荐
  if (data.modules) {
    msg += '【板块推荐】\n';
    msg += '  短线: ' + data.modules.short.join(', ') + '\n';
    msg += '  中线: ' + data.modules.medium.join(', ') + '\n';
    msg += '  长线: ' + data.modules.long.join(', ') + '\n\n';
  }
  
  msg += '详见: memory/trading-log.md';
  
  return msg;
}

/**
 * 生成回测汇报
 */
export function generateBacktestReport(results: Array<{
  strategy: string;
  return: number;
  winRate: number;
  trades: number;
  maxDrawdown: number;
}>): string {
  let msg = '📊 回测结果汇报\n\n';
  
  for (const r of results) {
    msg += `【${r.strategy}】\n`;
    msg += `  收益率: ${r.return >= 0 ? '+' : ''}${r.return.toFixed(2)}%\n`;
    msg += `  胜率: ${r.winRate.toFixed(1)}%\n`;
    msg += `  交易次数: ${r.trades}\n`;
    msg += `  最大回撤: ${r.maxDrawdown.toFixed(2)}%\n\n`;
  }
  
  return msg;
}

export default {
  recordTrade,
  generateDailyReport,
  generateBacktestReport,
};
