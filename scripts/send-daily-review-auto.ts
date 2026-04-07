/**
 * 发送每日持仓复盘报告到邮箱
 */
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: '845567595@qq.com', pass: 'umhmlopcatfmbdga' },
});

// 获取持仓复盘数据
async function fetchReviewData() {
  const response = await fetch('http://localhost:3103/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', parameters: { broker: 'futu' } })
  });
  const data = await response.json();
  return data.report;
}

// 生成HTML报告
function generateHTML(report: any): string {
  const formatNumber = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const formatPct = (p: number) => p.toFixed(1) + '%';
  
  return `<!DOCTYPE html>
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
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatNumber(report.totalAssets)} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>持仓市值</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatNumber(report.marketValue)} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>可用现金</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatNumber(report.cash)} CNY</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>仓位</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPct(report.positionPct)}</td>
      </tr>
      <tr style="background: ${report.profitLoss >= 0 ? '#e8f5e9' : '#ffebee'};">
        <td style="padding: 8px;"><strong>浮动盈亏</strong></td>
        <td style="padding: 8px; text-align: right; color: ${report.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">
          ${formatNumber(report.profitLoss)} CNY (${report.profitPercent.toFixed(2)}%)
        </td>
      </tr>
    </table>
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">⚠️ 风险指标</h2>
    <p><strong>风险等级:</strong> ${report.riskLevel} (${report.riskScore}分)</p>
    ${report.warnings && report.warnings.length > 0 ? report.warnings.map((w: string) => `<p style="color: #f57c00;">⚠️ ${w}</p>`).join('') : ''}
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">🌍 市场分布</h2>
    <p>A股: ${report.allocation.byMarket.a.toFixed(1)}% | 港股: ${report.allocation.byMarket.hk.toFixed(1)}% | 美股: ${report.allocation.byMarket.us.toFixed(1)}% | 现金: ${report.allocation.byMarket.cash.toFixed(1)}%</p>
    
    <h3>行业集中度</h3>
    <ul>
      ${report.allocation.byIndustry.map((i: any) => `<li>${i.industry}: ${i.pct.toFixed(1)}%</li>`).join('')}
    </ul>
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">📋 持仓明细</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #e0e0e0;">
          <th style="padding: 10px; text-align: left;">股票</th>
          <th style="padding: 10px; text-align: right;">市值</th>
          <th style="padding: 10px; text-align: right;">盈亏</th>
          <th style="padding: 10px; text-align: right;">盈亏%</th>
          <th style="padding: 10px; text-align: right;">仓位%</th>
        </tr>
      </thead>
      <tbody>
        ${report.positions.map((p: any) => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px;">${p.name} (${p.symbol})</td>
            <td style="padding: 10px; text-align: right;">${formatNumber(p.marketValue)}</td>
            <td style="padding: 10px; text-align: right; color: ${p.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">${formatNumber(p.profitLoss)}</td>
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
</html>`;
}

// 主函数
async function main() {
  try {
    console.log('📊 获取持仓数据...');
    const report = await fetchReviewData();
    console.log(`   总资产: ${report.totalAssets.toFixed(2)} 仓位: ${report.positionPct.toFixed(1)}%`);

    console.log('📧 发送邮件...');
    const html = generateHTML(report);
    const info = await transporter.sendMail({
      from: 'MarketPlayer <845567595@qq.com>',
      to: '845567595@qq.com',
      subject: `📊 每日持仓复盘 - ${new Date().toLocaleDateString('zh-CN')}`,
      html
    });
    console.log('✅ 邮件已发送:', info.messageId);
  } catch (err) {
    console.error('❌ 错误:', err);
    process.exit(1);
  }
}

main();
