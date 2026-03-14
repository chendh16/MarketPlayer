/**
 * 每日强势股筛选并发送邮件报告
 * 
 * 用法: npx ts-node scripts/daily-strong-stock-report.ts
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { fetch_top_gainers, fetch_top_volume, fetch_top_turnover } from '../src/mcp/tools/rank';
import { fetch_industry_board } from '../src/mcp/tools/board';

interface StockItem {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;      // 成交额(亿)
  turnover: number;   // 换手率
  industry: string;
  reason: string;
}

interface ScreeningResult {
  items: StockItem[];
  metadata: {
    totalScanned: number;
    matched: number;
    fetchedAt: string;
  };
}

// 筛选参数 (保守设置)
const PARAMS = {
  limit: 20,
  minChange: 3,    // 最小涨幅 3%
  minVolume: 5,    // 最小成交额 5亿
  minTurnover: 0.5 // 最小换手率 0.5%
};

const EMAIL_TO = '845567595@qq.com';

/**
 * 强势股筛选主逻辑
 */
async function screenStrongStocks(): Promise<ScreeningResult> {
  console.log(`[StrongStock] 筛选条件: 涨幅>${PARAMS.minChange}%, 成交额>${PARAMS.minVolume}亿, 换手率>${PARAMS.minTurnover}%`);
  console.log('[StrongStock] 正在获取数据...\n');

  // 获取多维度数据
  const [gainersData, volumeData, turnoverData, industryData] = await Promise.all([
    fetch_top_gainers({ limit: 100 }),
    fetch_top_volume({ limit: 100 }),
    fetch_top_turnover({ limit: 100 }),
    fetch_industry_board({ limit: 20 }).catch(() => ({ data: [] as any[] }))
  ]);

  console.log(`[StrongStock] 获取到涨幅榜: ${gainersData.data.length} 只`);
  console.log(`[StrongStock] 获取到成交额榜: ${volumeData.data.length} 只`);
  console.log(`[StrongStock] 获取到换手率榜: ${turnoverData.data.length} 只`);

  // 构建映射
  const gainersMap = new Map(gainersData.data.map(s => [s.symbol, s]));
  const volumeMap = new Map(volumeData.data.map(s => [s.symbol, s]));
  const turnoverMap = new Map(turnoverData.data.map(s => [s.symbol, s]));

  // 综合筛选
  const matchedStocks: StockItem[] = [];
  const allSymbols = new Set([
    ...gainersData.data.map(s => s.symbol),
    ...volumeData.data.slice(0, 50).map(s => s.symbol),
    ...turnoverData.data.slice(0, 50).map(s => s.symbol)
  ]);

  for (const symbol of allSymbols) {
    const g = gainersMap.get(symbol);
    const v = volumeMap.get(symbol);
    const t = turnoverMap.get(symbol);

    const changePercent = g?.changePercent || v?.changePercent || t?.changePercent || 0;
    const volume = (v?.amount || 0) / 10000; // 转换为亿
    const turnover = t?.turnover || 0;

    // 筛选条件
    if (changePercent < PARAMS.minChange || volume < PARAMS.minVolume || turnover < PARAMS.minTurnover) {
      continue;
    }

    // 判断上榜原因
    const reasons: string[] = [];
    if (g && g.changePercent >= PARAMS.minChange) reasons.push('涨幅榜');
    if (v && v.amount / 100000000 >= PARAMS.minVolume) reasons.push('成交额榜');
    if (t && t.turnover >= PARAMS.minTurnover) reasons.push('换手率榜');

    matchedStocks.push({
      rank: matchedStocks.length + 1,
      symbol,
      name: g?.name || v?.name || t?.name || '',
      price: g?.price || v?.price || t?.price || 0,
      changePercent,
      volume,
      turnover,
      industry: g?.name?.slice(0, 2) || '其他',
      reason: reasons.join('/')
    });
  }

  // 按涨幅排序
  matchedStocks.sort((a, b) => b.changePercent - a.changePercent);

  return {
    items: matchedStocks.slice(0, PARAMS.limit),
    metadata: {
      totalScanned: allSymbols.size,
      matched: matchedStocks.length,
      fetchedAt: new Date().toISOString()
    }
  };
}

/**
 * 生成HTML报告
 */
function generateHTML(result: ScreeningResult): string {
  const now = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const itemsHTML = result.items.map(item => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center">${item.rank}</td>
      <td style="padding:10px;border-bottom:1px solid #eee">
        <strong>${item.name}</strong><br>
        <span style="color:#888;font-size:12px">${item.symbol}</span>
      </td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.price.toFixed(2)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:${item.changePercent > 0 ? '#e53935' : '#43a047'}">
        <strong>${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%</strong>
      </td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.volume.toFixed(1)}亿</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${item.turnover.toFixed(1)}%</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;color:#666">${item.reason}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { padding: 24px; background: linear-gradient(135deg, #1a73e8 0%, #4285f4 100%); color: #fff; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; }
    .header .subtitle { opacity: 0.9; font-size: 14px; }
    .stats { display: flex; gap: 20px; padding: 16px 24px; background: #f8f9fa; border-bottom: 1px solid #eee; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1a73e8; }
    .stat-label { font-size: 12px; color: #666; }
    .content { padding: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8f9fa; padding: 12px; text-align: center; font-size: 12px; color: #666; text-transform: uppercase; }
    .footer { padding: 16px 24px; background: #f8f9fa; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
    .note { background: #fff3e0; padding: 12px 16px; border-left: 3px solid #ff9800; margin: 16px; border-radius: 4px; font-size: 13px; color: #e65100; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📈 每日强势股筛选报告</h1>
      <div class="subtitle">${now} · A股市场</div>
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${result.metadata.totalScanned}</div>
        <div class="stat-label">初筛股票</div>
      </div>
      <div class="stat">
        <div class="stat-value">${result.metadata.matched}</div>
        <div class="stat-label">符合条件</div>
      </div>
      <div class="stat">
        <div class="stat-value">${result.items.length}</div>
        <div class="stat-label">最终入选</div>
      </div>
    </div>

    <div class="note">
      <strong>筛选条件：</strong>涨幅 ≥ ${PARAMS.minChange}% &nbsp;|&nbsp; 成交额 ≥ ${PARAMS.minVolume}亿 &nbsp;|&nbsp; 换手率 ≥ ${PARAMS.minTurnover}%
    </div>

    <div class="content">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>股票名称</th>
            <th>现价</th>
            <th>涨幅</th>
            <th>成交额</th>
            <th>换手率</th>
            <th>上榜原因</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML || '<tr><td colspan="7" style="padding:30px;text-align:center;color:#999">暂无符合条件的股票</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>📊 数据来源：东方财富 | MarketPlayer 自动筛选</p>
      <p>⚠️ 免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负。</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 发送邮件
 */
async function sendEmail(html: string, result: ScreeningResult): Promise<void> {
  const config = {
    host: process.env.EMAIL_SMTP_HOST!,
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_SMTP_USER!,
      pass: process.env.EMAIL_SMTP_PASS!,
    },
  };

  console.log('\n[Email] 正在发送邮件...');
  
  const transporter = nodemailer.createTransport(config);
  await transporter.verify();
  console.log('[Email] SMTP 连接成功');

  const dateStr = new Date().toLocaleDateString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric'
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to: EMAIL_TO,
    subject: `[${dateStr}] 每日强势股筛选报告 - 入选${result.items.length}只`,
    html,
  });

  console.log(`[Email] 邮件发送成功! messageId: ${info.messageId}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(50));
  console.log('🚀 每日强势股筛选报告开始执行');
  console.log('='.repeat(50) + '\n');

  try {
    // 1. 筛选强势股
    const result = await screenStrongStocks();
    
    console.log(`\n[StrongStock] 筛选完成: 共 ${result.items.length} 只强势股`);

    // 2. 生成报告
    const html = generateHTML(result);
    
    // 3. 发送邮件
    await sendEmail(html, result);

    console.log('\n' + '='.repeat(50));
    console.log('✅ 每日强势股筛选报告执行完成!');
    console.log('='.repeat(50));

  } catch (error: any) {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  }
}

main();
