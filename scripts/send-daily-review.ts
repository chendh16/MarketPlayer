/**
 * 发送持仓复盘报告到邮箱
 */
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: '845567595@qq.com', pass: 'umhmlopcatfmbdga' },
});

// 复盘数据
const report = {
  summary: "📊 持仓复盘 (futu)\n\n总资产: 17.24万\n持仓市值: 7.24万\n可用现金: 10.00万\n仓位: 42.0%\n\n浮动盈亏: -24.76万 (-77.37%)\n\n风险等级: 中 (47分)\n行业集中度: 互联网 40.6%\n\n⚠️ 提示: 单只股票仓位过重，建议分散风险",
  totalAssets: 172410.15,
  marketValue: 72410.15,
  cash: 100000,
  positionPct: 42.0,
  profitLoss: -247589.85,
  profitPercent: -77.37,
  riskLevel: "中",
  riskScore: 47,
  warnings: ["单只股票仓位过重，建议分散风险"],
  allocation: {
    byMarket: { a: 1.4, hk: 40.6, us: 0, cash: 58.0 },
    byIndustry: [
      { industry: "互联网", pct: 40.6 },
      { industry: "食品饮料", pct: 1.17 },
      { industry: "银行", pct: 0.23 }
    ]
  },
  positions: [
    { symbol: "600519", name: "贵州茅台", marketValue: 1485, profitLoss: -138515, profitPercent: -98.94, positionPct: 50, industry: "食品饮料" },
    { symbol: "000858", name: "五粮液", marketValue: 523.95, profitLoss: -74476.05, profitPercent: -99.3, positionPct: 26.8, industry: "食品饮料" },
    { symbol: "600036", name: "招商银行", marketValue: 401.2, profitLoss: -34598.8, profitPercent: -98.85, positionPct: 12.5, industry: "银行" },
    { symbol: "00700", name: "腾讯控股", marketValue: 70000, profitLoss: 0, profitPercent: 0, positionPct: 25, industry: "互联网" }
  ]
};

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
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${report.cash.toLocaleString()} CNY</td>
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
    <p><strong>风险等级:</strong> ${report.riskLevel} (${report.riskScore}分)</p>
    ${report.warnings.map(w => `<p style="color: #f57c00;">⚠️ ${w}</p>`).join('')}
  </div>

  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0;">🌍 市场分布</h2>
    <p>A股: ${report.allocation.byMarket.a.toFixed(1)}% | 港股: ${report.allocation.byMarket.hk.toFixed(1)}% | 美股: ${report.allocation.byMarket.us.toFixed(1)}% | 现金: ${report.allocation.byMarket.cash.toFixed(1)}%</p>
    
    <h3>行业集中度</h3>
    <ul>
      ${report.allocation.byIndustry.map(i => `<li>${i.industry}: ${i.pct.toFixed(1)}%</li>`).join('')}
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
        ${report.positions.map(p => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px;">${p.name} (${p.symbol})</td>
            <td style="padding: 10px; text-align: right;">${p.marketValue.toLocaleString()}</td>
            <td style="padding: 10px; text-align: right; color: ${p.profitLoss >= 0 ? '#2e7d32' : '#c62828'};">${p.profitLoss.toLocaleString()}</td>
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
async function main() {
  try {
    const info = await transporter.sendMail({
      from: 'MarketPlayer <845567595@qq.com>',
      to: '845567595@qq.com',
      subject: `📊 每日持仓复盘 - ${new Date().toLocaleDateString('zh-CN')}`,
      html
    });
    console.log('✅ 邮件已发送:', info.messageId);
  } catch (err) {
    console.error('❌ 发送失败:', err);
    process.exit(1);
  }
}

main();
