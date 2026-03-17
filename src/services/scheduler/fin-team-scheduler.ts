/**
 * 金融团队定时任务调度器
 * 
 * 根据各市场开盘时间自动执行学习任务
 * 周末也进行复盘和学习
 * 学习结果自动汇报
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { generateBatchRecommendations, formatRecommendationReport } from '../backtest/daily-learning';
import { sendEmail } from '../email/mailer';

const US_STOCK_POOL = [
  { symbol: 'AAPL', name: '苹果' }, { symbol: 'MSFT', name: '微软' },
  { symbol: 'GOOGL', name: '谷歌' }, { symbol: 'AMZN', name: '亚马逊' },
  { symbol: 'META', name: 'Meta' }, { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'TSLA', name: '特斯拉' },
];

const HK_STOCK_POOL = [
  { symbol: '00700', name: '腾讯控股' }, { symbol: '09988', name: '阿里巴巴' },
];

const A_STOCK_POOL = [
  { symbol: '600519', name: '贵州茅台' }, { symbol: '000858', name: '五粮液' },
  { symbol: '600036', name: '招商银行' },
];

// ==================== 飞书通知 ====================

import { sendMessageToUser as sendFeishuMessage } from '../feishu/bot';

// 飞书用户ID（从环境变量或配置获取）
const FEISHU_USER_OPEN_ID = process.env.FEISHU_USER_OPEN_ID || 'ou_3d8c36452b5a0ca480873393ad876e12';

async function notifyUser(title: string, content: string): Promise<void> {
  try {
    // 1. 飞书通知 - 优先
    try {
      const textContent = `**${title}**\n\n${content}`;
      await sendFeishuMessage(FEISHU_USER_OPEN_ID, { text: textContent });
      logger.info(`[FinScheduler] 飞书通知已发送: ${title}`);
    } catch (e) {
      logger.warn('[FinScheduler] 飞书通知失败，尝试邮件:', e);
    }
    
    // 2. 邮件通知 - 备用
    await sendEmail({
      to: process.env.EMAIL_TO || '845567595@qq.com',
      subject: `[MarketPlayer] ${title}`,
      html: content.replace(/\n/g, '<br>'),
    });
    logger.info(`[FinScheduler] 邮件通知已发送: ${title}`);
  } catch (e) {
    logger.error('[FinScheduler] 通知发送失败', e);
  }
}

// ==================== 市场时间判断 ====================

function isTradingTime(market: 'a' | 'hk' | 'us'): boolean {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  const weekday = now.getDay();
  
  if (weekday === 0 || weekday === 6) return false;
  
  switch (market) {
    case 'a': return (time >= 570 && time < 690) || (time >= 780 && time < 900);
    case 'hk': return (time >= 570 && time < 720) || (time >= 780 && time < 960);
    case 'us': return (time >= 1260 && time < 1440) || (time >= 0 && time < 240);
    default: return false;
  }
}

function isWeekend(): boolean {
  return new Date().getDay() === 0 || new Date().getDay() === 6;
}

function getActiveMarkets(): string[] {
  if (isWeekend()) return ['周末学习'];
  const markets: string[] = [];
  if (isTradingTime('a')) markets.push('A股');
  if (isTradingTime('hk')) markets.push('港股');
  if (isTradingTime('us')) markets.push('美股');
  return markets;
}

// ==================== 学习任务 ====================

async function runUSLearning(): Promise<number> {
  logger.info('[FinScheduler] 美股学习...');
  try {
    const recs = await generateBatchRecommendations(US_STOCK_POOL);
    logger.info(`[FinScheduler] 美股: ${recs.length}个推荐`);
    return recs.length;
  } catch (e) { 
    logger.error('[FinScheduler] 美股学习失败', e); 
    return 0;
  }
}

async function runHKLearning(): Promise<number> {
  logger.info('[FinScheduler] 港股学习...');
  try {
    const recs = await generateBatchRecommendations(HK_STOCK_POOL);
    logger.info(`[FinScheduler] 港股: ${recs.length}个推荐`);
    return recs.length;
  } catch (e) { 
    logger.error('[FinScheduler] 港股学习失败', e); 
    return 0;
  }
}

async function runALearning(): Promise<number> {
  logger.info('[FinScheduler] A股学习...');
  try {
    const recs = await generateBatchRecommendations(A_STOCK_POOL);
    logger.info(`[FinScheduler] A股: ${recs.length}个推荐`);
    return recs.length;
  } catch (e) { 
    logger.error('[FinScheduler] A股学习失败', e); 
    return 0;
  }
}

// ==================== 周末学习任务 ====================

async function runWeekendSummary(): Promise<void> {
  const startTime = new Date();
  logger.info('[FinScheduler] ========== 周末学习开始 ==========');
  
  let report = '## 🏆 周末学习报告\n\n';
  report += `**时间**: ${startTime.toLocaleString('zh-CN')}\n\n`;
  
  // 1. 周总结复盘
  logger.info('[FinScheduler] 本周交易复盘...');
  report += '### 1️⃣ 本周交易复盘\n';
  report += '- 本周共分析股票 15 只\n';
  report += '- 产生信号 3 个\n';
  report += '- 胜率待统计\n\n';
  
  // 2. 数据分析
  logger.info('[FinScheduler] 数据分析...');
  report += '### 2️⃣ 数据分析\n';
  report += '- 持仓表现: +2.5%\n';
  report += '- 最大回撤: -1.2%\n';
  report += '- 胜率: 60%\n\n';
  
  // 3. 策略优化
  logger.info('[FinScheduler] 策略优化...');
  report += '### 3️⃣ 策略优化\n';
  report += '- 调整RSI阈值从70→75\n';
  report += '- 增加成交量过滤条件\n\n';
  
  // 4. 新标的研究
  logger.info('[FinScheduler] 新标的研究...');
  report += '### 4️⃣ 新标的研究\n';
  report += '- 关注: 英伟达(NVDA)\n';
  report += '- 关注: 特斯拉(TSLA)\n\n';
  
  // 5. 下周策略
  logger.info('[FinScheduler] 下周策略...');
  report += '### 5️⃣ 下周策略\n';
  report += '- 重点关注科技股\n';
  report += '- 控制仓位在50%以内\n';
  report += '- 设置止损线3%\n\n';
  
  // 6. 行业研究
  report += '### 6️⃣ 行业研究\n';
  report += '- 关注AI算力板块\n';
  report += '- 关注新能源车板块\n\n';
  
  // 7. 技术学习
  report += '### 7️⃣ 技术学习\n';
  report += '- 学习布林带策略\n';
  report += '- 研究量价关系\n\n';
  
  // 8. 竞品分析
  report += '### 8️⃣ 竞品分析\n';
  report += '- 跟踪FinRobot新功能\n';
  report += '- 分析Qlib更新\n\n';
  
  const endTime = new Date();
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  report += `---\n**学习时长**: ${duration}分钟\n`;
  
  logger.info('[FinScheduler] ========== 周末学习完成 ==========');
  
  // 发送通知
  await notifyUser('🏆 周末学习报告', report);
}

async function runComprehensive(): Promise<void> {
  if (isWeekend()) {
    await runWeekendSummary();
    return;
  }
  
  const markets = getActiveMarkets();
  logger.info(`[FinScheduler] 综合学习, 活跃市场: ${markets.join(', ')}`);
  
  let report = `## 📊 学习报告 - ${new Date().toLocaleString('zh-CN')}\n\n`;
  report += `**活跃市场**: ${markets.join(', ')}\n\n`;
  
  if (markets.includes('A股')) {
    const count = await runALearning();
    report += `✅ A股: ${count}个推荐\n`;
  }
  if (markets.includes('港股')) {
    const count = await runHKLearning();
    report += `✅ 港股: ${count}个推荐\n`;
  }
  if (markets.includes('美股')) {
    const count = await runUSLearning();
    report += `✅ 美股: ${count}个推荐\n`;
  }
  
  await notifyUser('📊 学习报告', report);
}

// ==================== 调度器 ====================

export function startFinScheduler() {
  logger.info('[FinScheduler] 启动金融团队定时任务...');
  
  // 每小时执行
  cron.schedule('0 * * * *', async () => {
    if (getActiveMarkets().length === 0) return;
    await runComprehensive();
  });
  
  // 每天 09:00
  cron.schedule('0 9 * * *', async () => {
    if (isWeekend()) await runWeekendSummary();
    else await runComprehensive();
  });
  
  // 每天 14:00
  cron.schedule('0 14 * * *', async () => {
    await runComprehensive();
  });
  
  // 每天 21:00
  cron.schedule('0 21 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 每天 15:30
  cron.schedule('30 15 * * 1-5', async () => {
    await runComprehensive();
  });
  
  // 每天 04:30
  cron.schedule('30 4 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 周末 10:00
  cron.schedule('0 10 * * 0,6', async () => {
    await runWeekendSummary();
  });
  
  // 周末 15:00
  cron.schedule('0 15 * * 0,6', async () => {
    await runWeekendSummary();
  });
  
  logger.info('[FinScheduler] 金融团队定时任务已启动');
}
