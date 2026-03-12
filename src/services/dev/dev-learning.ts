/**
 * 开发团队自我学习系统
 * 记录错误、总结经验、持续改进
 */

import fs from 'fs';
import path from 'path';

export interface DevLesson {
  id: string;
  title: string;
  category: 'bug' | 'architecture' | 'performance' | 'security' | 'workflow';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  solution: string;
  prevention: string;
  tags: string[];
  createdAt: Date;
  references: string[];
}

export interface WeeklySummary {
  week: string;
  completed: string[];
  learnings: string[];
  improvements: string[];
  blockers: string[];
}

/**
 * 开发经验教训记录器
 */
export class DevLessonRecorder {
  private lessons: DevLesson[] = [];
  private storagePath: string;
  
  constructor(storagePath: string = './memory/dev-lessons.json') {
    this.storagePath = storagePath;
    this.load();
  }
  
  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        this.lessons = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载经验记录失败:', e);
    }
  }
  
  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.lessons, null, 2));
    } catch (e) {
      console.error('保存经验记录失败:', e);
    }
  }
  
  /**
   * 记录一个教训
   */
  record(lesson: Omit<DevLesson, 'id' | 'createdAt'>): string {
    const id = `lesson_${Date.now()}`;
    this.lessons.push({
      ...lesson,
      id,
      createdAt: new Date(),
    });
    this.save();
    return id;
  }
  
  /**
   * 搜索相关教训
   */
  search(query: string): DevLesson[] {
    const q = query.toLowerCase();
    return this.lessons.filter(l => 
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  /**
   * 获取最近教训
   */
  recent(count: number = 10): DevLesson[] {
    return this.lessons
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, count);
  }
  
  /**
   * 按类别统计
   */
  stats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const l of this.lessons) {
      stats[l.category] = (stats[l.category] || 0) + 1;
    }
    return stats;
  }
  
  /**
   * 生成报告
   */
  report(): string {
    const stats = this.stats();
    let report = '# 开发团队学习报告\n\n';
    report += `## 经验统计\n\n`;
    for (const [cat, count] of Object.entries(stats)) {
      report += `- ${cat}: ${count}条\n`;
    }
    report += '\n## 最近教训\n\n';
    for (const l of this.recent(5)) {
      report += `### ${l.title}\n`;
      report += `- 类别: ${l.category}\n`;
      report += `- 严重程度: ${l.severity}\n`;
      report += `- 描述: ${l.description}\n`;
      report += `- 解决方案: ${l.solution}\n`;
      report += `- 预防措施: ${l.prevention}\n\n`;
    }
    return report;
  }
}

/**
 * 开发工作周报
 */
export class DevWeeklySummary {
  private summaries: WeeklySummary[] = [];
  private storagePath: string;
  
  constructor(storagePath: string = './memory/dev-weekly.json') {
    this.storagePath = storagePath;
    this.load();
  }
  
  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        this.summaries = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载周报失败:', e);
    }
  }
  
  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.summaries, null, 2));
    } catch (e) {
      console.error('保存周报失败:', e);
    }
  }
  
  /**
   * 添加周报
   */
  add(summary: Omit<WeeklySummary, 'week'>): void {
    const week = getWeekNumber(new Date());
    this.summaries.push({ ...summary, week });
    this.save();
  }
  
  /**
   * 获取本周总结
   */
  thisWeek(): WeeklySummary | undefined {
    const week = getWeekNumber(new Date());
    return this.summaries.find(s => s.week === week);
  }
  
  /**
   * 获取持续改进项
   */
  getImprovements(): string[] {
    return this.summaries.flatMap(s => s.improvements);
  }
  
  /**
   * 获取未解决阻塞项
   */
  getBlockers(): string[] {
    return this.summaries.flatMap(s => s.blockers);
  }
}

/**
 * 获取周数
 */
function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = (date.getTime() - firstDay.getTime()) / 86400000;
  return `${year}-W${Math.ceil((pastDays + firstDay.getDay() + 1) / 7)}`;
}

/**
 * 快速记录错误
 */
export function quickLesson(
  title: string,
  category: DevLesson['category'],
  description: string,
  solution: string
): void {
  const recorder = new DevLessonRecorder();
  recorder.record({
    title,
    category,
    severity: 'medium',
    description,
    solution,
    prevention: '',
    tags: [category],
    references: [],
  });
}
