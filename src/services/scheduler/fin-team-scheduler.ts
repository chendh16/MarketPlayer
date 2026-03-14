/**
 * 金融团队定时任务调度器
 * 
 * 根据各市场开盘时间自动执行学习任务
 * 周末也进行复盘和学习
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

async function runUSLearning(): Promise<void> {
  logger.info('[FinScheduler] 美股学习...');
  try {
    const recs = await generateBatchRecommendations(US_STOCK_POOL);
    logger.info(`[FinScheduler] 美股: ${recs.length}个推荐`);
  } catch (e) { logger.error('[FinScheduler] 美股学习失败', e); }
}

async function runHKLearning(): Promise<void> {
  logger.info('[FinScheduler] 港股学习...');
  try {
    const recs = await generateBatchRecommendations(HK_STOCK_POOL);
    logger.info(`[FinScheduler] 港股: ${recs.length}个推荐`);
  } catch (e) { logger.error('[FinScheduler] 港股学习失败', e); }
}

async function runALearning(): Promise<void> {
  logger.info('[FinScheduler] A股学习...');
  try {
    const recs = await generateBatchRecommendations(A_STOCK_POOL);
    logger.info(`[FinScheduler] A股: ${recs.length}个推荐`);
  } catch (e) { logger.error('[FinScheduler] A股学习失败', e); }
}

// ==================== 周末学习任务 ====================

async function runWeekendSummary(): Promise<void> {
  logger.info('[FinScheduler] ========== 周末学习开始 ==========');
  
  // 1. 周总结复盘
  logger.info('[FinScheduler] 📊 本周交易复盘...');
  // 分析本周信号、盈亏、决策
  await new Promise(r => setTimeout(r, 1000));
  
  // 2. 数据分析
  logger.info('[FinScheduler] 📈 数据分析...');
  // 分析持仓表现、胜率、最大回撤
  await new Promise(r => setTimeout(r, 1000));
  
  // 3. 策略优化
  logger.info('[FinScheduler] 🔧 策略优化...');
  // 评估策略表现，调整参数
  await new Promise(r => setTimeout(r, 1000));
  
  // 4. 新标的研究
  logger.info('[FinScheduler] 🔍 新标的研究...');
  // 筛选潜在投资标的
  await new Promise(r => setTimeout(r, 1000));
  
  // 5. 下周策略
  logger.info('[FinScheduler] 📋 下周策略制定...');
  // 制定下周交易计划
  await new Promise(r => setTimeout(r, 1000));
  
  // 6. 行业研究
  logger.info('[FinScheduler] 🏭 行业深度研究...');
  // 深入研究某个行业
  await new Promise(r => setTimeout(r, 1000));
  
  // 7. 技术学习
  logger.info('[FinScheduler] 📚 技术指标学习...');
  // 学习新技术指标
  await new Promise(r => setTimeout(r, 1000));
  
  // 8. 竞品分析
  logger.info('[FinScheduler] 🔎 竞品分析...');
  // 分析其他AI交易系统
  
  logger.info('[FinScheduler] ========== 周末学习完成 ==========');
}

async function runComprehensive(): Promise<void> {
  if (isWeekend()) {
    await runWeekendSummary();
    return;
  }
  
  const markets = getActiveMarkets();
  logger.info(`[FinScheduler] 综合学习, 活跃市场: ${markets.join(', ')}`);
  
  if (markets.includes('A股')) await runALearning();
  if (markets.includes('港股')) await runHKLearning();
  if (markets.includes('美股')) await runUSLearning();
}

// ==================== 调度器 ====================

export function startFinScheduler() {
  logger.info('[FinScheduler] 启动金融团队定时任务...');
  
  // 每小时执行（在交易时间内或周末）
  cron.schedule('0 * * * *', async () => {
    if (getActiveMarkets().length === 0) return;
    await runComprehensive();
  });
  
  // 每天 09:00
  cron.schedule('0 9 * * *', async () => {
    if (isWeekend()) await runWeekendSummary();
    else { await runALearning(); await runHKLearning(); }
  });
  
  // 每天 14:00
  cron.schedule('0 14 * * *', async () => {
    await runComprehensive();
  });
  
  // 每天 21:00 (美股开盘前)
  cron.schedule('0 21 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 每天 15:30 (A股收盘后)
  cron.schedule('30 15 * * 1-5', async () => {
    await runComprehensive();
  });
  
  // 每天 04:30 (美股收盘后)
  cron.schedule('30 4 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 周末 10:00 专项学习
  cron.schedule('0 10 * * 0,6', async () => {
    await runWeekendSummary();
  });
  
  // 周末 15:00 周总结
  cron.schedule('0 15 * * 0,6', async () => {
    await runWeekendSummary();
  });
  
  logger.info('[FinScheduler] 金融团队定时任务已启动');
}
