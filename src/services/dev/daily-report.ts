/**
 * 开发日报服务
 * 
 * 每天汇总代码修改，生成报告，待批准后提交GitHub
 */

import { logger } from '../../utils/logger';

interface DailyChange {
  time: string;
  files: string[];
  description: string;
}

const dailyChanges: DailyChange[] = [];

export function recordChange(description: string, files: string[]): void {
  dailyChanges.push({
    time: new Date().toISOString(),
    files,
    description,
  });
  logger.info(`[Daily] 记录: ${description}`);
}

export function getTodayChanges(): DailyChange[] {
  const today = new Date().toDateString();
  return dailyChanges.filter(c => new Date(c.time).toDateString() === today);
}

export function generateDailyReport(): string {
  const changes = getTodayChanges();
  
  if (changes.length === 0) {
    return '## 今日无代码修改';
  }
  
  let report = '# 今日开发报告\n\n';
  report += `日期: ${new Date().toLocaleDateString('zh-CN')}\n\n`;
  
  for (let i = 0; i < changes.length; i++) {
    report += `${i + 1}. ${changes[i].description}\n`;
    report += `   文件: ${changes[i].files.join(', ')}\n\n`;
  }
  
  report += `---\n共${changes.length}项修改`;
  
  return report;
}

export function clearTodayChanges(): void {
  const today = new Date().toDateString();
  const before = dailyChanges.filter(c => new Date(c.time).toDateString() !== today);
  dailyChanges.length = 0;
  before.forEach(c => dailyChanges.push(c));
}
