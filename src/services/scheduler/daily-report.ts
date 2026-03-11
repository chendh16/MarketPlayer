/**
 * 每日综合报告生成与发送
 * 包含: 金融团队 + 开发团队
 */

import { spawn } from 'child_process';
import { sendEmail } from '../email/mailer';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// 股票列表配置
const STOCKS = {
  a: [
    { code: '600519', name: '贵州茅台' },
    { code: '000001', name: '平安银行' },
    { code: '600036', name: '招商银行' },
    { code: '000858', name: '五粮液' },
    { code: '300750', name: '宁德时代' }
  ],
  hk: [
    { code: '00700', name: '腾讯控股' },
    { code: '09988', name: '阿里巴巴' },
    { code: '02318', name: '平安保险' },
    { code: '00939', name: '建设银行' },
    { code: '00005', name: '汇丰控股' }
  ],
  us: [
    { code: 'AAPL', name: '苹果' },
    { code: 'MSFT', name: '微软' },
    { code: 'GOOGL', name: '谷歌' },
    { code: 'AMZN', name: '亚马逊' },
    { code: 'TSLA', name: '特斯拉' }
  ]
};

// 运行 Python 脚本获取数据
function runPython(script: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [script, ...args]);
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', () => {
      try {
        const lines = output.split('\n');
        const jsonLine = lines.find(l => l.trim().startsWith('{'));
        resolve(jsonLine ? JSON.parse(jsonLine) : { error: 'No data' });
      } catch (e) { resolve({ error: output }); }
    });
  });
}

// HTTP GET 请求
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require('https');
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res: any) => {
      let data = '';
      res.on('data', (c: any) => { data += c; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

// 获取大盘数据
async function getMarketData(): Promise<any[]> {
  try {
    const result = await runPython('./scripts/akshare_service.py', ['market']);
    return result.data || [];
  } catch (e) {
    logger.error('获取大盘数据失败:', e);
    return [];
  }
}

// 获取A股财务数据
async function getAStockData(): Promise<any[]> {
  const results = [];
  for (const stock of STOCKS.a) {
    try {
      const info = await runPython('./scripts/akshare_service.py', ['stock_info', stock.code]);
      if (info.success) {
        results.push({ ...stock, ...info.data });
      }
    } catch (e) {
      logger.error(`获取${stock.name}数据失败:`, e);
    }
  }
  return results;
}

// 获取港股数据
async function getHKStockData(): Promise<any[]> {
  const results = [];
  for (const stock of STOCKS.hk) {
    try {
      const data = await httpGet('https://qt.gtimg.cn/q=r_hk' + stock.code);
      const match = data.match(/"([^"]+)"/);
      if (match) {
        const parts = match[1].split('~');
        const price = parseFloat(parts[3]);
        const close = parseFloat(parts[5]) || price;
        results.push({
          name: stock.name,
          code: stock.code,
          price,
          change: price - close,
          changePct: ((price - close) / close * 100)
        });
      }
    } catch (e) {
      logger.error(`获取${stock.name}数据失败:`, e);
    }
  }
  return results;
}

// 获取美股数据
async function getUSStockData(): Promise<any[]> {
  const results = [];
  for (const stock of STOCKS.us) {
    try {
      const data = await httpGet('https://stooq.com/q/l/?s=' + stock.code + '.US&i=d');
      const parts = data.trim().split(',');
      if (parts.length >= 7) {
        const price = parseFloat(parts[6]);
        const open = parseFloat(parts[3]);
        results.push({
          name: stock.name,
          code: stock.code,
          price,
          change: price - open,
          changePct: ((price - open) / open * 100)
        });
      }
    } catch (e) {
      logger.error(`获取${stock.name}数据失败:`, e);
    }
  }
  return results;
}

// 生成 HTML 报告
function generateHTML(market: any[], aData: any[], hkData: any[], usData: any[], type: string): string {
  const title = type === 'morning' ? '📈 每日金融早报' : '📈 每日金融晚报';
  const time = new Date().toLocaleString('zh-CN');

  let html = `<h2>${title}</h2>`;
  html += `<p style="color:#666">${time}</p>`;

  // 大盘
  if (market.length > 0) {
    html += '<h3>📊 A股大盘</h3>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#f0f0f0"><th>指数</th><th>最新价</th><th>涨跌幅</th></tr>';
    for (const m of market) {
      const color = m.涨跌幅 >= 0 ? 'red' : 'green';
      html += `<tr><td><b>${m.名称}</b></td><td>${m.最新价.toFixed(2)}</td><td style="color:${color}">${m.涨跌幅 >= 0 ? '+' : ''}${m.涨跌幅.toFixed(2)}%</td></tr>`;
    }
    html += '</table>';
  }

  // A股
  if (aData.length > 0) {
    html += '<h3>🇨🇳 A股</h3>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#e3f2fd"><th>股票</th><th>最新价</th><th>涨跌幅</th><th>市盈率</th><th>市净率</th><th>市值(亿)</th></tr>';
    for (const s of aData) {
      const color = (s.涨跌幅 || 0) >= 0 ? 'red' : 'green';
      html += `<tr><td><b>${s.股票简称}</b></td><td>${(s.最新价 || 0).toFixed(2)}</td><td style="color:${color}">${(s.涨跌幅 || 0) >= 0 ? '+' : ''}${(s.涨跌幅 || 0).toFixed(2)}%</td><td>${s.市盈率 || '-'}</td><td>${s.市净率 || '-'}</td><td>${(s.总市值 || 0).toFixed(0)}</td></tr>`;
    }
    html += '</table>';
  }

  // 港股
  if (hkData.length > 0) {
    html += '<h3>🇭🇰 港股</h3>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#e8f5e9"><th>股票</th><th>最新价</th><th>涨跌幅</th></tr>';
    for (const s of hkData) {
      const color = s.change >= 0 ? 'red' : 'green';
      html += `<tr><td><b>${s.name}</b></td><td>${s.price.toFixed(2)}</td><td style="color:${color}">${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%</td></tr>`;
    }
    html += '</table>';
  }

  // 美股
  if (usData.length > 0) {
    html += '<h3>🇺🇸 美股</h3>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#fff3e0"><th>股票</th><th>最新价</th><th>涨跌幅</th></tr>';
    for (const s of usData) {
      const color = s.change >= 0 ? 'red' : 'green';
      html += `<tr><td><b>${s.name}</b></td><td>${s.price.toFixed(2)}</td><td style="color:${color}">${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%</td></tr>`;
    }
    html += '</table>';
  }

  html += '<p style="color:#888;font-size:12px">数据来源: 东方财富/腾讯财经/Stooq | 自动生成</p>';

  return html;
}

// 发送每日报告
export async function sendDailyReport(type: 'morning' | 'afternoon' | 'night' = 'morning'): Promise<void> {
  logger.info(`[DailyReport] 开始生成${type === 'morning' ? '早报' : type === 'afternoon' ? '晚报' : '夜间简报'}...`);

  // 获取金融数据
  const [market, aData, hkData, usData] = await Promise.all([
    getMarketData(),
    getAStockData(),
    getHKStockData(),
    getUSStockData()
  ]);

  // 获取开发团队数据
  const [devProgress, techNews, deps] = await Promise.all([
    getDevProgress(),
    getTechNews(),
    getDependencyStatus()
  ]);

  // 生成 HTML - 金融部分
  const finHtml = generateHTML(market, aData, hkData, usData, type);
  
  // 生成 HTML - 开发团队部分
  const devHtml = generateDevReportHTML(devProgress, techNews, deps);

  // 合并报告
  const html = finHtml + '<hr>' + devHtml;
  
  const subject = type === 'morning' 
    ? '📈 每日综合报告 (早) - ' + new Date().toLocaleDateString('zh-CN')
    : type === 'night'
    ? '🌙 每日夜间简报 - ' + new Date().toLocaleDateString('zh-CN')
    : '📈 每日综合报告 (晚) - ' + new Date().toLocaleDateString('zh-CN');

  // 发送邮件
  // TODO: 从数据库获取用户邮箱列表
  const userEmail = '845567595@qq.com';
  
  await sendEmail({
    to: userEmail,
    subject,
    html
  });

  logger.info(`[DailyReport] ${type === 'morning' ? '早报' : '晚报'}发送成功`);
}

// 手动触发发送（用于测试）
export async function manualSendReport(): Promise<void> {
  await sendDailyReport('morning');
}

// ========== 开发团队报告 ==========

interface DevProgress {
  lastUpdate: string;
  features: string[];
  bugs: string[];
  techNews: string[];
  dependencies: { name: string; current: string; wanted: string; }[];
  issues: string[];
}

// 读取开发进度
async function getDevProgress(): Promise<DevProgress> {
  const defaultProgress: DevProgress = {
    lastUpdate: new Date().toISOString(),
    features: [],
    bugs: [],
    techNews: [],
    dependencies: [],
    issues: []
  };

  try {
    // 读取 memory 文件获取进度
    const memoryPath = path.join(process.cwd(), 'memory');
    if (fs.existsSync(memoryPath)) {
      const files = fs.readdirSync(memoryPath).filter(f => f.endsWith('.md')).sort().reverse();
      if (files.length > 0) {
        const latest = files[0];
        const content = fs.readFileSync(path.join(memoryPath, latest), 'utf-8');
        
        // 提取关键信息
        const featureMatch = content.match(/##.*功能.*\n([\s\S]*?)##/);
        const bugMatch = content.match(/##.*Bug.*\n([\s\S]*?)##/);
        
        if (featureMatch) {
          defaultProgress.features = featureMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        }
        if (bugMatch) {
          defaultProgress.bugs = bugMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        }
      }
    }
  } catch (e) {
    logger.error('读取开发进度失败:', e);
  }

  return defaultProgress;
}

// 读取技术资讯
async function getTechNews(): Promise<string[]> {
  try {
    const newsPath = path.join(process.cwd(), 'data/tech-news/latest.json');
    if (fs.existsSync(newsPath)) {
      const content = fs.readFileSync(newsPath, 'utf-8');
      const news = JSON.parse(content);
      return news.items?.slice(0, 5).map((i: any) => i.title) || [];
    }
  } catch (e) {
    // 忽略
  }
  return [];
}

// 读取依赖状态
async function getDependencyStatus(): Promise<{ name: string; current: string; wanted: string; }[]> {
  const deps: { name: string; current: string; wanted: string; }[] = [];
  
  try {
    const auditPath = path.join(process.cwd(), 'audit-report.json');
    if (fs.existsSync(auditPath)) {
      const content = fs.readFileSync(auditPath, 'utf-8');
      const report = JSON.parse(content);
      if (report.vulnerabilities) {
        for (const v of report.vulnerabilities) {
          deps.push({
            name: v.name + '@' + v.range,
            current: v.range,
            wanted: '需更新'
          });
        }
      }
    }
  } catch (e) {
    // 忽略
  }
  
  return deps.slice(0, 5);
}

// 生成开发团队报告 HTML
function generateDevReportHTML(progress: DevProgress, techNews: string[], deps: any[]): string {
  let html = '<h2>🛠️ 开发团队进展</h2>';
  
  // 技术热点
  if (techNews.length > 0) {
    html += '<h3>📰 今日技术热点</h3><ul>';
    for (const news of techNews) {
      html += `<li>${news}</li>`;
    }
    html += '</ul>';
  }
  
  // 功能开发
  if (progress.features.length > 0) {
    html += '<h3>✅ 近期功能</h3><ul>';
    for (const f of progress.features.slice(0, 5)) {
      html += `<li>${f.replace('- ', '')}</li>`;
    }
    html += '</ul>';
  }
  
  // 依赖问题
  if (deps.length > 0) {
    html += '<h3>⚠️ 依赖问题</h3><ul>';
    for (const d of deps) {
      html += `<li><b>${d.name}</b>: ${d.wanted}</li>`;
    }
    html += '</ul>';
  }
  
  if (techNews.length === 0 && progress.features.length === 0 && deps.length === 0) {
    html += '<p style="color:#888">暂无更新</p>';
  }
  
  return html;
}
