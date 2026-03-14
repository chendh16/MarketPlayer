/**
 * 开发日报调度器
 * 
 * 每天晚上汇报今日修改，待批准后提交GitHub
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { generateDailyReport, clearTodayChanges } from '../dev/daily-report';
import { sendEmail } from '../email/mailer';

let pendingCommit = false;

/**
 * 每天 22:00 生成日报
 */
export function startDailyReporter() {
  logger.info('[DailyReporter] 启动');
  
  // 每天 22:00 生成报告
  cron.schedule('0 22 * * *', async () => {
    logger.info('[DailyReporter] 生成报告...');
    
    const report = generateDailyReport();
    
    await sendEmail({
      to: process.env.EMAIL_TO || '845567595@qq.com',
      subject: '[MarketPlayer] 今日开发报告',
      html: report.replace(/\n/g, '<br>'),
    });
    
    pendingCommit = true;
    logger.info('[DailyReporter] 报告已发送');
  });
}

/**
 * 批准提交
 */
export function approveAndCommit(): { success: boolean; message: string } {
  if (!pendingCommit) {
    return { success: false, message: '没有待提交的修改' };
  }
  
  try {
    const { execSync } = require('child_process');
    
    execSync('git add -A', { cwd: process.cwd() });
    execSync('git commit -m "feat: 日常更新"', { cwd: process.cwd() });
    execSync('git push origin main', { cwd: process.cwd() });
    
    clearTodayChanges();
    pendingCommit = false;
    
    return { success: true, message: '已提交并推送' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function hasPendingCommit(): boolean {
  return pendingCommit;
}
