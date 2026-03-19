/**
 * 每日金融汇报
 * - 市场分析
 * - 持仓复盘
 * - 信号推荐
 */

import { sendMessageToUser } from '../../services/feishu/bot';
import { analyzeStock, batchAnalyze, getRecommendations } from '../market/analysis';
import { syncFutuAccount } from '../../services/futu/python-api';

interface DailyReport {
  date: string;
  marketSummary: string;
  positions: any[];
  recommendations: any;
  signals: any[];
}

/**
 * 生成每日金融汇报
 */
export async function generateDailyReport(): Promise<DailyReport> {
  const today = new Date().toLocaleDateString('zh-CN');
  
  // 1. 获取持仓分析
  const account = await syncFutuAccount();
  const positions = account.positions;
  
  // 2. 获取推荐
  const recommendations = await getRecommendations();
  
  // 3. 批量分析持仓
  const positionSymbols = positions.map((p: any) => `US.${p.code.replace('US.', '')}`);
  const signals = await batchAnalyze(positionSymbols);
  
  return {
    date: today,
    marketSummary: generateMarketSummary(recommendations),
    positions: signals,
    recommendations,
    signals,
  };
}

/**
 * 生成市场总结
 */
function generateMarketSummary(recommendations: any): string {
  const { strongBuy, buy, hold, sell } = recommendations;
  
  let summary = '📊 市场分析\n\n';
  
  summary += `🔥 强势买入: ${strongBuy.length > 0 ? strongBuy.map((s: any) => s.symbol).join(', ') : '无'}\n`;
  summary += `✅ 买入信号: ${buy.length > 0 ? buy.map((s: any) => s.symbol).join(', ') : '无'}\n`;
  summary += `⏸️ 持有观望: ${hold.length > 0 ? hold.map((s: any) => s.symbol).join(', ') : '无'}\n`;
  summary += `🔴 卖出信号: ${sell.length > 0 ? sell.map((s: any) => s.symbol).join(', ') : '无'}\n`;
  
  return summary;
}

/**
 * 发送每日汇报到飞书
 */
export async function sendDailyReport(openId: string): Promise<void> {
  const report = await generateDailyReport();
  
  // 构建消息
  let message = `📈 每日金融汇报 - ${report.date}\n\n`;
  
  message += report.marketSummary;
  
  message += '\n📋 持仓分析:\n';
  for (const pos of report.signals) {
    const emoji = pos.signal === 'BUY' ? '🟢' : pos.signal === 'SELL' ? '🔴' : '⏸️';
    message += `${emoji} ${pos.symbol}: \$${pos.currentPrice.toFixed(2)} (${pos.changePct > 0 ? '+' : ''}${pos.changePct.toFixed(2)}%) | 信号: ${pos.signal}\n`;
    message += `   RSI:${pos.rsi?.toFixed(0)} MA5:${pos.ma5?.toFixed(0)} MA20:${pos.ma20?.toFixed(0)} | ${pos.reason}\n`;
  }
  
  await sendMessageToUser(openId, { text: message });
  console.log('[DailyReport] 每日汇报已发送');
}

/**
 * 发送持仓告警
 */
export async function sendPositionAlerts(openId: string): Promise<void> {
  const account = await syncFutuAccount();
  const positions = account.positions;
  const symbols = positions.map((p: any) => `US.${p.code.replace('US.', '')}`);
  const signals = await batchAnalyze(symbols);
  
  // 只发送有卖出信号的持仓
  const alerts = signals.filter(s => s.signal === 'SELL');
  
  if (alerts.length > 0) {
    let message = '⚠️ 持仓告警\n\n';
    
    for (const alert of alerts) {
      message += `🔴 ${alert.symbol}: ${alert.reason}\n`;
    }
    
    await sendMessageToUser(openId, { text: message });
    console.log('[PositionAlerts] 持仓告警已发送');
  }
}
