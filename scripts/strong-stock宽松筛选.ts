require('dotenv').config();
import nodemailer from 'nodemailer';
import { fetch_top_gainers, fetch_top_volume, fetch_top_turnover } from '../src/mcp/tools/rank';

interface StockItem {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  turnover: number;
  reason: string;
}

// 放宽条件
const PARAMS = { minChange: 0.1, minVolume: 3, minTurnover: 0.3, limit: 15 };

async function main() {
  console.log('[StrongStock] 使用宽松条件筛选...');
  
  const [gainersData, volumeData, turnoverData] = await Promise.all([
    fetch_top_gainers({ limit: 100 }),
    fetch_top_volume({ limit: 100 }),
    fetch_top_turnover({ limit: 100 })
  ]);

  const gainersMap = new Map(gainersData.data.map((s: any) => [s.symbol, s]));
  const volumeMap = new Map(volumeData.data.map((s: any) => [s.symbol, s]));
  const turnoverMap = new Map(turnoverData.data.map((s: any) => [s.symbol, s]));

  const allSymbols = new Set([
    ...gainersData.data.map((s: any) => s.symbol),
    ...volumeData.data.slice(0, 50).map((s: any) => s.symbol),
    ...turnoverData.data.slice(0, 50).map((s: any) => s.symbol)
  ]);

  const matched: StockItem[] = [];
  for (const symbol of allSymbols) {
    const g = gainersMap.get(symbol);
    const v = volumeMap.get(symbol);
    const t = turnoverMap.get(symbol);
    
    const changePercent = g?.changePercent || 0;
    const volume = (v?.amount || 0) / 10000;
    const turnover = t?.turnover || 0;
    
    if (changePercent >= PARAMS.minChange && volume >= PARAMS.minVolume && turnover >= PARAMS.minTurnover) {
      const reasons: string[] = [];
      if (g) reasons.push('涨幅榜');
      if (v && v.amount/10000 >= PARAMS.minVolume) reasons.push('成交额榜');
      if (t && t.turnover >= PARAMS.minTurnover) reasons.push('换手率榜');
      
      matched.push({
        rank: matched.length + 1,
        symbol,
        name: g?.name || v?.name || '',
        price: g?.price || v?.price || 0,
        changePercent,
        volume,
        turnover,
        reason: reasons.join('/')
      });
    }
  }
  
  matched.sort((a, b) => b.changePercent - a.changePercent);
  const items = matched.slice(0, PARAMS.limit);
  
  console.log('筛选结果:', items.length, '只');

  // 生成HTML
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const dateStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' });
  
  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center">${item.rank}</td>
      <td style="padding:10px;border-bottom:1px solid #eee"><strong>${item.name}</strong><br><span style="color:#888;font-size:12px">${item.symbol}</span></td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.price.toFixed(2)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:${item.changePercent > 0 ? '#e53935' : '#43a047'}"><strong>${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%</strong></td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.volume.toFixed(1)}亿</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.turnover.toFixed(1)}%</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;color:#666">${item.reason}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { padding: 24px; background: linear-gradient(135deg, #1a73e8 0%, #4285f4 100%); color: #fff; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; }
    .stats { display: flex; gap: 20px; padding: 16px 24px; background: #f8f9fa; border-bottom: 1px solid #eee; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1a73e8; }
    .stat-label { font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8f9fa; padding: 12px; text-align: center; font-size: 12px; color: #666; }
    .footer { padding: 16px 24px; background: #f8f9fa; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
    .note { background: #fff3e0; padding: 12px 16px; border-left: 3px solid #ff9800; margin: 16px; border-radius: 4px; font-size: 13px; color: #e65100; }
  </style></head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📈 每日强势股筛选报告</h1>
        <div class="subtitle">${now} · A股市场</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-value">${allSymbols.size}</div><div class="stat-label">初筛股票</div></div>
        <div class="stat"><div class="stat-value">${matched.length}</div><div class="stat-label">符合条件</div></div>
        <div class="stat"><div class="stat-value">${items.length}</div><div class="stat-label">最终入选</div></div>
      </div>
      <div class="note"><strong>筛选条件：</strong>涨幅 ≥ 0.1% &nbsp;|&nbsp;成交额 ≥ 3亿 &nbsp;|&nbsp;换手率 ≥ 0.3%</div>
      <table><thead><tr><th>排名</th><th>股票</th><th>现价</th><th>涨幅</th><th>成交额</th><th>换手率</th><th>上榜</th></tr></thead>
      <tbody>${itemsHTML || '<tr><td colspan="7" style="padding:30px;text-align:center;color:#999">暂无</td></tr>'}</tbody>
      </table>
      <div class="footer"><p>📊 数据来源：东方财富 | MarketPlayer 自动筛选</p><p>⚠️ 免责声明：本内容仅供信息参考，不构成投资建议。</p></div>
    </div>
  </body></html>`;

  // 发送邮件
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS }
  });
  
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to: '845567595@qq.com',
    subject: `[${dateStr}] 每日强势股筛选报告 - 入选${items.length}只`,
    html
  });
  
  console.log('✅ 邮件发送成功:', info.messageId);
}

main();
