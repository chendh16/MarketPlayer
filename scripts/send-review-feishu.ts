import dotenv from 'dotenv';
dotenv.config();

import { sendMessageToUser } from './src/services/feishu/bot';

const OPEN_ID = process.env.FEISHU_USER_OPEN_ID || 'ou_3d8c36452b5a0ca480873393ad876e12';

async function main() {
  // 获取持仓数据
  const response = await fetch('http://localhost:3103/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', parameters: { broker: 'futu' } })
  });
  const data = await response.json() as any;
  const report = data.report;

  const formatNumber = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  const formatPct = (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
  const formatProfit = (p: number) => (p >= 0 ? '+' : '') + formatNumber(p);

  // 构建消息
  const text = `📊 每日持仓复盘 (${new Date().toLocaleDateString('zh-CN')})

💰 资产概况
├ 总资产: ${formatNumber(report.totalAssets)} CNY
├ 持仓市值: ${formatNumber(report.marketValue)} CNY
├ 可用现金: ${formatNumber(report.cash)} CNY
└ 仓位: ${report.positionPct.toFixed(1)}%

📈 浮动盈亏
└ ${formatProfit(report.profitLoss)} (${formatPct(report.profitPercent)})

⚠️ 风险等级: ${report.riskLevel} (${report.riskScore}分)
${report.warnings.length > 0 ? '⚠️ ' + report.warnings[0] : ''}

🌍 市场分布
A股 ${report.allocation.byMarket.a.toFixed(1)}% | 港股 ${report.allocation.byMarket.hk.toFixed(1)}% | 现金 ${report.allocation.byMarket.cash.toFixed(1)}%

📋 持仓明细
${report.positions.map((p: any) => `${p.name} (${p.symbol})
  市值: ${formatNumber(p.marketValue)} 盈亏: ${formatProfit(p.profitLoss)} (${formatPct(p.profitPercent)}) 仓位: ${p.positionPct}%`).join('\n')}

---
由 MarketPlayer 自动生成`;

  const result = await sendMessageToUser(OPEN_ID, { text });
  if (result) {
    console.log('✅ 飞书消息已发送:', result.messageId);
  } else {
    console.error('❌ 发送失败');
    process.exit(1);
  }
}

main();