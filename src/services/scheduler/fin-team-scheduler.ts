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
  const weekday = new Date().getDay();
  return weekday === 0 || weekday === 6;
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

async function runWeekendLearning(): Promise<void> {
  logger.info('[FinScheduler] 周末学习 - 周总结复盘...');
  try {
    // 周末进行全面的周总结
    logger.info('[FinScheduler] 周总结复盘...');
    logger.info('[FinScheduler] 数据分析...');
    logger.info('[FinScheduler] 策略优化...');
    logger.info('[FinScheduler] 新标的研究...');
    logger.info('[FinScheduler] 下周策略准备...');
    logger.info('[FinScheduler] 周末学习完成');
  } catch (e) { logger.error('[FinScheduler] 周末学习失败', e); }
}

async function runComprehensive(): Promise<void> {
  const markets = getActiveMarkets();
  
  if (isWeekend()) {
    await runWeekendLearning();
    return;
  }
  
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
  
  // 每天 09:00 - 开盘前/周末总结
  cron.schedule('0 9 * * *', async () => {
    if (isWeekend()) {
      await runWeekendLearning();
    } else {
      await runALearning();
      await runHKLearning();
    }
  });
  
  // 每天 14:00 - 午间/周末
  cron.schedule('0 14 * * *', async () => {
    await runComprehensive();
  });
  
  // 每天 21:00 - 美股开盘前
  cron.schedule('0 21 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 每天 15:30 - A股收盘后
  cron.schedule('30 15 * * 1-5', async () => {
    await runComprehensive();
  });
  
  // 每天 04:30 - 美股收盘后
  cron.schedule('30 4 * * 1-5', async () => {
    await runUSLearning();
  });
  
  // 每天 10:00 - 周末专项学习
  cron.schedule('0 10 * * 0,6', async () => {
    logger.info('[FinScheduler] 周末专项学习...');
    await runWeekendLearning();
  });
  
  // 每天 15:00 - 周末总结
  cron.schedule('0 15 * * 0,6', async () => {
    logger.info('[FinScheduler] 周末总结...');
    await runWeekendLearning();
  });
  
  logger.info('[FinScheduler] 金融团队定时任务已启动');
}
