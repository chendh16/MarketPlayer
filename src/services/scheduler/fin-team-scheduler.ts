/**
 * 金融团队定时任务调度器
 * 
 * 增强版：每日开盘前学习、盘中分析、盘后复盘
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { generateBatchRecommendations, formatRecommendationReport } from '../backtest/daily-learning';
import { sendEmail } from '../email/mailer';

// 股票池配置
const STOCK_POOL = [
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'GOOGL', name: '谷歌' },
  { symbol: 'AMZN', name: '亚马逊' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'TSLA', name: '特斯拉' },
];

// 港股池
const HK_STOCK_POOL = [
  { symbol: '00700', name: '腾讯控股' },
  { symbol: '09988', name: '阿里巴巴' },
  { symbol: '02318', name: '平安保险' },
  { symbol: '00939', name: '建设银行' },
  { symbol: '00981', name: '中移动' },
];

// ==================== 学习任务 ====================

/**
 * 运行美股学习任务
 */
async function runUSLearning(): Promise<void> {
  logger.info('[FinScheduler] 开始美股学习...');
  try {
    const recommendations = await generateBatchRecommendations(STOCK_POOL);
    const report = formatRecommendationReport(recommendations);
    logger.info(`[FinScheduler] 美股学习完成: ${recommendations.length}个推荐`);
  } catch (error) {
    logger.error('[FinScheduler] 美股学习失败:', error);
  }
}

/**
 * 运行港股学习任务
 */
async function runHKLearning(): Promise<void> {
  logger.info('[FinScheduler] 开始港股学习...');
  try {
    // 使用港股池生成推荐
    const recommendations = await generateBatchRecommendations(HK_STOCK_POOL);
    logger.info(`[FinScheduler] 港股学习完成: ${recommendations.length}个推荐`);
  } catch (error) {
    logger.error('[FinScheduler] 港股学习失败:', error);
  }
}

/**
 * 综合学习报告
 */
async function runComprehensiveLearning(): Promise<void> {
  logger.info('[FinScheduler] 开始综合学习...');
  try {
    await runUSLearning();
    await runHKLearning();
    logger.info('[FinScheduler] 综合学习完成');
  } catch (error) {
    logger.error('[FinScheduler] 综合学习失败:', error);
  }
}

// ==================== 调度器 ====================

/**
 * 启动金融团队定时任务
 */
export function startFinScheduler() {
  logger.info('[FinScheduler] 启动金融团队定时任务...');
  
  // 1. 开盘前学习 - 每天 09:00（A股开盘前）
  cron.schedule('0 9 * * *', async () => {
    logger.info('[FinScheduler] 开盘前学习...');
    await runComprehensiveLearning();
  });
  
  // 2. 午间学习 - 每天 11:30（A股午休）
  cron.schedule('30 11 * * *', async () => {
    logger.info('[FinScheduler] 午间学习...');
    await runComprehensiveLearning();
  });
  
  // 3. 收盘后学习 - 每天 15:30（A股收盘后）
  cron.schedule('0 15 * * *', async () => {
    logger.info('[FinScheduler] 收盘后学习...');
    await runComprehensiveLearning();
  });
  
  // 4. 晚间深度学习 - 每天 20:00
  cron.schedule('0 20 * * *', async () => {
    logger.info('[FinScheduler] 晚间深度学习...');
    await runComprehensiveLearning();
  });
  
  // 5. 美股开盘前学习 - 每天 21:00
  cron.schedule('0 21 * * *', async () => {
    logger.info('[FinScheduler] 美股开盘前学习...');
    await runUSLearning();
  });
  
  // 6. 夜间复盘 - 每天 22:30
  cron.schedule('30 22 * * *', async () => {
    logger.info('[FinScheduler] 夜间复盘...');
    await runComprehensiveLearning();
  });
  
  logger.info('[FinScheduler] 金融团队定时任务已启动');
}
