/**
 * 长线Agent定时任务
 * - 板块研究
 * - PB估值监控
 * - 轮动评估
 */

import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';

// 导入路径修正
const projectRoot = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer';

function loadModules(): Record<string, any[]> {
  const dataDir = path.join(projectRoot, 'data/stock-history');
  const modules: Record<string, any[]> = {};
  
  if (!fs.existsSync(dataDir)) return modules;
  
  fs.readdirSync(dataDir)
    .filter(f => f.startsWith('module-') && f.endsWith('.json') && !f.includes('state'))
    .forEach(f => {
      const name = f.replace('module-', '').replace('.json', '');
      modules[name] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    });
  
  return modules;
}

function calculateModuleStats(modules: Record<string, any[]>) {
  return Object.entries(modules).map(([name, stocks]) => {
    const momenta = stocks.map((s: any) => parseFloat(s.momentum));
    const vols = stocks.map((s: any) => parseFloat(s.volatility));
    return {
      name,
      avgMomentum: momenta.reduce((a, b) => a + b, 0) / momenta.length,
      avgVolatility: vols.reduce((a, b) => a + b, 0) / vols.length,
    };
  }).sort((a: any, b: any) => b.avgMomentum - a.avgMomentum);
}

function generateRecommendations(modules: Record<string, any[]>) {
  const stats = calculateModuleStats(modules);
  
  const shortTerm = stats.filter((s: any) => s.avgMomentum > 10).slice(0, 3).map((s: any) => s.name);
  const mediumTerm = stats.filter((s: any) => s.avgMomentum > 0 && s.avgMomentum <= 10).slice(0, 3).map((s: any) => s.name);
  const longTerm = stats.filter((s: any) => s.avgMomentum < 0).slice(0, 3).map((s: any) => s.name);
  
  return { shortTerm, mediumTerm, longTerm };
}

function loadPBData(): any[] {
  const pbFile = path.join(projectRoot, 'data/fundamental/a_pb_percentile.csv');
  if (!fs.existsSync(pbFile)) return [];
  
  const lines = fs.readFileSync(pbFile, 'utf8').trim().split('\n');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      date: values[0],
      middlePB: parseFloat(values[1]),
      quantileInRecent10YearsMiddlePB: parseFloat(values[4])
    };
  });
}

function evaluateLongTerm(pbData: any[]) {
  if (pbData.length === 0) return { signal: 'HOLD', pbPercentile: 50, currentPB: 0, strength: 50, reasons: ['数据不足'] };
  
  const latest = pbData[pbData.length - 1];
  const percentile = latest.quantileInRecent10YearsMiddlePB * 100;
  
  let score = 50;
  const reasons: string[] = [];
  
  if (percentile < 20) { score += 30; reasons.push('PB分位历史最低20%'); }
  else if (percentile >= 20 && percentile < 40) { score += 15; reasons.push('PB分位历史较低'); }
  if (percentile > 80) { score -= 30; reasons.push('PB分位历史最高20%'); }
  else if (percentile >= 60 && percentile <= 80) { score -= 15; reasons.push('PB分位历史较高'); }
  
  let signal = 'HOLD';
  if (score >= 70) signal = 'BUY';
  else if (score <= 30) signal = 'SELL';
  
  return {
    signal,
    pbPercentile: Math.round(percentile),
    currentPB: parseFloat(latest.middlePB.toFixed(2)),
    strength: Math.max(0, Math.min(100, score)),
    reasons
  };
}

// 模拟发送消息 (实际使用飞书bot)
async function sendToUser(msg: string) {
  // 实际推送到飞书
  console.log('[飞书推送]', msg);
  // TODO: 接入飞书/微信推送
}

// ==================== 每日: 板块研究更新 ====================

async function dailyModuleReport() {
  console.log('[LongTerm-Agent] 生成每日板块研报...');
  
  const modules = loadModules();
  if (Object.keys(modules).length === 0) {
    console.log('[LongTerm-Agent] 数据未就绪');
    return;
  }
  
  const stats = calculateModuleStats(modules);
  const recs = generateRecommendations(modules);
  
  let msg = '📊 每日板块轮动报告\n\n';
  msg += `📅 ${new Date().toLocaleDateString('zh-CN')}\n\n`;
  
  msg += '🔥 短线推荐:\n';
  recs.shortTerm.forEach((m: string) => msg += `  • ${m}\n`);
  
  msg += '\n📈 中线配置:\n';
  recs.mediumTerm.forEach((m: string) => msg += `  • ${m}\n`);
  
  msg += '\n🌙 长线布局:\n';
  recs.longTerm.forEach((m: string) => msg += `  • ${m}\n`);
  
  await sendToUser(msg);
}

// ==================== 每日: PB估值监控 ====================

async function dailyPBReport() {
  console.log('[LongTerm-Agent] PB估值监控...');
  
  let msg = '📈 多市场 PB估值监控\n\n';
  
  // A股
  const pbData = loadPBData();
  const signal = evaluateLongTerm(pbData);
  
  msg += '【A股】\n';
  msg += `PB分位: ${signal.pbPercentile}%\n`;
  msg += `当前PB: ${signal.currentPB}\n`;
  msg += `信号: ${signal.signal}\n`;
  msg += `评分: ${signal.strength}/100\n`;
  msg += `理由: ${signal.reasons.join(', ')}\n\n`;
  
  // 港股 (模拟数据，需要实际数据源)
  msg += '【港股】\n';
  msg += 'PB分位: ~45%\n';
  msg += '信号: HOLD\n';
  msg += '理由: 估值处于历史低位\n\n';
  
  // 美股 (模拟数据)
  msg += '【美股】\n';
  msg += 'PB分位: ~70%\n';
  msg += '信号: SELL\n';
  msg += '理由: 估值处于历史高位\n';
  
  await sendToUser(msg);
}

// ==================== 每周: 轮动评估 ====================

async function weeklyRotationReport() {
  console.log('[LongTerm-Agent] 周度轮动评估...');
  
  const modules = loadModules();
  const stats = calculateModuleStats(modules);
  
  let msg = '📊 本周板块轮动评估\n\n';
  
  msg += '📈 动量排名 Top 5:\n';
  stats.slice(0, 5).forEach((s: any, i: number) => {
    msg += `  ${i+1}. ${s.name}: ${s.avgMomentum.toFixed(2)}%\n`;
  });
  
  msg += '\n📉 动量末尾:\n';
  stats.slice(-3).forEach((s: any) => {
    msg += `  • ${s.name}: ${s.avgMomentum.toFixed(2)}%\n`;
  });
  
  await sendToUser(msg);
}

// ==================== 启动调度器 ====================

export function startLongTermAgent() {
  console.log('[LongTerm-Agent] 启动定时任务...');
  
  // 每日 09:00 - 板块研报
  cron.schedule('0 9 * * 1-5', async () => {
    await dailyModuleReport();
  });
  
  // 每日 15:30 - PB估值
  cron.schedule('30 15 * * 1-5', async () => {
    await dailyPBReport();
  });
  
  // 每周一 09:30 - 周度评估
  cron.schedule('30 9 * * 1', async () => {
    await weeklyRotationReport();
  });
  
  console.log('[LongTerm-Agent] 已启动: 每日板块研报 + PB估值 + 周度评估');
}

// 测试
console.log('=== 长线Agent测试 ===');
dailyModuleReport();
dailyPBReport();

startLongTermAgent();
console.log('任务调度中...');
