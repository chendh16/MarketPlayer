import nodemailer from 'nodemailer';
import { fetch_position_review } from './src/mcp/tools/position-review';

async function main() {
  // 获取复盘数据
  const data = await fetch_position_review({ broker: 'futu', forceRefresh: false });
  const report = data.snapshot;

  // 创建邮件传输器
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user: '845567595@qq.com', pass: 'umhmlopcatfmbdga' },
  });

  // 生成HTML报告
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>每日持仓复盘</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
  <h1 style="color: #1a1a1a;">📊 每日持仓复盘</h1>
  <p style="color: #666;">复盘时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
  
  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">📈 资产概况</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>总资产</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${report.totalAssets.toLocaleString()} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>持仓市值</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${report.marketValue.toLocaleString()} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>可用现金</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${report.availableCash.toLocaleString()} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>仓位</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${report.positionPct.toFixed(1)}%</td>
      </tr>
      <tr style="background: ${report.profitLoss >= 0 ? '#e8f5e9' : '#ffebee'};">
        <td style="padding: 8px;"><strong>浮动盈亏</strong></td>
        <td style="padding: 8px; text-align: right; color: ${report.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">
          ${report.profitLoss.toLocaleString()} CNY (${report.profitPercent.toFixed(2)}%)
        </td>
      </tr>
    </table>
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">⚠️ 风险指标</h2>
    <p><strong>风险等级:</strong> ${report.riskMetrics.riskLevel} (${report.riskMetrics.riskScore}分)</p>
    <p><strong>行业集中度:</strong> ${report.riskMetrics.industryConcentration[0]?.industry || 'N/A'} ${report.riskMetrics.industryConcentration[0]?.pct.toFixed(1) || 0}%</p>
    ${data.warnings.map(w => `<p style="color: #f57c00;">⚠️ ${w}</p>`).join('')}
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">🌍 市场分布</h2>
    <p>A股: ${data.allocation.byMarket.a.toFixed(1)}% | 港股: ${data.allocation.byMarket.hk.toFixed(1)}% | 美股: ${data.allocation.byMarket.us.toFixed(1)}% | 现金: ${data.allocation.byMarket.cash.toFixed(1)}%</p>
    
    <h3>行业集中度</h3>
    <ul>
      ${report.riskMetrics.industryConcentration.map(i => `<li>${i.industry}: ${i.pct.toFixed(1)}%</li>`).join('')}
    </ul>
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">📋 持仓明细</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #e0e0e0;">
          <th style="padding: 10px; text-align: left;">股票</th>
          <th style="padding: 10px; text-align: right;">当前价</th>
          <th style="padding: 10px; text-align: right;">市值</th>
          <th style="padding: 10px; text-align: right;">盈亏</th>
          <th style="padding: 10px; text-align: right;">盈亏%</th>
          <th style="padding: 10px; text-align: right;">仓位%</th>
        </tr>
      </thead>
      <tbody>
        ${report.positions.map(p => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px;">${p.name} (${p.symbol})</td>
            <td style="padding: 10px; text-align: right;">${p.currentPrice.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right;">${p.marketValue.toFixed(0)}</td>
            <td style="padding: 10px; text-align: right; color: ${p.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">${p.profitLoss.toFixed(0)}</td>
            <td style="padding: 10px; text-align: right; color: ${p.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">${p.profitPercent.toFixed(2)}%</td>
            <td style="padding: 10px; text-align: right;">${p.positionPct}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    本报告由 MarketPlayer 自动生成 | 仅供参考，不构成投资建议
  </p>
</body>
</html>
`;

  // 发送邮件
  const info = await transporter.sendMail({
    from: 'MarketPlayer <845567595@qq.com>',
    to: '845567595@qq.com',
    subject: `📊 每日持仓复盘 - ${new Date().toLocaleDateString('zh-CN')}`,
    html
  });

  console.log('✅ 邮件已发送:', info.messageId);
}

main().catch(console.error);
