/**
 * 开发团队自学习定时任务调度器
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { runTechNewsFetcher, fetchAllTechNews, generateTechBrief } from './tech-news-fetcher';
import { runDependencyAudit } from './dependency-auditor';
import { runCodeQualityCheck } from './code-quality-checker';
import { sendEmail } from '../email/mailer';

// 发送技术报告到邮箱
async function sendTechReport(report: string, type: string): Promise<void> {
  const subject = `🛠️ 技术${type} - ${new Date().toLocaleDateString('zh-CN')}`;
  
  await sendEmail({
    to: '845567595@qq.com',
    subject,
    html: `<pre style="font-size:12px;white-space:pre-wrap">${report}</pre>`
  });
}

// 启动所有开发自学习定时任务
export function startDevLearningScheduler() {
  logger.info('[DevLearning] 启动开发自学习定时任务...');
  
  // 07:30 - 技术资讯抓取
  cron.schedule('30 7 * * *', async () => {
    logger.info('[DevLearning] 执行技术资讯抓取...');
    try {
      const news = await fetchAllTechNews();
      const brief = generateTechBrief(news);
      console.log(brief);
      await sendTechReport(brief, '资讯');
      logger.info('[DevLearning] 技术资讯已发送');
    } catch (error) {
      logger.error('[DevLearning] 技术资讯抓取失败:', error);
    }
  });
  
  // 09:00 - 依赖安全检查
  cron.schedule('0 9 * * *', async () => {
    logger.info('[DevLearning] 执行依赖安全检查...');
    try {
      const report = await runDependencyAudit();
      await sendTechReport(report, '安全报告');
      logger.info('[DevLearning] 依赖安全报告已发送');
    } catch (error) {
      logger.error('[DevLearning] 依赖检查失败:', error);
    }
  });
  
  // 22:00 - 代码质量检查
  cron.schedule('0 22 * * *', async () => {
    logger.info('[DevLearning] 执行代码质量检查...');
    try {
      const result = await runCodeQualityCheck();
      let report = `# 🔧 代码质量报告\n`;
      report += `- TS错误: ${result.tsErrors}\n`;
      report += `- ESLint警告: ${result.eslintWarnings}\n`;
      
      if (result.issues.length > 0) {
        report += `\n⚠️ 问题:\n`;
        result.issues.forEach(i => report += `- ${i}\n`);
      }
      
      // 只记录，不发送（太频繁）
      logger.info(`[DevLearning] 代码质量: ${result.tsErrors}错误, ${result.eslintWarnings}警告`);
    } catch (error) {
      logger.error('[DevLearning] 代码质量检查失败:', error);
    }
  });
  
  // 周六 10:00 - 架构优化建议
  cron.schedule('0 10 * * 6', async () => {
    logger.info('[DevLearning] 执行架构分析...');
    // TODO: 实现架构分析
    logger.info('[DevLearning] 架构分析完成');
  });
  
  logger.info('[DevLearning] 开发自学习定时任务已启动');
}

// 手动触发所有任务
export async function runAllDevLearningTasks(): Promise<void> {
  logger.info('[DevLearning] 手动执行所有任务...');
  
  const news = await fetchAllTechNews();
  const brief = generateTechBrief(news);
  console.log(brief);
  
  const deps = await runDependencyAudit();
  console.log(deps);
  
  const quality = await runCodeQualityCheck();
  console.log(quality);
  
  logger.info('[DevLearning] 手动执行完成');
}
