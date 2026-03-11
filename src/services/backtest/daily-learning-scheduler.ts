/**
 * 金融团队每日自我学习定时任务
 * 每日运行回测 + 生成投资推荐
 */

import cron from 'node-cron';
import { generateBatchRecommendations, formatRecommendationReport, InvestmentRecommendation } from './daily-learning';
import { logger } from '../../utils/logger';
import { sendEmail } from '../email/mailer';

// 关注的股票池
const STOCK_POOL = [
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'GOOGL', name: '谷歌' },
  { symbol: 'AMZN', name: '亚马逊' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'TSLA', name: '特斯拉' },
  { symbol: 'AVGO', name: '博通' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'NFLX', name: '奈飞' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'QCOM', name: '高通' },
  { symbol: 'INTC', name: '英特尔' },
  { symbol: 'TXN', name: '德州仪器' },
  { symbol: 'AMAT', name: '应用材料' },
];

/**
 * 运行每日学习任务
 */
export async function runDailyLearning(): Promise<void> {
  logger.info('[DailyLearning] 开始每日学习任务...');
  
  try {
    // 1. 生成投资推荐
    logger.info('[DailyLearning] 分析股票池...');
    const recommendations = await generateBatchRecommendations(STOCK_POOL);
    
    if (recommendations.length === 0) {
      logger.warn('[DailyLearning] 未能生成任何推荐');
      return;
    }
    
    // 2. 过滤高置信度推荐
    const highConf = recommendations.filter(r => r.confidence >= 50);
    const mediumConf = recommendations.filter(r => r.confidence >= 30 && r.confidence < 50);
    
    logger.info(`[DailyLearning] 生成 ${recommendations.length} 个推荐 (高置信度: ${highConf.length})`);
    
    // 3. 生成报告
    const report = formatRecommendationReport(recommendations);
    
    // 4. 保存报告
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'logs', `recommendation-${new Date().toISOString().slice(0,10)}.md`);
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(reportPath, report);
    logger.info(`[DailyLearning] 报告已保存: ${reportPath}`);
    
    // 5. 发送邮件报告
    const highConfReport = formatRecommendationReport(highConf);
    if (highConf.length > 0) {
      try {
        await sendEmail({
          to: process.env.EMAIL_TO || 'user@example.com',
          subject: `📈 每日投资推荐 - ${new Date().toLocaleDateString()} (${highConf.length}个高置信度机会)`,
          html: highConfReport
            .replace(/#/g, '')
            .replace(/\*\*/g, '')
            .replace(/\n/g, '<br>')
        });
        logger.info('[DailyLearning] 邮件已发送');
      } catch(e) {
        logger.error('[DailyLearning] 邮件发送失败:', e);
      }
    }
    
    // 6. 输出到控制台
    console.log('\n' + '='.repeat(50));
    console.log('📊 每日投资推荐');
    console.log('='.repeat(50));
    console.log(`总推荐数: ${recommendations.length}`);
    console.log(`高置信度: ${highConf.length}`);
    console.log('\n🟢 买入推荐:');
    highConf.filter(r => r.type === 'long').forEach(r => {
      console.log(`  ${r.name} (${r.symbol}) - 置信度: ${r.confidence}% - 目标: +${((r.targetPrice/r.entryPrice-1)*100).toFixed(1)}%`);
    });
    console.log('\n' + '='.repeat(50));
    
  } catch(e) {
    logger.error('[DailyLearning] 任务失败:', e);
    throw e;
  }
}

/**
 * 启动每日学习定时任务
 */
export function startDailyLearning() {
  // 每天 8:00 运行
  cron.schedule('0 8 * * *', async () => {
    logger.info('[DailyLearning] 定时任务触发');
    try {
      await runDailyLearning();
    } catch(e) {
      logger.error('[DailyLearning] 定时任务失败:', e);
    }
  });
  
  logger.info('每日学习定时任务已启动 (每天 08:00)');
}

/**
 * 手动触发
 */
export async function triggerDailyLearning() {
  return runDailyLearning();
}
