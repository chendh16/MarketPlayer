/**
 * 每日金融报告定时任务
 * 每天 02:00、09:00 和 16:00 自动生成并发送邮件报告
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { sendDailyReport } from './daily-report';

export function startDailyReportScheduler() {
  // 每天 02:00 夜间简报 (总结昨日 + 今日计划)
  cron.schedule('0 2 * * *', async () => {
    logger.info('[DailyReport] 发送夜间简报...');
    try {
      await sendDailyReport('night');
      logger.info('[DailyReport] 夜间简报发送成功');
    } catch (error) {
      logger.error('[DailyReport] 夜间简报发送失败:', error);
    }
  });

  // 每天 09:00 自动发送早报
  cron.schedule('0 9 * * *', async () => {
    logger.info('[DailyReport] 发送早报...');
    try {
      await sendDailyReport('morning');
      logger.info('[DailyReport] 早报发送成功');
    } catch (error) {
      logger.error('[DailyReport] 早报发送失败:', error);
    }
  });

  // 每天 16:00 自动发送晚报
  cron.schedule('0 16 * * *', async () => {
    logger.info('[DailyReport] 发送晚报...');
    try {
      await sendDailyReport('afternoon');
      logger.info('[DailyReport] 晚报发送成功');
    } catch (error) {
      logger.error('[DailyReport] 晚报发送失败:', error);
    }
  });

  logger.info('每日报告定时任务已启动 (09:00 & 16:00)');
}
